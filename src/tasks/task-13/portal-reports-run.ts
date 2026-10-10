/**
 * The networked half of وظیفهٔ ۱۳'s portal reports. Pure table building, the SQL and the
 * exclusion list all live in `portal-reports.ts`, which is what the tests load.
 */
import { Bot } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import {
  CANDIDATES_PAGE, POPULAR_PAGE, buildCandidates, buildPopular, enPortals, faPortals,
  monthWindow, pageviews, signaturePage,
  type CandidateRow, type PopularRow,
} from './portal-reports.js';

const n = (v: string) => Number(v) || 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** en article title → fa article title, in batches, following redirects back. */
async function faTopics(bot: Bot, titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGetOn('https://en.wikipedia.org/w/api.php', {
      action: 'query', titles: titles.slice(i, i + 50).join('|'),
      prop: 'langlinks', lllang: 'fa', lllimit: '500', redirects: '1',
    });
    const q = d.query ?? {};
    // The API answers under the title it RESOLVED to; map back to what we asked for, or
    // a redirect's target silently becomes the key and the lookup misses.
    const back = new Map<string, string>([
      ...(q.redirects ?? []).map((x: any) => [x.to, x.from] as [string, string]),
      ...(q.normalized ?? []).map((x: any) => [x.to, x.from] as [string, string]),
    ]);
    for (const p of q.pages ?? []) {
      const ll = p.langlinks?.[0]?.title;
      if (ll) out.set(back.get(p.title) ?? p.title, ll);
    }
  }
  return out;
}

/** Which of these درگاه:<x> titles fa actually has. */
async function livePortals(bot: Bot, titles: string[]): Promise<Set<string>> {
  const live = new Set<string>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', titles: titles.slice(i, i + 50).join('|'),
      prop: 'info', redirects: '1' });
    for (const p of d.query?.pages ?? []) if (!('missing' in p)) live.add(p.title);
    // A followed redirect means the title we ASKED for exists too.
    for (const r of d.query?.redirects ?? []) live.add(r.from);
  }
  return live;
}

async function publish(bot: Bot, page: string, text: string, live: boolean) {
  // `~~~~~` is a signature the gate would flag; it is deliberate here and MediaWiki
  // substitutes it to a bare timestamp on save.
  const problems = checkWikitext(page, text).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (!live) {
    console.log(`\n===== ${page} =====\n${text.slice(0, 1200)}\n… (${text.length} bytes)`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: page,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(page, text, 'به‌روزرسانی گزارش درگاه‌ها',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${page}`);
  // وپ:گد reads «آخرین به‌روزرسانی» from this subpage, not from the page history.
  const sig = signaturePage(page);
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig,
    rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp,
    { allowCreate: true });
}

export async function runPortalReports(argv: string[]) {
  const live = argv.includes('--live');
  const only = argv[argv.indexOf('--only') + 1];
  const want = (k: string) => !argv.includes('--only') || only === k;
  // flagEdits: false — report pages meant to be seen, exactly as the move report.
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });
  const w = monthWindow();
  console.log(`بازهٔ آمار: ${w.start}..${w.end}`);

  if (want('popular')) {
    const db = await faPortals();
    console.log(`${db.length} درگاه فارسی`);
    const rows: PopularRow[] = [];
    for (const [i, r] of db.entries()) {
      const title = `درگاه:${r.portal}`;
      const v = await pageviews('fa.wikipedia', title, w.start, w.end);
      rows.push({ portal: title, views: v.total, perMonth: v.perMonth,
        links: n(r.links_from_articles), subpages: n(r.subpages), bytes: n(r.bytes),
        revisions: n(r.revisions), editors: n(r.distinct_editors), lastEdit: r.last_edit });
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${db.length}`);
      await sleep(120);
    }
    rows.sort((a, b) => b.views - a.views);
    await publish(bot, POPULAR_PAGE, buildPopular(rows, w.label), live);
  }

  if (want('candidates')) {
    const db = await enPortals();
    console.log(`${db.length} درگاه انگلیسی بدون پیوند فارسی (پس از کنارگذاشتن موارد مستثنا)`);
    const views = new Map<string, { total: number; perMonth: number }>();
    for (const [i, r] of db.entries()) {
      views.set(r.portal, await pageviews('en.wikipedia', `Portal:${r.portal}`, w.start, w.end));
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${db.length}`);
      await sleep(120);
    }
    const topic = await faTopics(bot, db.map(r => r.portal));
    console.log(`  ${topic.size} موضوع مقالهٔ فارسی دارد`);
    const guess = new Map([...topic].map(([en, faName]) => [`درگاه:${faName}`, en]));
    const liveSet = await livePortals(bot, [...guess.keys()]);
    // Existing portals (redirects included: درگاه:زبان‌شناسی → درگاه:زبان) are dropped
    // from the candidates and NOT listed. The old «no interwiki» section was removed on
    // ۱۱ اکتبر ۲۰۲۶ once the operator linked them by hand. What it would keep finding
    // is redirects, which Wikidata cannot link separately, so it is noise.
    const already = new Set<string>();
    for (const [portal, en] of guess) if (liveSet.has(portal)) already.add(en);
    console.log(`  ${already.size} نامزد در فارسی از پیش هست (کنار گذاشته شد)`);

    const rows: CandidateRow[] = db
      .filter(r => !already.has(r.portal))
      .map(r => ({ portal: r.portal, views: views.get(r.portal)!.total,
        perMonth: views.get(r.portal)!.perMonth, faTopic: topic.get(r.portal) ?? '',
        links: n(r.links_from_articles), subpages: n(r.subpages), bytes: n(r.bytes),
        interwikis: n(r.interwikis), lastEdit: r.last_edit }))
      .sort((a, b) => b.views - a.views);
    await publish(bot, CANDIDATES_PAGE, buildCandidates(rows, w.label), live);
  }
}
