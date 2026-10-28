/**
 * The network-free half of the Iranica report, in the shape `build-bundle.ts` gates.
 * Each assertion is a defect the hand-run survey actually produced, or one the source
 * fallback exists to catch.
 */
import frozen from './data/iranica-match.json' with { type: 'json' };
import { checkWikitext } from '../../lib/gates.js';
import {
  CAP, MIN_ENTRIES, SKIP, SUBPAGES, REPORT_PAGE, buildImprove, buildPages, entryLink, grade,
  isChallenge, parentOf, parseEntry, parseSitemap, parseSitemapIndex, proseWords, slugOf,
  type EntryMeta, type FaQuality,
} from './iranica-report.js';

export function selfTest(): string {
  const F = (m: string) => `SELFTEST FAILED: ${m}`;

  // slugs: percent-encoded and decoded spellings are ONE entry (112 were lost to this)
  if (slugOf('https://www.iranicaonline.org/articles/%e1%b8%b5ores/') !== 'ḵores') return F('percent-decoding');
  if (slugOf('http://iranicaonline.org/articles/Hafez-IV') !== 'hafez-iv') return F('case / trailing slash');
  if (slugOf('https://www.iranicaonline.org/') !== null) return F('non-entry URL accepted');
  if (parentOf('hafez/hafez-iv-manuscripts') !== 'hafez' || parentOf('bisotun-iii') !== 'bisotun') return F('parentOf');
  if (!SKIP.test('rahi-cross-reference') || !SKIP.test('4-28-tork-casmas') || SKIP.test('korsi')) return F('SKIP');

  // source fallback: the challenge page must be recognised, a real page must not be
  const challenge = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>';
  if (!isChallenge(403, challenge) || !isChallenge(200, challenge)) return F('challenge not recognised');
  if (isChallenge(200, '<?xml version="1.0"?><urlset><url><loc>x</loc></url></urlset>')) return F('sitemap taken for a challenge');
  if (parseSitemap(challenge).length !== 0) return F('a challenge page parsed as entries');
  if (MIN_ENTRIES < 5000) return F('MIN_ENTRIES too low to catch a truncated sitemap');
  const idx = '<sitemap><loc>https://www.iranicaonline.org/articles-sitemap.xml</loc></sitemap>'
    + '<sitemap><loc>https://www.iranicaonline.org/articles-sitemap10.xml</loc></sitemap>'
    + '<sitemap><loc>https://www.iranicaonline.org/post-sitemap.xml</loc></sitemap>';
  if (parseSitemapIndex(idx).length !== 2) return F('sitemap index: only articles-sitemap*.xml');

  // entry page parsing (shape of the live page, ۲۹ اکتبر ۲۰۲۶)
  const page = '<h1>KORSI</h1><span class="authors-block"> Willem M. Floor </span>'
    + '<span class="article-meta">Published</span>June 11, 2021</p> one two three four Bibliography five six Cite this article';
  const e = parseEntry(page);
  if (e.t !== 'KORSI' || e.a !== 'Willem M. Floor') return F(`entry head/author: ${JSON.stringify(e)}`);
  if (e.w !== 4) return F(`entry words ${e.w}: the date line and the bibliography are not body`);

  // prose words: «خاندان هخامنشی» is 8.8 KB and a stub; infobox and refs are not prose
  const wt = '{{جعبه اطلاعات|a=b|c={{x}}}}\n\'\'\'الف\'\'\' یک دو سه.<ref>{{یادکرد|عنوان=بسیار بسیار بلند}}</ref>\n'
    + '* فهرست نیست\n{| class="wikitable"\n| جدول نیست\n|}\n== منابع ==\nواژه‌های منبع';
  if (proseWords(wt) !== 4) return F(`proseWords ${proseWords(wt)}, expected 4`);
  if (grade({ words: 900, stub: true, ga: false, featured: false }) !== 'خرد') return F('stub tag must win');
  if (grade({ words: 200, stub: false, ga: true, featured: false }) !== 'خوب') return F('GA must win over length');
  if (grade({ words: 1200, stub: false, ga: false, featured: false }) !== 'متوسط') return F('grade bands');

  // the frozen match file: survived bundling, and the hand-removed wrong matches stay out
  const fz = frozen as unknown as Record<string, string[]>;
  if (Object.keys(fz).length < 3000) return F(`frozen matches: ${Object.keys(fz).length}`);
  if (fz['ahura-mazda']?.[0] !== 'اهورامزدا') return F('ahura-mazda → اهورامزدا');
  if ((fz['armor']?.[1] ?? '').includes('film')) return F('armor matched to a film again');
  if (fz['bahman-vohu-manah/bahman-i-in-the-avesta']?.[0] === 'بهمن') return F('Vohu Manah matched to the month');
  if (fz['darius-i']?.[1] === 'Dariush') return F('Darius I matched to a name page');

  // rows: a redirect and its target are one article, one row
  const q: FaQuality = { title: 'الف', words: 100, refs: 1, stub: true, ga: false, featured: false, cites: false, views: 10 };
  const quality = new Map([['الف', q], ['الف (تغییرمسیر)', q]]);
  const match = new Map([['a-1', { fa: 'الف' }], ['a-2', { fa: 'الف (تغییرمسیر)' }], ['b', { fa: 'ب' }]]);
  const meta: Record<string, EntryMeta> = { 'a-1': { t: 'A i. X', w: 1000 }, 'a-2': { t: 'A ii. [Y] | Z', w: 500 } };
  const rows = buildImprove(match, quality, meta);
  if (rows.length !== 1 || rows[0].slugs.length !== 2 || rows[0].irWords !== 1500) return F(`improve rows ${JSON.stringify(rows)}`);
  if (/\[Y\]|\| Z/.test(entryLink('a-2', meta))) return F('headword brackets/pipes leak into the link');

  const pages = buildPages(rows, [{ en: 'Korsi', slugs: ['korsi'], enBytes: 12729, views: 2160, irWords: null }],
    [{ slugs: ['x'], irWords: null }], [{ slug: 'y', guess: 'ی' }], meta,
    { entries: 8814, skipped: 275, source: 'wayback', withFa: 2, measured: 2 });
  if (pages.length !== 7 || pages[pages.length - 1].page !== REPORT_PAGE) return F('main page must be written last');
  if (!pages.some(p => p.page === SUBPAGES.unsure)) return F('unsure subpage missing');
  for (const p of pages) {
    if (!p.text.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return F(`category missing on ${p.page}`);
    if (p.text.includes('—')) return F(`em dash on ${p.page}`);
    const problems = checkWikitext(p.page, p.text).filter(x => !x.includes('signature leak'));
    if (problems.length) return F(`gate on ${p.page}: ${problems.join('; ')}`);
  }
  if (CAP.stub * 300 > 400_000) return F('stub cap would push a page past ~400 KB');
  return 'SELFTEST OK: ایرانیکا';
}
