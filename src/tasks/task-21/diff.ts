/**
 * Line diff for scoring: which lines a change added and removed, plus hunks with a little
 * context for the model.
 *
 * Wiktionary entries are short (a few KB), so an exact LCS is affordable. Past a size cap
 * the diff degrades to a multiset difference, which loses order but never loses a line.
 */

export interface Hunk { before: string[]; removed: string[]; added: string[]; after: string[] }
export interface LineDiff { added: string[]; removed: string[]; hunks: Hunk[] }

const LCS_CELL_CAP = 4_000_000;
const CONTEXT = 3;

export function diffLines(oldText: string, newText: string): LineDiff {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  if ((a.length + 1) * (b.length + 1) > LCS_CELL_CAP) return multisetDiff(a, b);

  const n = a.length, m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const added: string[] = [], removed: string[] = [], hunks: Hunk[] = [];
  let i = 0, j = 0;
  let cur: { start: number; removed: string[]; added: string[] } | null = null;
  const close = (endA: number) => {
    if (!cur) return;
    if (cur.removed.some(l => l.trim()) || cur.added.some(l => l.trim())) {
      hunks.push({
        before: a.slice(Math.max(0, cur.start - CONTEXT), cur.start),
        removed: cur.removed, added: cur.added,
        after: a.slice(endA, endA + CONTEXT),
      });
    }
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { close(i); i++; j++; continue; }
    cur ??= { start: i, removed: [], added: [] };
    if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      cur.removed.push(a[i]); if (a[i].trim()) removed.push(a[i]); i++;
    } else {
      cur.added.push(b[j]); if (b[j].trim()) added.push(b[j]); j++;
    }
  }
  close(i);
  return { added, removed, hunks };
}

function multisetDiff(a: string[], b: string[]): LineDiff {
  const count = new Map<string, number>();
  for (const l of a) count.set(l, (count.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of b) {
    const c = count.get(l) ?? 0;
    if (c > 0) count.set(l, c - 1); else if (l.trim()) added.push(l);
  }
  const removed: string[] = [];
  for (const [l, c] of count) for (let k = 0; k < c; k++) if (l.trim()) removed.push(l);
  return { added, removed, hunks: [{ before: [], removed, added, after: [] }] };
}

/** The diff as the model sees it: unified-style, with context, capped. */
export function renderForModel(d: LineDiff, maxChars: number): { text: string; truncated: boolean } {
  const parts: string[] = [];
  for (const h of d.hunks) {
    parts.push('@@');
    for (const l of h.before) parts.push(`  ${l}`);
    for (const l of h.removed) parts.push(`- ${l}`);
    for (const l of h.added) parts.push(`+ ${l}`);
    for (const l of h.after) parts.push(`  ${l}`);
  }
  const text = parts.join('\n');
  return text.length > maxChars
    ? { text: text.slice(0, maxChars), truncated: true }
    : { text, truncated: false };
}
