/**
 * Scale validation for Task 4 (read-only, batched to respect API limits).
 *
 *   npx tsx src/validate-company-params.ts [sampleEveryN]
 *
 * Fetches category members' wikitext in chunks of 40, applies fixCompanyParams,
 * and reports how many would be fixed, how many are skipped for a real value
 * clash, how many still hold an *unresolved* deprecated alias after the pass,
 * plus opt-out counts, sample diffs, and the residual-param tally. No login,
 * no writes. Pass an integer to sample every Nth member (e.g. 5) for a quick
 * pass instead of the full ~12k.
 */
import { Bot } from '../../core.js';
import { companyDeprecatedParamsTask, fixCompanyParams, findInfoboxSpans } from './company-deprecated-params.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// deprecated aliases (for the residual scan) — mirror of the task's trigger set
const DEP = ['جایگزین نماد', 'نماد', 'نماد شرکت', 'زیرنویس تصویر', 'زیرنویس نماد', 'زیرنویس', 'توضیح نشان', 'توضیح', 'پیشتر نامیده', 'از بین رفته', 'طبقه', 'گونه', 'بنا نهاده', 'تاسیس', 'بنیانگذاران', 'بنیانگذار', 'بنیان گذار', 'بنیان گذاران', 'منحل‌شده', 'موقعیت', 'شعبه مرکزی', 'شعبهٔ مرکزی', 'شهر شعبهٔ مرکزی', 'شعبهٔ مرکزی_شهر', 'شهر شعبه مرکزی', 'شعبه مرکزی_شهر', 'شهر موقعیت', 'کشور شعبهٔ مرکزی', 'شعبهٔ مرکزی_کشور', 'کشور شعبه مرکزی', 'شعبه مرکزی_کشور', 'کشور موقعیت', 'موقعیت‌ها', 'محدودهٔ فعالیت', 'رئیس هیات مدیره', 'رییس هیئت مدیره', 'افراد مهم', 'شخصیت_اصلی', 'نام‌های تجاری', 'دارایی کل', 'دارندگان', 'دارنده', 'تعداد کارکنان', 'کارمندان', 'کارکنان', 'شرکت مادر', 'شرکت‌های تابع', 'تابع', 'شرکت‌های وابسته', 'شرکت تابعه', 'رتبه‌بندی', 'homepage', 'صفحه خانگی', 'صفحه اصلی', 'وب‌گاه', 'وب گاه', 'پانوشت‌ها', 'شکل‌بندی بدنه', 'نماد معاملاتی', 'پیشین', 'پیشینیان'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** deprecated params still present as top-level keys of a company-infobox span */
function residualDeprecated(text: string): string[] {
  const found: string[] = [];
  for (const [a, b] of findInfoboxSpans(text)) {
    const span = text.slice(a, b);
    for (const dp of DEP) if (new RegExp('(?:^\\{\\{[^|]*|\\|)\\s*' + esc(dp) + '\\s*=').test(span)) found.push(dp);
  }
  return found;
}

async function main() {
  const everyN = Math.max(1, Number(process.argv[2] || 1));
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });
  let titles = await companyDeprecatedParamsTask.getTargets(bot);
  if (everyN > 1) titles = titles.filter((_, i) => i % everyN === 0);
  console.log(`هدف‌ها: ${titles.length} مقاله${everyN > 1 ? ` (نمونهٔ هر ${everyN}‌اُم)` : ''}`);

  let fixed = 0, clash = 0, optedOut = 0, noKnown = 0, residualRemain = 0;
  const residualTally: Record<string, number> = {};
  const clashList: string[] = [];
  const samples: string[] = [];

  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: chunk.join('|') });
    for (const pg of d.query.pages) {
      if ('missing' in pg || !pg.revisions) continue;
      const text: string = pg.revisions[0].slots.main.content;
      if (Bot.isOptedOut(text)) { optedOut++; continue; }
      const r = fixCompanyParams(text);
      if (r.note?.includes('تداخل')) { clash++; clashList.push(pg.title); continue; }
      if (!r.changed) { noKnown++; }
      else {
        fixed++;
        const res = residualDeprecated(r.text);
        if (res.length) { residualRemain++; for (const p of res) residualTally[p] = (residualTally[p] || 0) + 1; }
        if (samples.length < 8) {
          const after = new Set(r.text.split('\n')), before = new Set(text.split('\n'));
          const rem = text.split('\n').filter(l => !after.has(l) && l.trim());
          const add = r.text.split('\n').filter(l => !before.has(l) && l.trim());
          samples.push(`[${pg.title}]\n` + rem.slice(0, 4).map(l => '  − ' + l.trim().slice(0, 90)).join('\n') + '\n' + add.slice(0, 4).map(l => '  + ' + l.trim().slice(0, 90)).join('\n'));
        }
      }
    }
    process.stdout.write(`\r  پردازش‌شده: ${Math.min(i + 40, titles.length)}/${titles.length}`);
    await sleep(400);
  }

  console.log('\n\n=== خلاصهٔ اعتبارسنجی (وظیفه ۴) ===');
  console.log(`اصلاح‌شدنی            : ${fixed}`);
  console.log(`تداخل مقدار (رد)      : ${clash}`);
  console.log(`آپت‌اوت (رد)          : ${optedOut}`);
  console.log(`بدون پارامتر شناخته  : ${noKnown}`);
  console.log(`اصلاح‌شد ولی منسوخِ حل‌نشده باقی ماند: ${residualRemain}`);
  if (Object.keys(residualTally).length) {
    console.log('\nپارامترهای منسوخِ حل‌نشده (مقاله در رده می‌ماند):');
    for (const [k, v] of Object.entries(residualTally).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
  }
  if (clashList.length) { console.log(`\nفهرست تداخل مقدار (بازبینی دستی، ${clashList.length}):`); clashList.slice(0, 40).forEach(t => console.log('  - ' + t)); }
  console.log('\nنمونهٔ تغییرها:'); samples.forEach(s => console.log('\n' + s));
}
main().catch(e => { console.error(e); process.exit(1); });
