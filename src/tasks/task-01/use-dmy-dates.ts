/**
 * Task 1 — remove the imported English "use this variant" templates from articles:
 * {{Use dmy dates}}, {{Use mdy dates}} and the English-variant markers
 * ({{Use British English}}, {{Use American English}}, {{Use Indian English}},
 * {{Use Australian English}}, {{Use Hong Kong English}}, {{EngvarB}}).
 *
 * On fa.wiki NONE of them renders anything in an article. Each body is just an
 * edit-preview warning plus two maintenance categories —
 * رده:صفحه‌های حاوی الگوی غیر بومی and رده:همه صفحه‌های نیازمند تمیزکاری — and each
 * `/توضیحات` says «این الگو باید از صفحه حذف شود». They also ignore every parameter they
 * are given (`|date=…`, `|cs1-dates=l`): there is no CS1 date-format plumbing behind them
 * on fa as there is on en. `{{EngvarB}}` is blanker still, adding not even the category
 * («این الگو خالی شده است و هیچ محتوایی به صفحه‌ها اضافه نمی‌کند»). So removal is
 * render-neutral by construction — the only on-page effect is leaving the cleanup
 * category.
 *
 * SCOPE NOTE. The permission request (وظیفه ۱, {{مجوز دارد}} ۱۲ اکتبر ۲۰۲۶) describes
 * {{Use dmy dates}} and said the variants would be «handled by separate tasks later». The
 * operator decided on ۱۳ اکتبر that they are the same cleanup under the same approval,
 * which is a judgement he is entitled to make: the argument the request makes — an
 * imported template that renders nothing and whose own doc asks to be removed — is
 * word-for-word the same for all eight, and they share the one tracking category. If a
 * reviewer ever asks, that is the answer; nothing about the method changed.
 *
 * Targets = pages that really transclude one of them in mainspace (list=embeddedin), NOT
 * the whole category, which can also be reached indirectly from a subtemplate.
 */
import type { Bot, BotTask } from '../../core.js';

/**
 * Every name a page can call these by, measured live on ۱۳ اکتبر ۲۰۲۶ via
 * `prop=redirects` on each template and on each Persian target. Four of the English names
 * are redirects to a Persian title and a page may transclude either side, so BOTH spellings
 * have to be in the pattern — matching only the English name would leave the Persian call
 * in place, with the page still in the category and the run reporting a clean sweep.
 */
export const TEMPLATE_NAMES = [
  'Use dmy dates', 'استفاده از تاریخ‌های زمانی',
  'Use mdy dates', 'استفاده از تاریخ زمانی',
  'Use British English', 'استفاده از انگلیسی بریتانیایی',
  'Use American English', 'استفاده از انگلیسی آمریکایی',
  'Use Indian English',
  'Use Australian English',
  'Use Hong Kong English',
  'EngvarB',
] as const;

/** The eight canonical titles to enumerate transclusions of. A page that calls a redirect
 *  registers a transclusion of the redirect AND of its target, so listing the Persian
 *  targets alone would still be enough — but listing both is cheap and survives someone
 *  retargeting a redirect. */
const TARGET_TEMPLATES = [
  'الگو:استفاده از تاریخ‌های زمانی', 'الگو:Use dmy dates',
  'الگو:استفاده از تاریخ زمانی', 'الگو:Use mdy dates',
  'الگو:استفاده از انگلیسی بریتانیایی', 'الگو:Use British English',
  'الگو:استفاده از انگلیسی آمریکایی', 'الگو:Use American English',
  'الگو:Use Indian English', 'الگو:Use Australian English',
  'الگو:Use Hong Kong English', 'الگو:EngvarB',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * `{{Name}}` or `{{Name|date=…}}`. MediaWiki capitalises only the FIRST letter of a
 * template name, so `[Uu]se dmy dates` is the whole of the case-insensitivity that is
 * real — `{{use dmy dates}}` works on-wiki, `{{Use DMY dates}}` does not resolve. The
 * underscore form (`Use_dmy_dates`) is also a valid call. Parameters are plain text, so
 * `[^{}]*` cannot run past the closing braces.
 */
function namePattern(name: string): string {
  const body = esc(name).replace(/ /g, '[ _]');
  const first = body[0];
  const head = /[a-z]/i.test(first)
    ? `[${first.toLowerCase()}${first.toUpperCase()}]${body.slice(1)}`
    : body;
  return head;
}
const ALT = TEMPLATE_NAMES.map(namePattern).join('|');
const CALL = new RegExp(`\\{\\{\\s*(?:${ALT})\\s*(?:\\|[^{}]*)?\\}\\}`, 'g');
/** Whole-line occurrence (template alone on its line) → drop the entire line. */
const LINE = new RegExp(`^[^\\S\\n]*\\{\\{\\s*(?:${ALT})\\s*(?:\\|[^{}]*)?\\}\\}[^\\S\\n]*\\n`, 'gm');

export function removeUseDmyDates(text: string): { text: string; changed: boolean; note?: string } {
  CALL.lastIndex = 0;
  if (!CALL.test(text)) { CALL.lastIndex = 0; return { text, changed: false, note: 'الگو در ویکی‌متن یافت نشد' }; }
  CALL.lastIndex = 0;
  let inlineLeft = false;
  // 1) remove lines that contain only the template
  let out = text.replace(LINE, '');
  // 2) remove any remaining inline occurrences (template glued to other content)
  out = out.replace(CALL, () => { inlineLeft = true; return ''; });
  if (out === text) return { text, changed: false, note: 'تطبیق ناموفق' };
  // Removing a leading standalone line can leave the page starting with a blank line —
  // invisible in the render, caught by the gate («صفحه با سطر خالی آغاز می‌شود»), and it
  // blocked three وظیفهٔ ۱۵ removals before that task learned the same trim.
  out = out.replace(/^[^\S\n]*\n+/, '');
  if (out === text) return { text, changed: false, note: 'تطبیق ناموفق' };
  return { text: out, changed: true, note: inlineLeft ? 'حذف درون‌خطی' : undefined };
}

export const useDmyDatesTask: BotTask = {
  id: 'remove-use-dmy-dates',
  taskNumber: 1,
  summary: 'حذف الگوهای واردشدهٔ انگلیسی {{Use dmy dates}}، {{Use British English}} و مانند آن‌ها (در فارسی چیزی نمایش نمی‌دهند)',
  description: 'حذف الگوهای واردشدهٔ {{Use dmy dates}}، {{Use mdy dates}}، {{Use British English}}، {{Use American English}}، {{Use Indian English}}، {{Use Australian English}}، {{Use Hong Kong English}} و {{EngvarB}} از مقاله‌ها؛ این الگوها در ویکی‌پدیای فارسی چیزی نمایش نمی‌دهند و تنها صفحه را در ردهٔ نگهداری «صفحه‌های حاوی الگوی غیر بومی» قرار می‌دهند.',
  async getTargets(bot: Bot): Promise<string[]> {
    const out: string[] = [];
    for (const eititle of TARGET_TEMPLATES) {
      let cont: string | undefined;
      do {
        const p: Record<string, string> = { action: 'query', list: 'embeddedin', eititle, einamespace: '0', eilimit: '500' };
        if (cont) p.eicontinue = cont;
        const d = await bot.apiGet(p);
        for (const m of d.query.embeddedin ?? []) out.push(m.title);
        cont = d.continue?.eicontinue;
      } while (cont);
    }
    // A page carrying two of these templates (common: dmy dates + British English) is
    // listed once per template. Both go in ONE edit, so the duplicate has to come out of
    // the target list or the page burns a second `--limit` slot on a no-op.
    return [...new Set(out)];
  },
  /**
   * A page may be parked and come back. The permission was granted (۱۲ اکتبر ۲۰۲۶) for
   * exactly that reason: رده:صفحه‌های حاوی الگوی غیر بومی keeps refilling because editors
   * re-import these templates with translation tools, so this runs permanently, not once.
   * Without expiry a page cleaned today and re-broken tomorrow would be filtered out of
   * every later batch forever while the run reported "nothing to do".
   *
   * Re-checking is nearly free here because `list=embeddedin` is authoritative: a title
   * only reappears in the target list if it really has one of the templates again. Pages
   * that transclude one indirectly from a subtemplate are the exception — they will be
   * re-read monthly and, correctly, not edited.
   */
  recheckAfterDays: 30,
  transform(text: string) { return removeUseDmyDates(text); },
};
