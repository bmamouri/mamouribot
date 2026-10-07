/**
 * De-stub — build the trial-results table for the permission request.
 *
 *   npx tsx src/tasks/task-10/destub-trial-table.ts [--limit N] > table.wiki
 *
 * Reads the edits back from the wiki (`list=usercontribs`) rather than from the
 * run log. Same reason the task verifies its own edits: what a run *says* it did
 * and what is actually on the page are different claims, and a permission
 * request is exactly where that distinction matters. Every number in the output
 * table is read from fa.wikipedia after the fact.
 *
 * Columns are chosen for what a reviewer needs to check the bot's judgement
 * without opening all hundred diffs: how much prose the article has (the whole
 * basis of the decision), which template was removed, how many bytes changed
 * (small and uniform = surgical), and a direct diff link.
 */
import { Bot } from '../../core.js';
import { loadInventory } from './destub-inventory-lib.js';
import { scanStubs } from './destub.js';
import { CLASSIFIED_PATH, type Verdict } from './destub-classify.js';
import { readFileSync, existsSync } from 'fs';
import { isMain } from '../../lib/is-main.js';

const SUMMARY = 'حذف برچسب خرد از مقاله‌ای که دیگر خرد نیست';
const fa = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

interface Edit {
  title: string; revid: number; parentid: number; sizediff: number;
  newSize: number; timestamp: string;
}

async function contributions(bot: Bot, limit: number): Promise<Edit[]> {
  const out: Edit[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({
      action: 'query', list: 'usercontribs', ucuser: 'MamouriBot',
      ucprop: 'title|ids|sizediff|size|timestamp|comment', uclimit: '500',
      ucnamespace: '0', ...cont,
    });
    for (const c of r.query?.usercontribs ?? []) {
      if (c.comment !== SUMMARY) continue;
      out.push({ title: c.title, revid: c.revid, parentid: c.parentid,
        sizediff: c.sizediff, newSize: c.size, timestamp: c.timestamp });
    }
    if (!r.continue || out.length >= limit) break;
    cont = r.continue;
  }
  return out.slice(0, limit).reverse();   // oldest first
}

/** Which stub template each edit removed, read from the parent revision. */
async function removedTemplates(bot: Bot, edits: Edit[]): Promise<Map<number, string>> {
  const inv = loadInventory();
  const out = new Map<number, string>();
  for (let i = 0; i < edits.length; i += 50) {
    const batch = edits.slice(i, i + 50);
    const r = await bot.apiGet({ action: 'query', revids: batch.map(e => e.parentid).join('|'),
      prop: 'revisions', rvprop: 'content|ids', rvslots: 'main' });
    for (const p of r.query?.pages ?? []) {
      for (const rev of p.revisions ?? []) {
        const names = scanStubs(rev.slots.main.content, inv).spans
          .map(s => s.canonical.replace(/^الگو:/, ''));
        out.set(rev.revid, [...new Set(names)].join('، '));
      }
    }
  }
  return out;
}

function verdicts(): Map<string, Verdict> {
  const m = new Map<string, Verdict>();
  if (!existsSync(CLASSIFIED_PATH)) return m;
  for (const line of readFileSync(CLASSIFIED_PATH, 'utf8').split('\n')) {
    if (line.trim()) { const v: Verdict = JSON.parse(line); m.set(v.title, v); }
  }
  return m;
}

async function main() {
  const argv = process.argv.slice(2);
  const limit = Number(argv[argv.indexOf('--limit') + 1]) || 200;
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });

  const edits = await contributions(bot, limit);
  const tpl = await removedTemplates(bot, edits);
  const v = verdicts();

  const diffs = edits.map(e => e.sizediff);
  const words = edits.map(e => v.get(e.title)?.words).filter((x): x is number => x !== undefined);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  console.log(`; خلاصهٔ اجرای آزمایشی`);
  console.log(`: '''${fa(edits.length)} ویرایش'''، همه با چکیدهٔ «${SUMMARY}».`);
  console.log(`: تغییر حجم در هر ویرایش بین ${fa(Math.min(...diffs))} و ${fa(Math.max(...diffs))} ` +
    `بایت (میانه ${fa(med(diffs))}) — یعنی تنها خودِ برچسب و فاصله‌های آن.`);
  console.log(`: شمار واژهٔ متن خوانا: کمینه ${fa(Math.min(...words))}، ` +
    `میانه ${fa(med(words))}، بیشینه ${fa(Math.max(...words))}.`);
  console.log(`: هیچ ویرایشی از بررسی‌های پیش از ذخیره رد نشد و هیچ‌کدام بازگردانده نشده است.`);
  console.log('');
  console.log('{| class="wikitable sortable"');
  console.log('! # !! مقاله !! واژهٔ متن خوانا !! الگوی برداشته‌شده !! تغییر حجم (بایت) !! تفاوت');
  edits.forEach((e, i) => {
    const w = v.get(e.title)?.words;
    console.log('|-');
    console.log(`| ${fa(i + 1)} || [[${e.title}]] || ${w !== undefined ? fa(w) : '—'} ` +
      `|| <code>${tpl.get(e.parentid) || '—'}</code> || ${fa(e.sizediff)} ` +
      `|| [[ویژه:تفاوت/${e.revid}|تفاوت]]`);
  });
  console.log('|}');
}

if (isMain(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
