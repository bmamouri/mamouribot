/**
 * وظیفهٔ ۲۰ — English values left in infoboxes and navboxes.
 *
 * Not filed yet. Until the request is approved this runs only as a dry run or `--as-me`.
 *
 * Two changes, both in `values.ts`:
 *   - an infobox or navbox-heading value on the whitelist that exactly matches an entry of
 *     the on-wiki dictionary at the pinned revision (`dictionary.ts`);
 *   - a navbox link `[[Persian article|English label]]` gets the article's title as label.
 *
 * The bot never makes up a Persian value and never calls a language model. Every value it
 * writes is a dictionary row that the operator approved by moving the pin, or the title of
 * an article a human already linked.
 *
 * Targets come from the census (`census.py`, `navbox_census.py`) as a file, or from the
 * usual selectors. Pages are read in getTargets so transform() is pure.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { Bot, BotTask } from '../../core.js';
import { applyPage, navboxLabelTargets, type Change } from './values.js';
import { loadPinnedDictionary, normTemplate, type Dictionary } from './dictionary.js';
import { gateDiff } from '../task-12/rewrite.js';

const SUMMARY_VALUES = 'برگردان مقدارهای انگلیسی جعبهٔ اطلاعات به فارسی';
const SUMMARY_NAV = 'برگردان برچسب‌ها و سرگروه‌های انگلیسی جعبهٔ ناوبری به فارسی';
const SUMMARY_BOTH = 'برگردان مقدارهای انگلیسی جعبهٔ اطلاعات و جعبهٔ ناوبری به فارسی';

const NOT_A_TEMPLATE = /^الگو:.*\/(?:توضیحات|تمرین|آزمایشی|آزمایش|موردهای[ ‌]?آزمون|doc|sandbox|testcases)(?:\/|$)/i;

let DICT: Dictionary | null = null;
/** template name as written (normalised) → canonical fa title, resolved once in getTargets */
let CANON = new Map<string, string>();
const CHANGES = new Map<string, Change[]>();
const SKIPPED = new Map<string, string[]>();
const REFUSED = new Map<string, string>();

const canonical = (name: string) => CANON.get(normTemplate(name)) ?? normTemplate(name);
/** fa article → en sitelink title ('' = none), read once in getTargets. Redirects are followed. */
let EN_OF = new Map<string, string>();
const enTitle = (fa: string) => EN_OF.get(fa.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));

async function lookupEnTitles(bot: Bot, titles: string[]) {
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const d = await bot.apiGet({ action: 'query', redirects: '1', prop: 'langlinks|pageprops', lllang: 'en',
      ppprop: 'disambiguation', lllimit: 'max', titles: chunk.join('|') });
    const q = d.query ?? {};
    const norm = new Map<string, string>((q.normalized ?? []).map((x: any) => [x.from, x.to]));
    const red = new Map<string, string>((q.redirects ?? []).map((x: any) => [x.from, x.to]));
    const pages = new Map<string, any>((q.pages ?? []).map((p: any) => [p.title, p]));
    for (const t of chunk) {
      const n = norm.get(t) ?? t;
      // a label pointing through a redirect, or at a disambiguation page, is not proven
      const p = red.has(n) ? undefined : pages.get(n);
      const en = !p || p.missing || p.pageprops?.disambiguation !== undefined ? '' : (p.langlinks?.[0]?.title ?? '');
      EN_OF.set(t.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), en);
    }
  }
}

function targetTitles(): string[] {
  const out: string[] = [];
  out.push(...(process.env.TARGET_TITLES ?? '').split('|').map(s => s.trim()).filter(Boolean));
  const file = process.env.TARGET_FILE;
  if (file) {
    if (!existsSync(file)) throw new Error(`TARGET_FILE=${file} وجود ندارد`);
    const raw = readFileSync(file, 'utf8').trim();
    out.push(...(raw.startsWith('[') ? JSON.parse(raw) as string[] : raw.split('\n').map(s => s.trim()).filter(Boolean)));
  }
  return [...new Set(out)];
}

async function transcluding(bot: Bot, tpl: string, ns: string, cap: number): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;
  do {
    const d = await bot.apiGet({ action: 'query', prop: 'transcludedin', titles: tpl, tilimit: '500',
      tinamespace: ns, ...(cont ? { ticontinue: cont } : {}) });
    for (const p of d.query?.pages?.[0]?.transcludedin ?? []) out.push(p.title);
    cont = d.continue?.ticontinue;
  } while (cont && out.length < cap);
  return out;
}

/** Resolve every template name used on the pages to its canonical title, 50 at a time. */
async function resolveTemplates(bot: Bot, names: Set<string>) {
  const list = [...names].filter(n => !CANON.has(n));
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const d = await bot.apiGet({ action: 'query', redirects: '1', titles: chunk.map(n => `الگو:${n}`).join('|') });
    const q = d.query ?? {};
    const norm = new Map<string, string>((q.normalized ?? []).map((x: any) => [x.from, x.to]));
    const red = new Map<string, string>((q.redirects ?? []).map((x: any) => [x.from, x.to]));
    for (const n of chunk) {
      const a = norm.get(`الگو:${n}`) ?? `الگو:${n}`;
      CANON.set(n, (red.get(a) ?? a).replace(/^الگو:/, ''));
    }
  }
}

export const infoboxValuesTask: BotTask = {
  id: 'infobox-values',
  taskNumber: 20,
  summary: SUMMARY_VALUES,
  description: 'برگردان مقدارهای انگلیسی جعبه‌های اطلاعات و جعبه‌های ناوبری به فارسی، تنها از روی '
    + 'واژه‌نامهٔ تأییدشده یا عنوان مقالهٔ فارسی‌ای که پیوند از پیش به آن می‌رود',

  perPageSummary(title: string) {
    const kinds = new Set((CHANGES.get(title) ?? []).map(c => c.kind === 'value' ? 'v' : 'n'));
    return kinds.has('v') && kinds.has('n') ? SUMMARY_BOTH : kinds.has('n') ? SUMMARY_NAV : SUMMARY_VALUES;
  },

  async getTargets(bot: Bot): Promise<string[]> {
    // A missing or broken pin is fatal for the dictionary half only: navbox labels need no
    // dictionary, so a dry run with no approved revision still shows them.
    try { DICT = await loadPinnedDictionary(bot); console.log(`واژه‌نامه: نسخهٔ ${DICT.revid}، ${DICT.entries.length} ردیف`); }
    catch (e) {
      if (process.env.T20_REQUIRE_DICT === '1') throw e;
      console.log(`⚠ ${(e as Error).message}\n  تنها برچسب‌های جعبهٔ ناوبری بررسی می‌شود`);
      DICT = null;
    }

    const cap = Number(process.env.TARGET_CAP ?? '0') || (bot.opts.limit ? bot.opts.limit * 5 : 2000);
    let titles = targetTitles();
    for (const tpl of (process.env.TARGET_TRANSCLUDING ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
      titles.push(...await transcluding(bot, tpl, process.env.TARGET_NAMESPACE ?? '0|10', cap));
    }
    titles = [...new Set(titles)].filter(t => !NOT_A_TEMPLATE.test(t)).slice(0, cap);
    if (!titles.length) {
      console.log('هیچ صفحه‌ای داده نشد. TARGET_FILE، TARGET_TITLES یا TARGET_TRANSCLUDING را تنظیم کنید.');
      return [];
    }

    // read once, find the template names, resolve redirects, then decide
    const src = new Map<string, string>();
    for (let i = 0; i < titles.length; i += 50) {
      const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
        titles: titles.slice(i, i + 50).join('|') });
      for (const p of d.query?.pages ?? []) {
        const t = p.revisions?.[0]?.slots?.main?.content;
        if (typeof t === 'string' && (p.ns === 0 || p.ns === 10)) src.set(p.title, t);
      }
    }
    const names = new Set<string>();
    for (const text of src.values()) {
      for (const m of text.matchAll(/\{\{\s*([^{}|\n<]+?)\s*(?:\||\}\}|\n)/g)) names.add(normTemplate(m[1]));
    }
    await resolveTemplates(bot, names);
    const labelTargets = new Set<string>();
    for (const text of src.values()) for (const t of navboxLabelTargets(text)) labelTargets.add(t);
    await lookupEnTitles(bot, [...labelTargets]);
    console.log(`${labelTargets.size} مقالهٔ فارسی در برچسب‌های انگلیسی جعبهٔ ناوبری؛ عنوان انگلیسی‌شان خوانده شد`);

    const work: string[] = [];
    for (const [title, text] of src) {
      const r = applyPage(text, DICT, canonical, enTitle);
      if (r.skipped.length) SKIPPED.set(title, r.skipped);
      if (r.changes.length) { CHANGES.set(title, r.changes); work.push(title); }
    }
    const byKind: Record<string, number> = {};
    for (const cs of CHANGES.values()) for (const c of cs) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    console.log(`${src.size} صفحه خوانده شد؛ ${work.length} صفحه برای ویرایش؛ ${JSON.stringify(byKind)}`);
    return work;
  },

  transform(text: string, title: string) {
    const r = applyPage(text, DICT, canonical, enTitle);
    if (!r.changes.length) return { text, changed: false, note: 'موردی نبود' };
    CHANGES.set(title, r.changes);
    const { introduced } = gateDiff(title, text, r.text);
    if (introduced.length) {
      REFUSED.set(title, `دروازه: ${introduced.join('؛ ')}`);
      return { text, changed: false, manualReview: true, note: `دروازه رد کرد: ${introduced.join('؛ ')}` };
    }
    return { text: r.text, changed: true,
      note: r.changes.map(c => `${c.param}: ${c.from} → ${c.to}`).join(' ¦ ') };
  },

  /**
   * Refuse unless every new Persian value shows on the rendered page, and the page gained
   * no red link. A value the template hides would make the edit invisible, which is a
   * cosmetic edit; a label pointing somewhere new would be a link change this task does
   * not make.
   */
  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    // Both sides through `text=`: `page=` and `text=` render differently (a preview shows
    // template chrome such as the drug infobox's red doc link), and comparing one with the
    // other refused 15 clean edits in the dry run of ۲۲ نوامبر ۲۰۲۶.
    const render = async (text: string) => {
      const r = await bot.apiPost({ action: 'parse', prop: 'text', disablelimitreport: '1', disableeditsection: '1',
        title, text, contentmodel: 'wikitext' });
      return (r.parse?.text ?? '') as string;
    };
    const [before, after] = [await render(oldText), await render(newText)];
    const plain = (h: string) => h.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
    const shown = plain(after);
    const missing = (CHANGES.get(title) ?? [])
      .map(c => c.to.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1').trim())
      .filter(v => !shown.includes(v));
    if (missing.length) {
      REFUSED.set(title, `نمایش داده نمی‌شود: ${missing.join('، ')}`);
      return { ok: false, detail: `مقدار تازه در صفحه نمایش داده نمی‌شود: ${missing.slice(0, 3).join('، ')}` };
    }
    const reds = (h: string) => (h.match(/class="new"/g) ?? []).length;
    if (reds(after) > reds(before)) {
      REFUSED.set(title, `پیوند سرخ ${reds(before)}→${reds(after)}`);
      return { ok: false, detail: `پیوند سرخ افزود (${reds(before)}→${reds(after)})` };
    }
    return { ok: true, detail: '' };
  },

  /** What was refused or skipped, written to the state directory for review. */
  async report(_bot: Bot, _dryRun: boolean) {
    const path = process.env.T20_REPORT ?? `${process.env.BOT_STATE_DIR ?? '.state'}/infobox-values-report.json`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      generated: new Date().toISOString(),
      dictionary_revid: DICT?.revid ?? null,
      changes: Object.fromEntries(CHANGES),
      refused: Object.fromEntries(REFUSED),
      skipped: Object.fromEntries(SKIPPED),
    }, null, 1));
    console.log(`گزارش: ${CHANGES.size} صفحه با تغییر، ${REFUSED.size} رد شده، ${SKIPPED.size} با مورد کنارگذاشته — ${path}`);
  },
};
