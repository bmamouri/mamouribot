/**
 * The network-free half of وظیفهٔ ۱۳'s neighbour-wikis reports, in the shape the
 * bundler's gate runs. Same reasoning as the other three selftests in this task: a
 * bundle that imports cleanly but whose merge or table builder was mangled would look
 * healthy right up until it published a page over the four hand-run reports it replaces.
 */
import {
  HAS_PERSIAN_LETTER, REPORTS, SITES, buildReport, candidatesSql, chunk, mergeCandidates,
  resolveRedirectChain,
  type NeighborRow, type RawCandidate, type SiteKey,
} from './neighbor-wikis-report.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  // Structural pages never reach the TypeScript side at all — the SQL prefilter drops
  // anything with a colon — but prove the SQL text actually says so, since that is the
  // one guard that cannot be unit-tested without a live replica.
  const sql = candidatesSql('arwiki');
  if (!sql.includes("NOT LIKE '%:%'")) return 'SELFTEST FAILED: the colon prefilter is missing from the SQL';
  if (!sql.includes("fawiki")) return 'SELFTEST FAILED: the fa-sitelink exclusion is missing from the SQL';

  if (chunk([1, 2, 3, 4, 5], 2).length !== 3) return 'SELFTEST FAILED: chunk() sizing';

  // The bridge bug, ۱۳ اکتبر ۲۰۲۶: an item's own enwiki sitelink can be a page that is
  // ITSELF a local redirect — possibly through more than one hop — to a page belonging
  // to a DIFFERENT item. resolveRedirectChain must follow the whole chain and must not
  // spin forever on a redirect loop.
  const chainPairs = new Map([
    ['Industry (manufacturing)', 'Manufacturing'],       // مازندرانی «صنعت», one hop
    ['Air', 'Atmosphere of Earth'],                       // عربی «هواء», one hop
    ['Woody weedkiller', '2,4-Dichlorophenoxyacetic acid'],
    ['2,4-Dichlorophenoxyacetic acid', '2,4-D'],          // two hops, chained
  ]);
  if (resolveRedirectChain('Industry (manufacturing)', chainPairs) !== 'Manufacturing') {
    return 'SELFTEST FAILED: one-hop redirect not resolved';
  }
  if (resolveRedirectChain('Woody weedkiller', chainPairs) !== '2,4-D') {
    return 'SELFTEST FAILED: two-hop chain not fully resolved';
  }
  if (resolveRedirectChain('Manufacturing', chainPairs) !== 'Manufacturing') {
    return 'SELFTEST FAILED: a non-redirect title must return itself';
  }
  const loop = new Map([['A', 'B'], ['B', 'A']]);
  if (resolveRedirectChain('A', loop) === undefined) {
    return 'SELFTEST FAILED: a redirect loop must terminate, not throw/hang';
  }

  // enwiki has an article titled «ب» (the Arabic letter Beh), the mirror of «Ñ»/«Š» in
  // move-report.ts. Linking it as [[:en:ب]] is indistinguishable from the dead-interwiki
  // mistake the publish gate exists to catch, so it must be recognised and dropped.
  if (!HAS_PERSIAN_LETTER.test('ب')) return 'SELFTEST FAILED: Persian-letter guard does not match «ب»';
  if (HAS_PERSIAN_LETTER.test('Airbus')) return 'SELFTEST FAILED: Persian-letter guard false-positives on Latin text';

  // Merge: an item found under two sites keeps the LARGER sitelink count (never the
  // sum, never whichever site happened to be read last) and the union of sources.
  const merged = mergeCandidates([
    ['ar', [{ itemId: 1, title: 'مثال', sitelinks: 10 }, { itemId: 2, title: 'ب', sitelinks: 3 }]],
    ['tr', [{ itemId: 1, title: 'Örnek', sitelinks: 12 }]],
  ]);
  if (merged.get(1)?.sitelinks !== 12) return `SELFTEST FAILED: merge kept ${merged.get(1)?.sitelinks}, expected max(10,12)`;
  if (merged.get(1)?.sources.join(',') !== 'ar,tr') return `SELFTEST FAILED: sources ${merged.get(1)?.sources}`;
  // The title shown for a multi-site item is the FIRST site's own title — ar:مثال, not
  // tr:Örnek — because `sources[0]` is set once on first sight and never overwritten.
  if (merged.get(1)?.title !== 'مثال') return `SELFTEST FAILED: title overwritten by second site: ${merged.get(1)?.title}`;
  if (merged.get(2)?.sources.join(',') !== 'ar') return 'SELFTEST FAILED: single-site item lost its source';

  // A duplicate sighting of the SAME item on the SAME site must not duplicate the
  // source entry — exercises the `!includes` guard in mergeCandidates.
  const dup = mergeCandidates([
    ['ar', [{ itemId: 9, title: 'ت', sitelinks: 5 }, { itemId: 9, title: 'ت', sitelinks: 5 }]],
  ]);
  if (dup.get(9)?.sources.length !== 1) return `SELFTEST FAILED: duplicate source entry, ${dup.get(9)?.sources}`;

  // Table rendering: single-site report has no «ویکی‌های دارنده» column; the combined
  // (mideast) report does.
  const row: NeighborRow = { itemId: 42, title: 'هواء', sitelinks: 142, sources: ['ar'] as SiteKey[] };
  const single = buildReport(REPORTS.ar, [row], 1);
  if (single.includes('ویکی‌های دارنده')) return 'SELFTEST FAILED: single-site report grew the combined column';
  if (!single.includes('[[:ar:هواء|هواء]]')) return 'SELFTEST FAILED: source-wiki link missing or malformed';
  if (!single.includes('[[:d:Q42]]')) return 'SELFTEST FAILED: Wikidata item link missing';
  if (!single.includes('{{formatnum:142}}')) return 'SELFTEST FAILED: sitelink count not grouped';

  const combinedRow: NeighborRow = { itemId: 7, title: 'شيء', sitelinks: 80, sources: ['ar', 'he'] as SiteKey[] };
  const combined = buildReport(REPORTS.mideast, [combinedRow], 1);
  if (!combined.includes('ویکی‌های دارنده')) return 'SELFTEST FAILED: combined report missing its extra column';
  if (!combined.includes(`${SITES.ar.label}، ${SITES.he.label}`)) {
    return 'SELFTEST FAILED: combined report did not list both source wikis';
  }

  // No en title: must render a placeholder, never an empty [[:en:]] link.
  const noEn: NeighborRow = { itemId: 1, title: 'ب', sitelinks: 1, sources: ['ckb'] as SiteKey[] };
  const text = buildReport(REPORTS.ckb, [noEn], 1);
  if (text.includes('[[:en:')) return 'SELFTEST FAILED: empty en title leaked a link';
  if (!text.includes('| ـ')) return 'SELFTEST FAILED: missing en title must render a placeholder';

  for (const [name, t] of [['single', single], ['combined', combined], ['no-en', text]] as const) {
    const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', t)
      .filter(p => !p.includes('signature leak'));
    if (problems.length) return `SELFTEST FAILED: gate on ${name}: ${problems.join('; ')}`;
  }
  return 'SELFTEST OK: ادغام، فیلتر ساختاری و جدول‌های چهارگانه';
}
