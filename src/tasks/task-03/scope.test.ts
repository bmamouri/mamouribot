/**
 * The live run must do ONLY what the permission covers.
 *
 *   npx tsx src/tasks/task-03/scope.test.ts
 *
 * `ویکی‌پدیا:…/MamouriBot/وظیفه ۳` was granted {{مجوز دارد}} on ۸ اکتبر ۲۰۲۶ for the
 * archive families, the dead-url family and `ref=harv`. The follow-up declared three
 * deviations; a fourth covering ten more citation families was drafted and removed before
 * posting, so those ten are NOT approved.
 *
 * This runs in a CHILD PROCESS with the environment the real job has — no
 * CITE_WIDENED_SCOPE — because `npm test` sets that variable so the behaviour tests can
 * exercise every family. Asserting the default from inside that run would assert nothing.
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

/** Which families fire, as seen by a process with the given environment. */
function activeFamilies(env: Record<string, string | undefined>): string[] {
  const probe = `
    import { normalizeCiteParams } from './src/tasks/task-03/normalize-cite-params.js';
    const cases = {
      'archive-url':  '{{یادکرد وب|archive-url=http://a|پیوند بایگانی=http://a}}',
      'archive-date': '{{یادکرد وب|archive-date=۲۰۲۰|تاریخ بایگانی=۲۰۲۰}}',
      'url-status':   '{{یادکرد وب|dead-url=yes}}',
      'access-date':  '{{یادکرد وب|بازبینی=۱۴ ژوئن ۲۰۲۰|accessdate=۱۴ ژوئن ۲۰۲۰}}',
      'language':     '{{یادکرد وب|کد زبان=en|زبان=en}}',
      'title':        '{{یادکرد کتاب|کتاب=خ|عنوان=خ}}',
      'periodical':   '{{یادکرد وب|وبگاه=ب|اثر=ب}}',
      'chapter':      '{{یادکرد کتاب|فصل=سه|بخش=سه}}',
      'publisher':    '{{یادکرد کتاب|انتشارات=س|ناشر=س}}',
      'pages':        '{{یادکرد کتاب|صص=۱۲|صفحات=۱۲}}',
    };
    const on = Object.entries(cases).filter(([, t]) => normalizeCiteParams(t).changed).map(([k]) => k);
    console.log(JSON.stringify(on));
  `;
  const r = spawnSync(process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', probe],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env } });
  const line = (r.stdout ?? '').trim().split('\n').filter(l => l.startsWith('[')).pop();
  if (!line) throw new Error(`probe produced no result:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(line) as string[];
}

console.log('== by DEFAULT, only the approved families act ==');
{
  const on = activeFamilies({ CITE_WIDENED_SCOPE: undefined });
  ok('the three approved families are active',
     ['archive-url', 'archive-date', 'url-status'].every(f => on.includes(f)), JSON.stringify(on));
  const unapproved = ['access-date', 'language', 'title', 'periodical', 'chapter', 'publisher', 'pages'];
  const leaked = unapproved.filter(f => on.includes(f));
  ok('and NONE of the unapproved families is', leaked.length === 0,
     `these would edit outside the permission: ${leaked.join(', ')}`);
  ok('exactly three families, no more', on.length === 3, JSON.stringify(on));
}

console.log('\n== the opt-in works, so the widening is one flag away once approved ==');
{
  const on = activeFamilies({ CITE_WIDENED_SCOPE: '1' });
  ok('the widened families come back', on.length > 3, JSON.stringify(on));
  ok('including access-date and language', on.includes('access-date') && on.includes('language'),
     JSON.stringify(on));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
