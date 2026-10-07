/** Unit tests for Task 9's transform.  npx tsx src/tasks/task-09/taxonomy-link-localize.test.ts */
import { taxonomyLinkLocalizeTask as task, seedFaTitle, displayName, linkLineFor } from './taxonomy-link-localize.js';

let pass = 0, fail = 0;
type R = ReturnType<typeof task.transform>;
function t(name: string, taxon: string, fa: string | null, input: string, check: (r: R) => string | null) {
  if (fa) seedFaTitle(taxon, fa);
  const r = task.transform(input, `الگو:Taxonomy/${taxon}`);
  const err = check(r);
  if (err) { fail++; console.log(`✗ ${name}\n    ${err}\n    got: ${JSON.stringify(r.text.slice(0, 220))} changed=${r.changed} note=${r.note}`); }
  else { pass++; console.log(`✓ ${name}`); }
}
const has = (r: R, s: string) => r.text.includes(s) ? null : `expected to contain ${JSON.stringify(s)}`;
const unchanged = (r: R, input: string) => (!r.changed && r.text === input) ? null : 'must leave the page untouched';

const tpl = (link: string, extra = '') =>
  `{{Don't edit this line {{{machine code|}}}\n|rank=genus\n|link=${link}\n|parent=Plumbaginaceae\n${extra}}}\n`;

t('localizes a plain Latin link', 'Acantholimon', 'کلاه میرحسن (سرده)', tpl('Acantholimon'),
  r => has(r, '|link=کلاه میرحسن (سرده)|کلاه میرحسن') || (r.changed ? null : 'should have changed'));

t('no pipe when the title has no disambiguator', 'Malvales', 'پنیرک‌سانان', tpl('Malvales'),
  r => has(r, '|link=پنیرک‌سانان') || (r.text.includes('|link=پنیرک‌سانان|') ? 'must not add a pipe' : null));

t('replaces an en-style piped link too', 'Abies', 'نراد (سرده)', tpl('Fir|Abies'),
  r => has(r, '|link=نراد (سرده)|نراد') || (r.text.includes('Fir') ? 'the old en label must be gone' : null));

t('IDEMPOTENT: an already-Persian link is left alone', 'Papaver', 'خشخاش (سرده)', tpl('خشخاش (سرده)|خشخاش'),
  r => unchanged(r, tpl('خشخاش (سرده)|خشخاش')));

t('no fa article → stays Latin', 'Nosuchtaxon', null, tpl('Nosuchtaxon'),
  r => unchanged(r, tpl('Nosuchtaxon')));

t('a Latin-titled fa article is not worth linking', 'Foobar', 'Foobar', tpl('Foobar'),
  r => unchanged(r, tpl('Foobar')));

t('no link= line → nothing to do', 'Rosids', 'گل‌سرخیان',
  `{{Don't edit this line {{{machine code|}}}\n|rank=clade\n|parent=Eudicots\n}}\n`,
  r => (!r.changed && r.note === 'خط link در الگو نیست') ? null : 'should report the missing line');

t('touches ONLY the link line — rank/parent/refs byte-identical', 'Acantholimon', 'کلاه میرحسن (سرده)',
  tpl('Acantholimon', '|refs={{cite web|url=http://example.org|title=Acantholimon}}\n|extinct=false\n'),
  r => {
    const before = tpl('Acantholimon', '|refs={{cite web|url=http://example.org|title=Acantholimon}}\n|extinct=false\n');
    const strip = (s: string) => s.split('\n').filter(l => !l.startsWith('|link=')).join('\n');
    if (strip(r.text) !== strip(before)) return 'a line other than link= changed';
    return r.text.includes('|refs={{cite web|url=http://example.org|title=Acantholimon}}') ? null : 'refs mangled';
  });

t('only the FIRST link= line is the display field (no second rewrite)', 'Acantholimon', 'کلاه میرحسن (سرده)',
  tpl('Acantholimon'),
  r => (r.text.match(/^\|link=/gm) ?? []).length === 1 ? null : 'exactly one link= line must remain');

t('a link value containing a signature marker is refused', 'Weird', 'عجیب',
  `{{Don't edit this line\n|rank=genus\n|link=Weird\n|parent=~~~~\n}}\n`,
  r => r.changed ? 'must not save a page whose text carries ~~~~' : null);

// pure helpers
const h = (name: string, got: string, want: string) => {
  if (got === want) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}\n    want ${JSON.stringify(want)} got ${JSON.stringify(got)}`); }
};
h('displayName strips a trailing disambiguator', displayName('بهمنیان (تیره)'), 'بهمنیان');
h('displayName keeps a plain title', displayName('میخک‌سانان'), 'میخک‌سانان');
h('displayName strips only a TRAILING parenthetical', displayName('گون (سرده) خاردار'), 'گون (سرده) خاردار');
h('linkLineFor pipes when needed', linkLineFor('گون (سرده)'), '|link=گون (سرده)|گون');
h('linkLineFor omits the pipe otherwise', linkLineFor('گون'), '|link=گون');

console.log(`\n${pass} گذشت، ${fail} افتاد`);
process.exit(fail ? 1 : 0);
