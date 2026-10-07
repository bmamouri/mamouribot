/**
 * Write-free trial for وظیفهٔ ۹, at the ARTICLE level.
 *
 * The bot edits templates, but what matters is what the reader sees in the
 * taxobox of the articles that transclude them. For a sample of candidate
 * templates this renders a real transcluding article TWICE — once as it is live,
 * once with `templatesandboxtext` substituting the bot's proposed template text —
 * and compares:
 *
 *   - the rank row the template feeds (Latin before → Persian after)
 *   - the number of red links in the whole page (must not grow)
 *   - the number of Scribunto/template error markers (must not grow)
 *
 * Nothing is saved.
 *
 *   npx tsx src/tasks/taxonomy-link-localize.trial.ts [--limit=N] [--out=path]
 */
import { readFileSync, writeFileSync } from 'fs';
import { Bot } from '../../core.js';
import { linkLineFor, LINK_LINE, displayName } from './taxonomy-link-localize.js';

const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 100);
const OUT = process.argv.find(a => a.startsWith('--out='))?.split('=')[1] ?? 'scripts/archive/taxonomy-localize/data/trial.json';
type C = { title: string; taxon: string; rank: string; oldLine: string; newLine: string };

const strip = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const redlinks = (h: string) => (h.match(/redlink=1/g) ?? []).length;
const errors = (h: string) => (h.match(/scribunto-error/g) ?? []).length + (h.match(/class="error/g) ?? []).length;

/**
 * The taxobox row for a rank. The box is a table of
 * `<tr><td>سرده:</td><td><i><a …>Lathyrus</a></i></td></tr>` — read the value cell
 * of the row whose label cell is this rank, and return its visible text.
 */
function rankRow(html: string, label: string): string | null {
  const re = new RegExp(`<td>\\s*${label}\\s*:?\\s*</td>\\s*<td>([\\s\\S]*?)</td>`, 'g');
  const hits = [...html.matchAll(re)].map(m => strip(m[1]).trim()).filter(Boolean);
  return hits.length ? hits[hits.length - 1] : null; // the taxobox is the last such table on the page
}
const RANK_LABEL: Record<string, string> = {
  genus: 'سرده', Genus: 'سرده', familia: 'تیره', Familia: 'تیره', ordo: 'راسته', Ordo: 'راسته',
  classis: 'رده', Classis: 'رده', phylum: 'شاخه', divisio: 'شاخه', regnum: 'فرمانرو',
  subfamilia: 'زیرتیره', Subfamilia: 'زیرتیره', superfamilia: 'اَبَرتیره', Superfamilia: 'اَبَرتیره',
  tribus: 'قبیله', subordo: 'زیرراسته', infraordo: 'فروراسته', superordo: 'اَبَرراسته',
  subclassis: 'زیررده', clade: 'کلاد', unranked: 'کلاد', species: 'گونه',
};

// read-only: the framework's HTTP client, never logged in, never asked to edit
const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });
const apiGet = (p: Record<string, string>) => bot.apiGet(p);
const apiPost = (p: Record<string, string>) => bot.apiPost(p);

async function main() {
  const all: C[] = JSON.parse(readFileSync('scripts/archive/taxonomy-localize/data/candidates-ok.json', 'utf8'));
  // Only templates that actually feed an article today can be render-compared;
  // the rest are latent (they will style a future article's taxobox).
  const impact: Record<string, string[]> = JSON.parse(readFileSync('scripts/archive/taxonomy-localize/data/impact.json', 'utf8'));
  const cands = all.filter(c => (impact[c.title] ?? []).length > 0);
  // spread the sample across the whole alphabetised set rather than taking the first N
  const step = Math.max(1, Math.floor(cands.length / LIMIT));
  const sample = cands.filter((_, i) => i % step === 0).slice(0, LIMIT);

  const rows: any[] = [];
  let checked = 0, rowFixed = 0, noArticle = 0, redlinkGrew = 0, errGrew = 0;

  for (const c of sample) {
    try {
      const article = (impact[c.title] ?? [])[0];
      if (!article) { noArticle++; rows.push({ ...c, skip: 'بدون مقالهٔ تراگنجانده' }); continue; }

      const cur: any = await apiGet({ action: 'query', titles: c.title, prop: 'revisions', rvprop: 'content', rvslots: 'main' });
      const text: string = cur.query.pages[0].revisions[0].slots.main.content;
      const line = text.match(LINK_LINE);
      if (!line) { rows.push({ ...c, skip: 'خط link نیست' }); continue; }
      const fa = c.newLine.slice('|link='.length).split('|')[0];
      const newText = text.replace(LINK_LINE, () => linkLineFor(fa));

      const before: any = await apiGet({ action: 'parse', page: article, prop: 'text', disablelimitreport: '1' });
      const after: any = await apiPost({
        action: 'parse', page: article, prop: 'text', disablelimitreport: '1',
        templatesandboxtitle: c.title, templatesandboxtext: newText, templatesandboxcontentmodel: 'wikitext',
      });
      const hb: string = before.parse?.text ?? '', ha: string = after.parse?.text ?? '';
      if (!hb || !ha) { rows.push({ ...c, article, skip: 'رندر ناموفق' }); continue; }

      const label = RANK_LABEL[c.rank];
      const rb = label ? rankRow(hb, label) : null, ra = label ? rankRow(ha, label) : null;
      const rl = { before: redlinks(hb), after: redlinks(ha) };
      const er = { before: errors(hb), after: errors(ha) };
      const disp = displayName(fa);
      const fixed = !!label && !!ra && ra.includes(disp);
      checked++;
      if (fixed) rowFixed++;
      if (rl.after > rl.before) redlinkGrew++;
      if (er.after > er.before) errGrew++;
      rows.push({ ...c, article, label, rowBefore: rb, rowAfter: ra, fixed, redlinks: rl, errors: er });
      console.log(`${fixed ? '✓' : '·'} ${c.taxon} @ ${article}: ${label ?? c.rank} «${rb}» → «${ra}»  پیوند سرخ ${rl.before}→${rl.after}  خطا ${er.before}→${er.after}`);
    } catch (e) {
      rows.push({ ...c, error: (e as Error).message });
      console.log(`! ${c.taxon}: ${(e as Error).message}`);
    }
  }

  const summary = { sampled: sample.length, rendered: checked, rowFixed, noArticle, redlinkGrew, errGrew };
  writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
  console.log('\n', summary);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
