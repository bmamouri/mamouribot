/**
 * Task 1 — remove the imported English template {{Use dmy dates}} from articles.
 *
 * On fa.wiki this template renders nothing in articles; it only shows an
 * edit-preview warning and files the page into رده:صفحه‌های حاوی الگوی غیر بومی
 * (+ رده:همه صفحه‌های نیازمند تمیزکاری). Its own /توضیحات says it "should be
 * removed from the page". So removal is render-neutral — the only on-page effect
 * is that the cleanup tracking category disappears.
 *
 * Targets = pages that actually transclude الگو:Use dmy dates in mainspace
 * (list=embeddedin), NOT the whole category (which also holds the
 * American/British/Australian-English variants, handled by separate tasks later).
 */
import type { Bot, BotTask } from '../../core.js';

/** Matches {{Use dmy dates}} or {{Use dmy dates|date=…}} (first letter case-insensitive,
 *  optional inner whitespace). Params are plain text, so [^{}]* is safe. */
const CALL = /\{\{\s*[Uu]se dmy dates\b[^{}]*\}\}/g;
/** Whole-line occurrence (template alone on its line) → drop the entire line. */
const LINE = /^[^\S\n]*\{\{\s*[Uu]se dmy dates\b[^{}]*\}\}[^\S\n]*\n/gm;

export function removeUseDmyDates(text: string): { text: string; changed: boolean; note?: string } {
  if (!CALL.test(text)) { CALL.lastIndex = 0; return { text, changed: false, note: 'الگو در ویکی‌متن یافت نشد' }; }
  CALL.lastIndex = 0;
  let inlineLeft = false;
  // 1) remove lines that contain only the template
  let out = text.replace(LINE, '');
  // 2) remove any remaining inline occurrences (template glued to other content)
  out = out.replace(CALL, () => { inlineLeft = true; return ''; });
  if (out === text) return { text, changed: false, note: 'تطبیق ناموفق' };
  return { text: out, changed: true, note: inlineLeft ? 'حذف درون‌خطی' : undefined };
}

export const useDmyDatesTask: BotTask = {
  id: 'remove-use-dmy-dates',
  taskNumber: 1,
  summary: 'حذف الگوی واردشدهٔ {{Use dmy dates}} (الگوی غیربومی؛ در فارسی کاربردی ندارد)',
  description: 'حذف الگوی {{Use dmy dates}} از مقاله‌ها؛ این الگو در فارسی چیزی نمایش نمی‌دهد و تنها صفحه را در ردهٔ نگهداری «صفحه‌های حاوی الگوی غیر بومی» قرار می‌دهد.',
  async getTargets(bot: Bot): Promise<string[]> {
    const out: string[] = [];
    let cont: string | undefined;
    do {
      const p: Record<string, string> = { action: 'query', list: 'embeddedin', eititle: 'الگو:Use dmy dates', einamespace: '0', eilimit: '500' };
      if (cont) p.eicontinue = cont;
      const d = await bot.apiGet(p);
      for (const m of d.query.embeddedin) out.push(m.title);
      cont = d.continue?.eicontinue;
    } while (cont);
    return out;
  },
  transform(text: string) { return removeUseDmyDates(text); },
};
