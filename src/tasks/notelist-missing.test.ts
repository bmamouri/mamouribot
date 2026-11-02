/**
 * Offline unit tests for the task-06 wiring itself (transform() dispatch + the
 * namespace allowlist), as opposed to the classifier rules covered by
 * ../lib/notelist.test.ts. No network, runs in `npm test`.
 *
 * The incident this guards against: TARGET_NAMESPACES was widened to templates
 * (10), project pages (4) and a few others on 2026-11-01 — matching the full
 * whitelist {{Broken ref}} itself categorizes into — and broke on its first run,
 * putting MamouriBot into a 4-round edit war with two human editors over
 * الگو:یادچپ. The namespace list was reverted to just ['0', '118'], and
 * classify()'s own <includeonly>/<noinclude> guard (tested in notelist.test.ts)
 * is the namespace-independent backstop. This file pins both: the allowlist
 * itself, AND that transform() actually routes a template-shaped page to
 * manualReview rather than writing to it.
 */
import { notelistMissingTask, seedBrokenGroups, TARGET_NAMESPACES } from './task-06/notelist-missing.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

// ---- the namespace allowlist itself ----
{
  check('ns 0 (articles) is allowed', TARGET_NAMESPACES.includes('0'));
  check('ns 118 (پیش‌نویس drafts) is allowed', TARGET_NAMESPACES.includes('118'));
  check('ns 10 (الگو templates) is NOT allowed — see the 2026-11-01 incident',
    !TARGET_NAMESPACES.includes('10'));
  check('ns 4 (ویکی‌پدیا project pages) is NOT allowed — held a literal test-case string',
    !TARGET_NAMESPACES.includes('4'));
  check('ns 14 (رده) is NOT allowed', !TARGET_NAMESPACES.includes('14'));
  check('ns 6 (پرونده) is NOT allowed', !TARGET_NAMESPACES.includes('6'));
}

// ---- transform() must defer, never edit, a template-shaped page ----
{
  // the real shape of الگو:یادچپ that caused the incident
  const title = 'الگو:آزمایشیِ‌یادچپ';
  const yadchapShape = `<includeonly>{{#tag:ref|{{{1|}}}|group=persian-alpha}}</includeonly><noinclude>
{{documentation}}
</noinclude>`;
  // mirrors what getTargets() hands transform(): the RENDER said this group errors,
  // even though the wikitext itself builds it via #tag:ref rather than spelling it out
  seedBrokenGroups(title, ['persian-alpha']);
  const res = notelistMissingTask.transform(yadchapShape, title);
  check('a template-shaped page is NOT changed', res.changed === false);
  check('a template-shaped page IS marked for manual review (not silently skipped)',
    res.manualReview === true);
  check('the text handed back is untouched', res.text === yadchapShape);
}

// ---- transform() must still fix an ordinary article (no regression) ----
{
  const title = 'یک مقالهٔ آزمایشی';
  const broken = 'متن مقاله.<ref group="x">یادداشت</ref>\n\n[[رده:آزمایشی]]';
  seedBrokenGroups(title, ['x']);
  const res = notelistMissingTask.transform(broken, title);
  check('an ordinary missing-container article is still auto-fixed', res.changed === true);
  check('the fix actually inserts a container', res.text.includes('یادداشت‌ها'));
}

console.log(`${pass + fail} checks, ${fail} failing`);
if (fail) process.exit(1);
