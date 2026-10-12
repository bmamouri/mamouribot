/**
 * Differential check: this TypeScript detector against the Python research prototype,
 * over the same 2,000 real articles.
 *
 *   npx tsx src/tasks/task-15/source-detect.replay.ts [--limit N]
 *
 * Named `.replay.ts` so `npm test` skips it: it needs the network. It exists because
 * `docs/BUILDING-A-TASK.md` §4 is explicit that unit tests do not catch a port whose
 * regex anchors differently between the two languages — which is exactly what happened
 * here, twice, with JavaScript's ASCII-only `\b`.
 *
 * Expect two kinds of deliberate disagreement, both reported separately from genuine
 * mismatches:
 *
 * - **genref_lines** under «جستارهای وابسته» / «See also». The prototype counted any long
 *   bullet there as a general reference; §12.1 says the port should not, because a
 *   see-also entry is a wikilink and counting it would block a correct {{بدون منبع}}.
 * - **strict** on pages whose only ref is a یادکرد-ویکی. The prototype required
 *   `refs == 0`; §1.9 says یادکرد-ویکی is not a source, so this port treats those as
 *   unsourced. §0.5 confirms they are meant to be in the population.
 *
 * Anything else is a bug in the port. In particular `onlyPrototype` must stay at zero:
 * a page the prototype called sourced and this port calls unsourced would be a false
 * {{بدون منبع}}.
 */
import { Bot } from '../../core.js';
import { sourceFeatures, isStrictUnsourced, type SourceFeatures } from './source-detect.js';
import rows from '../../../docs/data/task-15/random-2000.json' with { type: 'json' };

interface Row extends SourceFeatures { title: string; list: boolean; dab: boolean; blp: boolean }

/** When `random-2000.json` was measured (§0 of the task doc). */
const MEASURED_AT = '2026-10-10T23:59:59Z';

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** The prototype's own STRICT rule, reproduced for comparison. */
const prototypeStrict = (r: Row) =>
  r.refs === 0 && r.sfn === 0 && r.cite_outside === 0 && r.http === 0 &&
  r.genref_lines === 0 && !r.isbn && !r.list;

async function main() {
  const all = rows as unknown as Row[];
  const limit = Number(arg('--limit') ?? 0);
  const sample = limit ? all.slice(0, limit) : all;
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });

  const text = new Map<string, string>();
  const drifted = new Set<string>();
  for (let i = 0; i < sample.length; i += 50) {
    const batch = sample.slice(i, i + 50);
    const r = await bot.apiGet({
      action: 'query', prop: 'revisions', rvprop: 'content|timestamp', rvslots: 'main',
      titles: batch.map(b => b.title).join('|'),
    });
    for (const p of r.query.pages ?? []) {
      const rev = p.revisions?.[0];
      const c = rev?.slots?.main?.content;
      if (!c) continue;
      // The fixture is a snapshot. A page edited since then is not evidence about the
      // port: «شوگرلند اکسپرس» went from 2 URLs to 8 because somebody expanded it the
      // next day. Comparing against it would be chasing other people's edits.
      if (rev.timestamp && rev.timestamp > MEASURED_AT) { drifted.add(p.title); continue; }
      text.set(p.title, c);
    }
    if (i % 500 === 0) console.log(`  ${i}/${sample.length}`);
  }

  const FIELDS: (keyof SourceFeatures)[] =
    ['refs', 'refs_real', 'refs_ykw_only', 'ykw', 'cite_outside', 'sfn', 'http', 'genref_lines', 'isbn'];
  const mismatch: Record<string, { n: number; examples: string[] }> = {};
  FIELDS.forEach(f => (mismatch[f] = { n: 0, examples: [] }));

  let compared = 0, missing = 0;
  let agree = 0, onlyPrototype = 0, onlyMine = 0;
  const onlyMineNotYkw: string[] = [];
  const onlyPrototypeExamples: string[] = [];
  const httpUndercount: string[] = [];

  for (const row of sample) {
    const wt = text.get(row.title);
    if (wt === undefined) { missing++; continue; }   // absent or edited since
    compared++;
    const mine = sourceFeatures(wt);
    if (typeof mine.http === 'number' && mine.http < row.http) httpUndercount.push(row.title);
    for (const f of FIELDS) {
      if (mine[f] !== row[f]) {
        mismatch[f].n++;
        if (mismatch[f].examples.length < 4) {
          mismatch[f].examples.push(`${row.title} (prototype ${row[f]}, port ${mine[f]})`);
        }
      }
    }
    const a = prototypeStrict(row), b = isStrictUnsourced(mine) && !row.list;
    if (a && b) agree++;
    else if (a && !b) { onlyPrototype++; if (onlyPrototypeExamples.length < 6) onlyPrototypeExamples.push(row.title); }
    else if (!a && b) {
      onlyMine++;
      // Two differences are intended, and anything else is a bug:
      //   1. the page's only refs are یادکرد-ویکی (§1.9),
      //   2. the prototype's ONLY reason for calling it sourced was a general-reference
      //      line, which on these pages is a see-also wikilink (§12.1).
      // Widened ۱۲ اکتبر ۲۰۲۶ after the «مولکول» revert: a reference that cites only the
      // فرهنگستان word list, or only another Wikipedia, supports nothing the article
      // says. The prototype counted both as sources, so the port is now strict on pages
      // it called sourced — deliberately.
      const ykwOnly = mine.refs > 0 && mine.refs_sourcing === 0;
      const genrefOnly = row.genref_lines > 0 && row.refs === 0 && row.sfn === 0 &&
        row.cite_outside === 0 && row.http === 0 && !row.isbn;
      // …or the prototype's only evidence was a citation template / URL that the
      // content-sourcing rule rejects.
      const nonSourcingOnly = mine.refs_sourcing === 0 && mine.cite_outside_sourcing === 0 &&
        mine.http_external === 0 && mine.genref_sourcing === 0;
      if (!ykwOnly && !genrefOnly && !nonSourcingOnly) onlyMineNotYkw.push(row.title);
    }
  }

  console.log(`\ncompared ${compared} pages `
    + `(${drifted.size} edited since the fixture, ${missing - drifted.size} unfetchable)\n`);
  console.log('per-field disagreement with the prototype:');
  for (const f of FIELDS) {
    const m = mismatch[f];
    const explained = ['cite_outside', 'sfn', 'isbn', 'genref_lines', 'http'].includes(f);
    const flag = m.n === 0 ? '✓' : (explained ? '~' : '✗');
    console.log(`  ${flag} ${f.padEnd(14)} ${String(m.n).padStart(5)}`);
    m.examples.forEach(e => console.log(`        ${e}`));
  }

  console.log('\nSTRICT unsourced:');
  console.log(`  both agree            ${agree}`);
  console.log(`  only the port         ${onlyMine}   (expected: یادکرد-ویکی-only pages)`);
  console.log(`  only the prototype    ${onlyPrototype}   (MUST be 0)`);
  onlyPrototypeExamples.forEach(t => console.log(`        ${t}`));
  if (onlyMineNotYkw.length) {
    console.log(`  port-only but NOT یادکرد-ویکی-only: ${onlyMineNotYkw.length}`);
    onlyMineNotYkw.slice(0, 8).forEach(t => console.log(`        ${t}`));
  }

  // The gate is on the DECISION, not on the intermediate counts. Four fields disagree
  // for understood reasons, verified page by page on ۱۲ اکتبر ۲۰۲۶ and none of them able
  // to turn a sourced page into an unsourced one:
  //   cite_outside, sfn — the prototype counted citation templates INSIDE <ref> as well
  //     as outside («امانت‌خان شیرازی»: 2 citations, both inside its 2 refs). Those pages
  //     are sourced by the refs regardless.
  //   isbn            — the prototype missed a {{شابک}} inside a ref body; the port sees
  //     it, which can only make the port more conservative.
  //   genref_lines    — the see-also refinement of §12.1.
  // refs / refs_real / refs_ykw_only / ykw / http have no licence to differ.
  // `http` may differ only in the safe direction. A URL the port MISSES can produce a
  // false {{بدون منبع}}; one it counts spuriously only makes it skip a page. Both
  // remaining disagreements are the port counting more, and both are the port being
  // right: «مدیریت محتوای سازمانی» cites `Http://www.kaajsoft.ir` with a capital H,
  // which the prototype's case-sensitive regex missed.
  const EXACT: (keyof SourceFeatures)[] = ['refs', 'refs_real', 'refs_ykw_only', 'ykw'];
  const bad = onlyPrototype > 0 || onlyMineNotYkw.length > 0 ||
    EXACT.some(f => mismatch[f].n > 0) || httpUndercount.length > 0;
  if (httpUndercount.length) {
    console.log(`\n  URLs MISSED by the port (unsafe): ${httpUndercount.length}`);
    httpUndercount.slice(0, 8).forEach(t => console.log(`        ${t}`));
  }
  if (bad) { console.error('\nREPLAY FAILED'); process.exit(1); }
  console.log('\nREPLAY OK');
}

main().catch(e => { console.error(e); process.exit(1); });
