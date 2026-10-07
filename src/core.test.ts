/**
 * Unit tests for the dry-run diff preview. No network.
 *
 *   npx tsx src/core.test.ts
 *
 * This matters more than its size suggests: the preview is what a BRFA trial report is
 * written from. A diff that misrepresents the edit does not break anything on-wiki, it
 * misleads the reviewer deciding whether to grant the permission, which is worse.
 */
import { lineDiff, countErrorMarkers } from './core.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

console.log('== a renamed parameter shows as a pair ==');
{
  const d = lineDiff('|عنوان=خ|dead-url=yes', '|عنوان=خ|چگونگی پیوند=dead');
  ok('shows the old line', d.includes('− ') && d.includes('dead-url=yes'), d);
  ok('shows the new line', d.includes('+ ') && d.includes('چگونگی پیوند=dead'), d);
  ok('exactly one pair', d.split('\n').length === 2, JSON.stringify(d));
}

console.log('\n== the window follows the change, not the start of the line ==');
{
  // Truncating at a fixed width prints two IDENTICAL strings when the edit is past the
  // cut, and a reviewer reads that as the bot making no-op edits.
  const pad = 'x'.repeat(400);
  const d = lineDiff(`${pad}|dead-url=yes|سال=۱۳۹۰`, `${pad}|چگونگی پیوند=dead|سال=۱۳۹۰`);
  const [minus, plus] = d.split('\n');
  ok('the two sides are not identical', minus.slice(3) !== plus.slice(3), d);
  ok('the change is visible', minus.includes('dead-url') && plus.includes('چگونگی پیوند'), d);
  ok('the elision is marked', d.includes('…'), d);
}

console.log('\n== a removed line does not cascade ==');
{
  // Dropping a duplicate parameter that sat on its own line collapses that line. A
  // positional walk then reports every FOLLOWING line as changed, i.e. tells the
  // reviewer the bot rewrote the article.
  const before = '|عنوان=خ\n|dead-url=yes\n|ناشر=ن\n|سال=۱۳۹۰\n|شابک=۱';
  const after  = '|عنوان=خ\n|ناشر=ن\n|سال=۱۳۹۰\n|شابک=۱';
  const d = lineDiff(before, after);
  ok('only the dropped line is reported', d.trim() === '− |dead-url=yes', JSON.stringify(d));
  ok('no untouched line appears', !d.includes('ناشر') && !d.includes('سال') && !d.includes('شابک'), d);
}

console.log('\n== additions and multi-line hunks ==');
{
  const d = lineDiff('الف\nب', 'الف\nیادداشت تازه\nب');
  ok('an inserted line is shown as an addition', d.includes('+ یادداشت تازه'), d);
  ok('untouched lines stay out of it', !d.includes('− الف') && !d.includes('+ الف'), d);
}
{
  const d = lineDiff('a\nb\nc\nd', 'a\nX\nY\nd');
  ok('a replaced block shows both sides', d.includes('− b') && d.includes('− c') && d.includes('+ X') && d.includes('+ Y'), d);
}

console.log('\n== guards ==');
ok('identical input reports no line difference', lineDiff('same\nlines', 'same\nlines').includes('بدون تفاوت'));
ok('whitespace-only change is not reported as content', lineDiff('a\n\n', 'a\n').includes('بدون تفاوت'),
   JSON.stringify(lineDiff('a\n\n', 'a\n')));
{
  // A page where everything changed must not print the whole article into the log.
  const before = Array.from({ length: 200 }, (_, i) => `خط ${i} قدیمی`).join('\n');
  const after  = Array.from({ length: 200 }, (_, i) => `خط ${i} تازه`).join('\n');
  const d = lineDiff(before, after);
  ok('long diffs are truncated', d.includes('نمایش داده نشد'), d.slice(0, 200));
  ok('and stay short', d.split('\n').length <= 20, String(d.split('\n').length));
}


console.log('\n== error-marker counting ==');
// The phantom-floor trap: the bare name appears in the TemplateStyles block that
// defines its colour, so counting it unprefixed gives every page a constant non-zero
// count and a clean edit can look like a regression.
ok('the TemplateStyles colour rule is not counted as an error',
   countErrorMarkers('<style>.mw-parser-output .cs1-visible-error{color:var(--color-error,#bf3c2c)}</style>') === 0);
ok('a real CS1 error span is counted',
   countErrorMarkers('<span class="cs1-visible-error citation-comment">خطا</span>') === 1);
ok('both halves of one rendered error are counted (inline + reflist)',
   countErrorMarkers('<span class="cs1-visible-error c">a</span><span class="cs1-visible-error c">a</span>') === 2);
ok('a Lua error is counted', countErrorMarkers('<p class="scribunto-error">x</p>') === 1);
ok('a generic error span is counted', countErrorMarkers('<span class="error">x</span>') === 1);
ok('clean html counts zero', countErrorMarkers('<p>متن سالم</p>') === 0);

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
