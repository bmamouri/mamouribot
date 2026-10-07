/**
 * The accumulated worklist behind «ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی».
 *
 * WHY A STORE AND NOT JUST THIS RUN'S FINDINGS
 * --------------------------------------------
 * A value clash is recorded while the page is being processed, and a processed page is
 * parked in the checkpoint, so it is never visited again. If the report page were built
 * from the current run alone, then the run that finds one clash OVERWRITES a page
 * listing fifty, and the forty-nine are gone from the wiki with nothing on disk that
 * remembers them — the report page would destroy its own contents as it went. Exactly
 * the failure the review page exists to prevent: work set aside for a human and then
 * made invisible.
 *
 * So findings are kept on disk beside the resume checkpoint (NFS on Toolforge, so they
 * survive a rescheduled job) and the page is rebuilt from the union every time.
 *
 * Merging is BY TITLE and the newest reading wins: re-examining an article must be able
 * to say "this one is clean now" and have the row disappear, otherwise the list only
 * ever grows and stops matching the wiki. A title whose clashes are gone is dropped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { Conflict } from './normalize-cite-params.js';

export interface ReviewRow { title: string; conflicts: Conflict[]; seen: number }

export function storePath(taskId = 'normalize-cite-params'): string {
  return `${process.env.BOT_STATE_DIR ?? '.state'}/${taskId}.conflicts.json`;
}

/** Tolerates an absent, empty or malformed file: a lost worklist must not stop a run. */
export function parseStore(raw: unknown): ReviewRow[] {
  const rows = Array.isArray(raw) ? raw : (raw as any)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) =>
    r && typeof r.title === 'string' && Array.isArray(r.conflicts),
  ).map((r: any) => ({ title: r.title, conflicts: r.conflicts, seen: Number(r.seen) || 0 }));
}

/**
 * Fold a fresh reading into what is already known.
 *
 * `fresh` is every title LOOKED AT this time, including the ones that turned out clean —
 * that is what lets a fixed article leave the list. A title absent from `fresh` was not
 * examined and keeps whatever was recorded for it.
 */
export function mergeReview(
  stored: ReviewRow[], fresh: { title: string; conflicts: Conflict[] }[], now = Date.now(),
): ReviewRow[] {
  const out = new Map(stored.map(r => [r.title, r]));
  for (const f of fresh) {
    if (f.conflicts.length) out.set(f.title, { title: f.title, conflicts: f.conflicts, seen: now });
    else out.delete(f.title);
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title, 'fa'));
}

/**
 * The store, plus whether it was actually THERE.
 *
 * `existed` is not a nicety. `loadStore` returning `[]` is ambiguous: it means both
 * "nothing is pending" and "this machine has no copy of the worklist", and those demand
 * opposite behaviour. The second case happened — a run started from a laptop, whose
 * BOT_STATE_DIR had no conflicts.json because the store lives on Toolforge, merged an
 * empty store with two clean titles and republished the report page at 972 bytes,
 * destroying the 38 articles on it. Callers must be able to tell the two apart.
 */
export function loadStoreChecked(path = storePath()): { rows: ReviewRow[]; existed: boolean } {
  if (!existsSync(path)) return { rows: [], existed: false };
  try { return { rows: parseStore(JSON.parse(readFileSync(path, 'utf8'))), existed: true }; }
  catch { return { rows: [], existed: true } }
}

export function loadStore(path = storePath()): ReviewRow[] {
  return loadStoreChecked(path).rows;
}

export function saveStore(rows: ReviewRow[], path = storePath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ v: 1, rows }, null, 1));
}
