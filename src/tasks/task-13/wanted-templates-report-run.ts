/** The networked half of the missing-templates report. See `wanted-templates-report.ts`. */
import { Bot } from '../../core.js';
import { queryRows } from '../../lib/replica.js';
import { publishReport, requireRows } from './ac-moves-report-run.js';
import {
  WANTED_TEMPLATES_PAGE, buildWanted, callerOverlapSql, callersSql, coOccurrence,
  enArticleIdsSql, enArticleTemplatesSql, enCounterpartsSql, enTemplatesSql, faPresentSql,
  faTemplatesSql, hasPersian, isStubName, lastEvents, logSql, nearName, normName, wantedSql,
  type Hint, type WantedRow,
} from './wanted-templates-report.js';

const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const SAMPLE_PER_TEMPLATE = 60;

async function all(sqls: string[], wiki: 'fa' | 'en') {
  const out: Record<string, string>[] = [];
  for (const s of sqls) out.push(...await queryRows(s, { wiki, allowEmpty: true }));
  return out;
}

export async function collectWanted(): Promise<WantedRow[]> {
  const top = await queryRows(wantedSql(), { wiki: 'fa' });
  console.log(`${top.length} الگوی ناموجود؛ بیشینه ${top[0].n} مقاله`);
  const ids = top.map(r => r.lt_id);
  const titles = top.map(r => r.lt_title);

  // Existing templates that call a missing one, and how many of its articles they explain.
  const callerRows = await queryRows(callersSql(ids), { wiki: 'fa', allowEmpty: true });
  const callerNames = [...new Set(callerRows.map(r => r.page_title))];
  const overlap = new Map<string, { title: string; articles: number }[]>();
  for (const batch of chunk(callerNames, 200)) {
    for (const r of await queryRows(callerOverlapSql(ids, batch), { wiki: 'fa', allowEmpty: true })) {
      if (!overlap.has(r.mid)) overlap.set(r.mid, []);
      overlap.get(r.mid)!.push({ title: r.caller, articles: Number(r.k) });
    }
  }
  const declared = new Set(callerRows.map(r => `${r.tl_target_id}\t${r.page_title}`));

  const events = lastEvents(await all(chunk(titles, 500).map(logSql), 'fa'));
  const faTemplates = new Set((await queryRows(faTemplatesSql, { wiki: 'fa' })).map(r => r.page_title));
  const byNorm = new Map<string, string[]>();
  for (const t of faTemplates) {
    const k = normName(t);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k)!.push(t);
  }

  // en.wikipedia pages of the same name, redirects followed one step.
  const enRows = await all(chunk(titles, 500).map(enTemplatesSql), 'en');
  const redirTargets = [...new Set(enRows.filter(r => r.rd_title && r.rd_namespace === '10').map(r => r.rd_title))];
  const enTargets = new Map((await all(chunk(redirTargets, 500).map(enTemplatesSql), 'en')).map(r => [r.page_title, r]));
  const faOf = (ll: string) => {
    const t = ll.replace(/^[^:]+:/, '').replace(/ /g, '_');
    return ll && faTemplates.has(t) ? t : undefined;
  };
  const enSame = new Map<string, { en: string; faEquivalent?: string }>();
  for (const r of enRows) {
    const target = r.rd_title && r.rd_namespace === '10' ? enTargets.get(r.rd_title) : r;
    if (!target) continue;
    enSame.set(r.page_title, { en: target.page_title, faEquivalent: faOf(target.ll_title) });
  }

  const rows: WantedRow[] = top.map(r => {
    const hints: Hint[] = [];
    const ev = events.get(r.lt_title);
    const same = enSame.get(r.lt_title);
    if (same) hints.push({ kind: 'en-same', ...same });
    if (ev?.type === 'move' && ev.target) {
      const to = ev.target.replace(/^الگو:/, '').replace(/ /g, '_');
      if (faTemplates.has(to)) hints.push({ kind: 'moved', to });
    }
    const near = nearName(r.lt_title, byNorm);
    if (near && !hints.some(h => 'faEquivalent' in h && h.faEquivalent === near)) hints.push({ kind: 'near', fa: near });
    const callers = (overlap.get(r.lt_id) ?? [])
      .filter(c => declared.has(`${r.lt_id}\t${c.title}`) && c.articles * 10 >= Number(r.n))
      .sort((a, b) => b.articles - a.articles).slice(0, 3);
    return {
      title: r.lt_title, articles: Number(r.n), callers, hints,
      deleted: ev?.type === 'delete' ? ev.ts : undefined,
    };
  });

  await addCoOccurrence(rows, ids, faTemplates);
  return rows;
}

/**
 * The co-occurrence guess, only for Persian-named templates with no other lead and not
 * explained by a caller. See the header in `wanted-templates-report.ts`.
 */
async function addCoOccurrence(rows: WantedRow[], ids: string[], faTemplates: Set<string>) {
  const wanted = new Map(rows.map((r, i) => [ids[i], r]));
  const need = ids.filter(id => {
    const r = wanted.get(id)!;
    return hasPersian(r.title) && !r.hints.length && !r.callers.length;
  });
  if (!need.length) return;
  const uses = new Map<string, { fa: string; en: string }[]>();
  for (const batch of chunk(need, 200)) {
    for (const u of await queryRows(enCounterpartsSql(batch), { wiki: 'fa', allowEmpty: true })) {
      const l = uses.get(u.tl_target_id) ?? [];
      if (l.length < SAMPLE_PER_TEMPLATE) l.push({ fa: u.tl_from, en: u.ll_title.replace(/ /g, '_') });
      uses.set(u.tl_target_id, l);
    }
  }
  const enTitles = [...new Set([...uses.values()].flat().map(u => u.en))];
  const enId = new Map<string, string>();
  for (const b of chunk(enTitles, 1000)) {
    for (const r of await queryRows(enArticleIdsSql(b), { wiki: 'en', allowEmpty: true })) enId.set(r.page_title, r.page_id);
  }
  const enTpl = new Map<string, Set<string>>();
  for (const b of chunk([...enId.values()], 500)) {
    for (const r of await queryRows(enArticleTemplatesSql(b), { wiki: 'en', allowEmpty: true })) {
      if (!enTpl.has(r.tl_from)) enTpl.set(r.tl_from, new Set());
      enTpl.get(r.tl_from)!.add(r.lt_title);
    }
  }
  const docFreq = new Map<string, number>();
  for (const s of enTpl.values()) for (const t of s) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  console.log(`هم‌رخدادی: ${need.length} الگو، ${enTpl.size} مقالهٔ انگلیسی`);

  const picks = new Map<string, ReturnType<typeof coOccurrence>[number]>();
  for (const id of need) {
    const sets = (uses.get(id) ?? []).map(u => enTpl.get(enId.get(u.en) ?? '')).filter((s): s is Set<string> => !!s);
    const best = coOccurrence(sets, docFreq, enTpl.size, isStubName(wanted.get(id)!.title))[0];
    if (best) picks.set(id, best);
  }
  // fa equivalents of the picks, and whether those are already on the same articles.
  const enRows = await all(chunk([...new Set([...picks.values()].map(p => p.en))], 500).map(enTemplatesSql), 'en');
  const faEq = new Map<string, string>();
  for (const r of enRows) {
    const t = r.ll_title?.replace(/^[^:]+:/, '').replace(/ /g, '_');
    if (t && faTemplates.has(t)) faEq.set(r.page_title, t);
  }
  const eqTitles = [...new Set(faEq.values())];
  const articleIds = [...new Set([...picks.keys()].flatMap(id => (uses.get(id) ?? []).map(u => u.fa)))];
  const present = new Set<string>();
  if (eqTitles.length) {
    for (const b of chunk(articleIds, 1000)) {
      for (const r of await queryRows(faPresentSql(b, eqTitles), { wiki: 'fa', allowEmpty: true })) present.add(`${r.tl_from}\t${r.lt_title}`);
    }
  }
  for (const [id, p] of picks) {
    const eq = faEq.get(p.en);
    const arts = (uses.get(id) ?? []).map(u => u.fa);
    if (eq && arts.filter(a => present.has(`${a}\t${eq}`)).length * 2 >= arts.length) continue;
    wanted.get(id)!.hints.push({ kind: 'co', en: p.en, support: p.support, of: p.of, faEquivalent: eq });
  }
}

export async function runWantedTemplatesReport(argv: string[]) {
  const live = argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });
  const rows = await collectWanted();
  requireRows(rows.length, 500);
  const text = buildWanted(rows);
  await publishReport(bot, WANTED_TEMPLATES_PAGE, text, text,
    'به‌روزرسانی فهرست الگوهای ناموجود پرکاربرد در مقاله‌ها', live, { quiet: argv.includes('--quiet') });
}
