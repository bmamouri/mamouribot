/**
 * Audit trial edits: every edit since a timestamp whose summary is one of this task's.
 * Renders parent and saved revision, and compares references, citation errors and
 * external links (canonical form, as verify() does). Network; not in `npm test`.
 *
 *   npx tsx src/tasks/task-19/audit-trial.replay.ts Mamouri 2026-11-21T12:00:00Z > audit.tsv
 *
 * Writes a wikitext diff table to audit.wiki beside the TSV when T19_AUDIT_WIKI is set.
 */
import { writeFileSync } from 'fs';
import { Bot } from '../../core.js';
import { canonHref } from './url.js';

const [user = 'Mamouri', since = '2026-11-21T00:00:00Z'] = process.argv.slice(2);
const MARKS = ['یادکرد نشانی عریان', 'اصلاح نشانی منبع', 'افزودن عنوان یادکرد'];
const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });

const edits: { revid: number; parentid: number; title: string; comment: string }[] = [];
let cont: Record<string, string> = {};
for (;;) {
  const r = await bot.apiGet({ action: 'query', list: 'usercontribs', ucuser: user, ucnamespace: '0', ucend: since,
    uclimit: '500', ucprop: 'ids|title|comment', ...cont });
  for (const c of r.query.usercontribs) if (MARKS.some(m => (c.comment ?? '').includes(m))) edits.push(c);
  if (!r.continue) break;
  cont = r.continue;
}
console.error(`${edits.length} edits`);

const fold = (h: string) => canonHref(h).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
async function facts(oldid: number) {
  const r = await bot.apiGet({ action: 'parse', oldid: String(oldid), prop: 'text', disablelimitreport: '1' });
  const h: string = r.parse?.text ?? '';
  return {
    refs: (h.match(/<li id="cite(?:_|&#95;)note-/g) ?? []).length,
    errs: (h.match(/class="cs1-visible-error/g) ?? []).length + (h.match(/class="error/g) ?? []).length,
    links: new Set([...h.matchAll(/class="external[^"]*" href="([^"]+)"/g)].map(m => fold(m[1]))),
  };
}

let i = 0;
const rows: string[] = [];
for (const e of edits) {
  const [a, b] = [await facts(e.parentid), await facts(e.revid)];
  const lost = [...a.links].filter(l => !b.links.has(l) && !/web\.archive\.org\/web\/\d{14}\*/.test(l));
  const flag = a.refs !== b.refs || b.errs > a.errs || lost.length ? 'CHECK' : '';
  const row = [e.revid, e.title, `${a.refs}→${b.refs}`, `${a.errs}→${b.errs}`, lost.length, flag, lost.slice(0, 3).join(' ')].join('\t');
  console.log(row); rows.push(row);
  console.error(`  ${++i}/${edits.length} ${e.title}${flag ? '  ⚠' : ''}`);
}
const t = rows.map(r => r.split('\t'));
const sum = (f: (r: string[]) => boolean) => t.filter(f).length;
console.error(`\nedits ${t.length}; reference count changed ${sum(r => r[2].split('→')[0] !== r[2].split('→')[1])}; `
  + `errors up ${sum(r => +r[3].split('→')[1] > +r[3].split('→')[0])}; errors down ${sum(r => +r[3].split('→')[1] < +r[3].split('→')[0])}; `
  + `links lost ${sum(r => +r[4] > 0)}`);
if (process.env.T19_AUDIT_WIKI) {
  writeFileSync(process.env.T19_AUDIT_WIKI, '{| class="wikitable sortable"\n! ویرایش !! مقاله !! خلاصه\n'
    + edits.map(e => `|-\n| [[ویژه:تفاوت/${e.revid}|${e.revid}]] || [[${e.title}]] || ${e.comment.replace(/\|/g, '{{!}}')}`).join('\n') + '\n|}\n');
}
