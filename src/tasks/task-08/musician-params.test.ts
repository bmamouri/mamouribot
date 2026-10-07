/** Unit tests for Task 8's transform.  npx tsx src/tasks/task-08/musician-params.test.ts */
import { fixMusicianParams } from './musician-params.js';

let pass = 0, fail = 0;
function t(name: string, input: string, check: (r: ReturnType<typeof fixMusicianParams>) => string | null) {
  const r = fixMusicianParams(input);
  const err = check(r);
  if (err) { fail++; console.log(`✗ ${name}\n    ${err}\n    got: ${JSON.stringify(r.text.slice(0, 200))}`); }
  else { pass++; console.log(`✓ ${name}`); }
}
const has = (r: any, s: string) => r.text.includes(s) ? null : `expected to contain ${JSON.stringify(s)}`;
const lacks = (r: any, s: string) => !r.text.includes(s) ? null : `expected NOT to contain ${JSON.stringify(s)}`;

t('renames a Persian underscore key',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام = الف\n|اندازه_تصویر = 280px\n}}',
  r => has(r, '|اندازه تصویر = 280px') || (r.changed ? null : 'should have changed'));

t('preserves the = column when the key length changes',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام          = الف\n|سایت         = example.com\n}}',
  r => has(r, '|وبگاه        = example.com'));

t('renames a case-wrong Latin key',
  '{{Infobox musical artist\n| Genre = pop\n}}',
  r => has(r, '| genre = pop'));

t('COLLISION: different non-empty values on one row → no edit at all',
  '{{جعبه اطلاعات هنرمند موسیقی\n|اندازه تصویر = 200px\n|اندازه_تصویر = 280px\n}}',
  r => (!r.changed && r.manualReview) ? null : 'must refuse and flag for manual review');

t('same value duplicated → merged, not a collision',
  '{{جعبه اطلاعات هنرمند موسیقی\n|اندازه تصویر = 280px\n|اندازه_تصویر = 280px\n}}',
  r => r.manualReview ? 'should not flag' : (r.text.match(/اندازه تصویر/g)?.length === 1 ? null : 'should keep exactly one'));

t('COSMETIC-ONLY: an empty stray key alone is NOT an edit (ignoreblank=y)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام = الف\n|سایت =\n}}',
  r => r.changed ? 'must not make a purely cosmetic edit' : null);

t('empty stray key IS removed when it rides along with a real rename',
  '{{جعبه اطلاعات هنرمند موسیقی\n|سایت =\n|جایزه = گرمی\n}}',
  r => has(r, '|جوایز = گرمی') || lacks(r, 'سایت'));

t('dropping a NON-EMPTY duplicate counts as a real change (clears the category)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|وبگاه = a.com\n|سایت = a.com\n}}',
  r => r.changed ? (r.text.match(/a\.com/g)?.length === 1 ? null : 'keep one') : 'should edit');

t('empty TARGET already present → filled by the legacy value',
  '{{جعبه اطلاعات هنرمند موسیقی\n|وبگاه =\n|سایت = example.com\n}}',
  r => has(r, 'example.com') || (r.text.match(/وبگاه/g)?.length === 1 ? null : 'exactly one وبگاه'));

t('NEVER touches the value, even if it contains the key name',
  '{{جعبه اطلاعات هنرمند موسیقی\n|سایت = [http://x.com سایت رسمی]\n}}',
  r => has(r, '[http://x.com سایت رسمی]'));

t('leaves an identically-named param in ANOTHER template alone',
  '{{جعبه اطلاعات زندگی‌نامه\n|سایت = a.com\n}}\n{{جعبه اطلاعات هنرمند موسیقی\n|سایت = b.com\n}}',
  r => has(r, '{{جعبه اطلاعات زندگی‌نامه\n|سایت = a.com') || has(r, '|وبگاه = b.com'));

t('does not touch a key with no target (ملیت)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|ملیت = ایرانی\n}}',
  r => r.changed ? 'must not edit' : has(r, '|ملیت = ایرانی'));

t('no musical-artist call → untouched',
  '{{جعبه اطلاعات زندگی‌نامه\n|سایت = a.com\n}}',
  r => r.changed ? 'must not edit' : null);

t('nested template in a value does not break pipe splitting',
  '{{جعبه اطلاعات هنرمند موسیقی\n|سایت = {{نشانی وب|a.com}}\n|جایزه = {{فهرست|الف|ب}}\n}}',
  r => has(r, '|وبگاه = {{نشانی وب|a.com}}') || has(r, '|جوایز = {{فهرست|الف|ب}}'));

t('wikilink with a pipe in a value does not break splitting',
  '{{جعبه اطلاعات هنرمند موسیقی\n|برچسب = [[سونی|سونی رکوردز]]\n}}',
  r => has(r, '|ناشر = [[سونی|سونی رکوردز]]'));

t('unbalanced braces → refuses to edit',
  '{{جعبه اطلاعات هنرمند موسیقی\n|سایت = a.com\n',
  r => r.changed ? 'must not edit unbalanced wikitext' : null);

t('two legacy keys for the SAME row with different values → manual review',
  '{{جعبه اطلاعات هنرمند موسیقی\n|سایت = a.com\n|وب گاه = b.com\n}}',
  r => (!r.changed && r.manualReview) ? null : 'must refuse');

t('handles two musical-artist calls on one page',
  '{{جعبه اطلاعات هنرمند موسیقی|سایت=a.com}}\ntext\n{{جعبه اطلاعات هنرمند موسیقی|جایزه=x}}',
  r => has(r, '{{جعبه اطلاعات هنرمند موسیقی|وبگاه=a.com}}') || has(r, '{{جعبه اطلاعات هنرمند موسیقی|جوایز=x}}'));

t('comment-only value counts as empty → cosmetic-only, no edit',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام = الف\n|سایت = <!-- خالی -->\n}}',
  r => r.changed ? 'must not make a purely cosmetic edit' : null);

t('idempotent: running twice changes nothing the second time',
  '{{جعبه اطلاعات هنرمند موسیقی\n|اندازه_تصویر = 280px\n|سایت = a.com\n}}',
  r => { const again = fixMusicianParams(r.text); return again.changed ? 'second pass must be a no-op' : null; });

t('LATIN GUARD: |Name= with a Latin-only value is left alone (keeps the Persian header)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|Name = Adam Beyer\n}}',
  r => r.changed ? 'must not Latinise the infobox header' : has(r, '|Name = Adam Beyer'));

t('|Name= with a Persian value IS recovered',
  '{{جعبه اطلاعات هنرمند موسیقی\n|Name = محمدرضا شجریان\n}}',
  r => has(r, '|name = محمدرضا شجریان'));

t('Latin guard does not block other Latin-valued keys',
  '{{جعبه اطلاعات هنرمند موسیقی\n|Label = [[Drumcode]]\n}}',
  r => has(r, '|label = [[Drumcode]]'));

// --- underscore elimination (raised in the وظیفه ۸ approval) ---
t('DEALIAS: توضیح_تصویر → توضیح تصویر (cosmetic but intended)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|توضیح_تصویر = عکس\n}}',
  r => has(r, '|توضیح تصویر = عکس') || (r.changed ? null : 'must edit'));

t('DEALIAS: نام_اصلی → نام تولد, NOT «نام اصلی» (space form is not read!)',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام_اصلی = علی رضایی\n}}',
  r => has(r, '|نام تولد = علی رضایی') || lacks(r, 'نام اصلی'));

t('DEALIAS: اعضای_کنونی / اعضای_پیشین lose the underscore',
  '{{جعبه اطلاعات هنرمند موسیقی\n|اعضای_کنونی = الف\n|اعضای_پیشین = ب\n}}',
  r => has(r, '|اعضای کنونی = الف') || has(r, '|اعضای پیشین = ب'));

t('DEALIAS: نام_مستعار → نام مستعار',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام_مستعار = ققنوس\n}}',
  r => has(r, '|نام مستعار = ققنوس'));

t('DEALIAS collision: both forms filled differently → no edit, manual review',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام مستعار = الف\n|نام_مستعار = ب\n}}',
  r => (!r.changed && r.manualReview) ? null : 'must refuse');

t('DEALIAS: same value in both forms → merged to one',
  '{{جعبه اطلاعات هنرمند موسیقی\n|نام مستعار = الف\n|نام_مستعار = الف\n}}',
  r => r.changed && (r.text.match(/نام مستعار/g)?.length === 1) ? null : 'keep exactly one');

t('LATIN underscores are NEVER touched (en-synced names)',
  '{{Infobox musical artist\n|birth_date = 1970\n|image_size = 200\n|years_active = 1990\n}}',
  r => r.changed ? 'must not touch Latin underscore params' : null);

t('DEALIAS is idempotent',
  '{{جعبه اطلاعات هنرمند موسیقی\n|توضیح_تصویر = عکس\n|نام_اصلی = الف\n}}',
  r => { const again = fixMusicianParams(r.text); return again.changed ? 'second pass must no-op' : null; });

console.log(`\n${pass} گذشت، ${fail} افتاد`);
process.exit(fail ? 1 : 0);
