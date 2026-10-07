/**
 * Publish gates for fa.wikipedia wikitext — TypeScript access to the shared battery.
 *
 * The checks themselves live in `gates.py` beside this file. It deliberately
 * contains NO checking logic: a second implementation would drift from the
 * first, and the lessons corpus already records what that costs. One
 * implementation, two callers.
 *
 * Every check corresponds to a defect that shipped to a live page at least
 * once, and none of them raises an error — no CS1 error, no cite error, no Lua
 * error, no tracking category, no red link. They cannot be found by testing.
 *
 *   import { checkWikitext, gateOrThrow } from './lib/gates.js';
 *
 *   await gateOrThrow(title, wikitext);   // throws with every problem listed
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Where `gates.py` is, searched in order. Three different layouts have to work and
 * each one broke a run before this list existed:
 *
 *   1. `$BOT_GATES_PY` — an explicit override, for a layout nobody anticipated.
 *   2. beside this module — a normal source checkout, `src/lib/gates.py`.
 *   3. beside the entry script — a BUNDLE. esbuild collapses every module into one
 *      file, so `import.meta.url` is the bundle and (2) resolves to `dist/gates.py`,
 *      which does not exist. The symptom is `spawnSync python3 EPIPE` from the gate,
 *      at the very end of a long run and only in the deployed artifact. The builder
 *      copies gates.py next to each bundle so this entry finds it.
 *   4. `<cwd>/scripts/lib/gates.py` — run from the root of the companion repo of
 *      one-off scripts, which is where this file came from.
 */
function resolveScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const entry = process.argv[1] ? dirname(process.argv[1]) : here;
  const candidates = [
    process.env.BOT_GATES_PY,
    join(here, 'gates.py'),
    join(entry, 'gates.py'),
    join(process.cwd(), 'scripts/lib/gates.py'),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find(p => existsSync(p));
  if (!found) {
    throw new Error('gates.py not found; looked in:\n  - ' + candidates.join('\n  - ')
      + '\nSet BOT_GATES_PY, or ship gates.py beside the bundle.');
  }
  return found;
}

let cached: string | null = null;
/** Resolved on first use, not at import: a bundle's layout is not knowable earlier. */
const script = () => (cached ??= resolveScript());

/** Returns the list of problems; empty means clean. */
export function checkWikitext(title: string, text: string, skip: string[] = []): string[] {
  const r = spawnSync('python3', [script()], {
    input: JSON.stringify({ title, text, skip }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw new Error(`gate could not run: ${r.error.message}`);
  // Exit 2 means the gate itself failed (bad input); exit 0/1 are clean/dirty.
  if (r.status === 2 || !r.stdout) {
    throw new Error(`gate failed to evaluate: ${r.stderr || r.stdout || 'no output'}`);
  }
  return (JSON.parse(r.stdout) as { problems: string[] }).problems;
}

export interface TemplateCall {
  /** offset into the ORIGINAL text, so the caller can splice directly */
  start: number;
  end: number;
  name: string;
  args: string[];
}

/**
 * Locate template calls, using the Python brace-aware scanner.
 *
 * Here for the same reason the rest of this file is: the naive
 * `\{\{X\|[^}]*\}\}` shape has already eaten a closing brace and swallowed a
 * following template in this repo, and a TypeScript re-implementation of the
 * scanner would drift from the Python one exactly like a second copy of a check
 * would. One implementation, two callers.
 *
 * `topLevelOnly` skips calls nested inside another call's argument — required
 * before editing, since excising a nested call edits the outer template's
 * argument rather than the page. `mask` (default true) ignores calls inside
 * comments, <nowiki> and friends, which are display text, not transclusions.
 *
 * Synchronous, so it can be used inside a pure `BotTask.transform()`.
 */
export function templateCalls(
  text: string,
  opts: { topLevelOnly?: boolean; mask?: boolean; name?: string } = {},
): TemplateCall[] {
  const r = spawnSync('python3', [script()], {
    input: JSON.stringify({
      mode: 'calls', text,
      top_level_only: opts.topLevelOnly ?? false,
      mask: opts.mask ?? true,
      ...(opts.name ? { name: opts.name } : {}),
    }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw new Error(`template scanner could not run: ${r.error.message}`);
  if (!r.stdout) throw new Error(`template scanner failed: ${r.stderr || 'no output'}`);
  return (JSON.parse(r.stdout) as { calls: TemplateCall[] }).calls;
}

/**
 * Gate a publish. Throws with every problem listed rather than returning, so a
 * batch aborts on the first bad page instead of shipping it and continuing.
 */
export function gateOrThrow(title: string, text: string, skip: string[] = []): void {
  const problems = checkWikitext(title, text, skip);
  if (problems.length) {
    throw new Error(`GATE FAILED for ${title}:\n  - ${problems.join('\n  - ')}`);
  }
}
