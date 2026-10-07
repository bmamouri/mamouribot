/**
 * Audit MamouriBot's Task-8 trial edits. READ-ONLY — makes no edits.
 *
 *   npx tsx src/tasks/task-08/audit.ts [--limit N] [--sample K] [--seed S]
 *
 * --limit  how many of the bot's Task-8 edits to enumerate (0 = all, paged)
 * --sample deep-verify a random K of them instead of all (seeded → reproducible)
 *
 * For every Task-8 edit the bot has made, this re-fetches the parent and current
 * revisions and checks the four things that would make the run unsafe to continue:
 *
 *   1. only parameter KEYS changed — every value is byte-identical, and no
 *      article prose outside the infobox moved;
 *   2. the page actually left the unknown-parameter tracking category;
 *   3. no new Lua/template error appeared;
 *   4. no new red link appeared (reported, not failed — recovering hidden data
 *      legitimately surfaces links the author already wrote).
 */
import { apiGet, apiPost } from '../../lib/fa-wiki.js';
import { ALL_RENAMES as RENAME, LATIN_GUARDED, hasPersian } from './musician-params.js';

const CAT = 'صفحه‌هایی که از جعبه اطلاعات هنرمند موسیقی با پارامترهای نامعلوم استفاده می‌کنند';
const SUMMARY_MARK = 'جعبه اطلاعات هنرمند موسیقی';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(f: () => Promise<T>): Promise<T> {
  for (let a = 0; ; a++) {
    try { return await f(); } catch (e) { if (a >= 5) throw e; await sleep(15000 + a * 10000); }
  }
}

/** Top-level `key = value` pairs of every musical-artist call, in order. */
export function params(text: string): Array<[string, string]> {
  const names = ['جعبه اطلاعات هنرمند موسیقی', 'Infobox musical artist', 'Infobox musician', 'Infobox Musical Artist', 'هنرمند موسیقی', 'اطلاعات هنرمند موسیقی'];
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`\\{\\{\\s*(?:${alt})\\s*[|}]`, 'giu');
  const out: Array<[string, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index;
    while (i < text.length) {
      if (text.startsWith('{{', i)) { depth++; i += 2; continue; }
      if (text.startsWith('}}', i)) { depth--; i += 2; if (depth === 0) break; continue; }
      i++;
    }
    const body = text.slice(m.index + 2, i - 2);
    let d = 0, cur = '', k = 0; const chunks: string[] = [];
    while (k < body.length) {
      const two = body.slice(k, k + 2);
      if (two === '{{' || two === '[[') { d++; cur += two; k += 2; continue; }
      if (two === '}}' || two === ']]') { d--; cur += two; k += 2; continue; }
      if (body[k] === '|' && d === 0) { chunks.push(cur); cur = ''; k++; continue; }
      cur += body[k]; k++;
    }
    chunks.push(cur);
    for (const c of chunks.slice(1)) {
      const eq = c.indexOf('=');
      if (eq >= 0) out.push([c.slice(0, eq).trim(), c.slice(eq + 1).trim()]);
    }
    re.lastIndex = i;
  }
  return out;
}

/**
 * Everything outside any infobox call — must be untouched.
 * Uses a balanced-brace scan, NOT a regex: an earlier `[\s\S]*?\n\}\}` version
 * required the closing braces on their own line, so a single-line call
 * (`{{Infobox musical artist|Name=…|genre=…}}`) was never masked and every such
 * article was falsely reported as "prose changed".
 */
export function outsideBoxes(text: string): string {
  const names = ['جعبه اطلاعات هنرمند موسیقی', 'Infobox musical artist', 'Infobox musician', 'Infobox Musical Artist', 'هنرمند موسیقی', 'اطلاعات هنرمند موسیقی'];
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`\\{\\{\\s*(?:${alt})\\s*[|}]`, 'giu');
  let out = '', last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index;
    while (i < text.length) {
      if (text.startsWith('{{', i)) { depth++; i += 2; continue; }
      if (text.startsWith('}}', i)) { depth--; i += 2; if (depth === 0) break; continue; }
      i++;
    }
    out += text.slice(last, m.index) + '§BOX§';
    last = i; re.lastIndex = i;
  }
  return out + text.slice(last);
}

/** Unknown-parameter names the template flags, per revision's wikitext.
 *  NB: this must be a preview-mode parse (`text=`) — on a LIVE page the module
 *  emits only the tracking category, not the «پارامتر نامعلوم» message. */
async function flaggedUnknown(title: string, wikitext: string): Promise<string[]> {
  return retry(async () => {
    const d = await apiPost({ action: 'parse', title, text: wikitext, contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1' });
    if (!d.parse) throw new Error('noparse');
    const vis = String(d.parse.text).replace(/<[^>]+>/g, ' ');
    return [...vis.matchAll(/پارامتر نامعلوم «([^»]*)»/g)].map((m) => m[1]);
  });
}

async function render(title: string, revid?: number) {
  return retry(async () => {
    const p: any = { action: 'parse', prop: 'text|categories', disablelimitreport: '1' };
    if (revid) p.oldid = String(revid); else p.page = title;
    const d = await apiGet(p);
    if (!d.parse) throw new Error('noparse');
    const cats = (d.parse.categories ?? []).map((c: any) => String(c.category).replace(/_/g, ' '));
    const h = String(d.parse.text).replace(/<style[\s\S]*?<\/style>/g, '');
    return {
      tracked: cats.includes(CAT),
      lua: (h.match(/scribunto-error/g) || []).length,
      err: (h.match(/class="[^"]*\berror\b[^"]*"/g) || []).length,
      reds: [...h.matchAll(/<a[^>]*redlink=1[^>]*>([^<]*)</g)].map((m) => m[1]),
    };
  });
}

/** Deterministic PRNG so a reported sample can be reproduced exactly. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const num = (flag: string, def: number) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
  };
  const limit = num('--limit', 0);       // 0 = enumerate every Task-8 edit
  const sample = num('--sample', 0);     // 0 = verify all enumerated
  const seed = num('--seed', 20260927);

  // enumerate (paged) — usercontribs caps at 500 per request
  const edits: any[] = [];
  let cont: string | undefined;
  do {
    const p: Record<string, string> = {
      action: 'query', list: 'usercontribs', ucuser: 'MamouriBot',
      uclimit: '500', ucnamespace: '0', ucprop: 'ids|title|timestamp|comment',
    };
    if (cont) p.uccontinue = cont;
    const uc = await retry(() => apiGet(p));
    for (const c of uc.query?.usercontribs ?? []) {
      if (String(c.comment).includes(SUMMARY_MARK)) edits.push(c);
    }
    cont = uc.continue?.uccontinue;
    if (limit && edits.length >= limit) break;
    await sleep(600);
  } while (cont);
  if (limit) edits.length = Math.min(edits.length, limit);

  console.log(`Task-8 edits enumerated: ${edits.length}`);
  let work = edits;
  if (sample && sample < edits.length) {
    const rnd = mulberry32(seed);
    const pool = [...edits];
    work = [];
    for (let i = 0; i < sample && pool.length; i++) {
      work.push(...pool.splice(Math.floor(rnd() * pool.length), 1));
    }
    console.log(`random sample: ${work.length} (seed ${seed})`);
  }
  console.log('');
  if (!work.length) { console.log('هیچ ویرایشی برای بازبینی نیست.'); return; }

  let ok = 0; const problems: string[] = [];
  let redDelta = 0, clearedCat = 0;

  for (const e of work) {
    const d = await retry(() => apiGet({
      action: 'query', prop: 'revisions', revids: `${e.revid}|${e.parentid}`,
      rvprop: 'ids|content', rvslots: 'main',
    }));
    const byId = new Map<number, string>();
    for (const pg of d.query.pages) for (const r of pg.revisions ?? []) byId.set(r.revid, r.slots.main.content);
    const before = byId.get(e.parentid), after = byId.get(e.revid);
    if (!before || !after) { problems.push(`${e.title}: نسخه‌ها خوانده نشد`); continue; }

    const issues: string[] = [];

    // 1a. every surviving value byte-identical, and no value invented
    const vb = params(before).map(([, v]) => v).filter((v) => v !== '');
    const va = params(after).map(([, v]) => v).filter((v) => v !== '');
    if (valueKey(before) !== valueKey(after)) {
      const lost = vb.filter((v) => !va.includes(v));
      const gained = va.filter((v) => !vb.includes(v));
      if (lost.length || gained.length) issues.push(`مقدار تغییر کرد (از دست‌رفته ${lost.length}، تازه ${gained.length})`);
    }
    // 1b. nothing outside the infobox moved
    if (outsideBoxes(before) !== outsideBoxes(after)) issues.push('متن بیرون از جعبه تغییر کرد');
    // 1c. no signature expansion
    if (/Mamouri.*بحث.*\d{4}/.test(after.slice(0, 4000)) && !/Mamouri/.test(before.slice(0, 4000))) issues.push('امضا در متن ظاهر شد');

    const fb = await flaggedUnknown(e.title, before); await sleep(2500);
    const fa_ = await flaggedUnknown(e.title, after); await sleep(2500);
    // A Latin-guarded key (Name with a Latin-only value) is INTENTIONALLY left
    // unknown — renaming it would replace the Persian infobox header with English.
    const guardedLeft = new Set(
      params(after).filter(([k, v]) => LATIN_GUARDED.has(k) && !hasPersian(v)).map(([k]) => k)
    );
    const inScopeLeft = fa_.filter((k) => k in RENAME && !guardedLeft.has(k));
    const newlyFlagged = fa_.filter((k) => !fb.includes(k));
    if (inScopeLeft.length) issues.push(`پارامتر در دامنه هنوز ناشناخته است: ${inScopeLeft.join('، ')}`);
    if (newlyFlagged.length) issues.push(`پارامتر ناشناختهٔ تازه: ${newlyFlagged.join('، ')}`);
    const outOfScope = fa_.filter((k) => !(k in RENAME) || guardedLeft.has(k));

    const rb = await render(e.title, e.parentid); await sleep(3000);
    const ra = await render(e.title, e.revid);
    if (rb.tracked && !ra.tracked) clearedCat++;
    else if (rb.tracked && ra.tracked && outOfScope.length === 0) issues.push('در ردهٔ ردیابی مانده بی‌آنکه پارامتر خارج از دامنه داشته باشد');
    if (ra.lua > rb.lua) issues.push(`خطای پودمان ${rb.lua}→${ra.lua}`);
    if (ra.err > rb.err) issues.push(`خطای الگو ${rb.err}→${ra.err}`);
    const dRed = ra.reds.length - rb.reds.length;
    redDelta += dRed;

    if (issues.length) { problems.push(`${e.title}: ${issues.join(' | ')}`); console.log(`✗ ${e.title} — ${issues.join(' | ')}`); }
    else { ok++; console.log(`✓ ${e.title}${dRed ? `  (+${dRed} پیوند سرخ)` : ''}${outOfScope.length ? `  [خارج از دامنه می‌ماند: ${outOfScope.join('، ')}]` : ''}`); }
    await sleep(3000);
  }

  console.log(`\n=== ${work.length} ویرایش بازبینی شد (از ${edits.length}) ===`);
  console.log(`سالم                 : ${ok}`);
  console.log(`از ردهٔ ردیابی خارج شد: ${clearedCat}  (بقیه پارامتر خارج از دامنه دارند — طبیعی است)`);
  console.log(`پیوند سرخ تازه (خالص): ${redDelta}`);
  console.log(`مشکل‌دار             : ${problems.length}`);
  for (const p of problems) console.log('   ! ' + p);
  console.log(problems.length ? '\nنتیجه: پیش از اجرای کامل بررسی کنید.' : '\nنتیجه: اجرای کامل بی‌اشکال است.');
  process.exit(problems.length ? 1 : 0);
}

/** The non-empty values in order — the audit's equality key. */
export const valueKey = (t: string) => JSON.stringify(params(t).map(([, v]) => v).filter((v) => v !== ''));

// only run the audit when invoked directly, so the comparators can be unit-tested
if (process.argv[1]?.endsWith('audit-task8.ts')) main();
