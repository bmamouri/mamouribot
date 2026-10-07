/**
 * Guards the vendored copies of the shared fa.wikipedia helpers.
 *
 *   npm run check:vendored
 *
 * WHY THIS EXISTS
 * ---------------
 * This repository has to be self-contained: a Toolforge job clones it alone, so
 * `src/lib/` cannot import out of the tree. But the same helpers are also used by
 * the one-off scripts in the companion repository (`bmamouri/wikipedia`), where
 * this one is checked out as the `bots/` submodule. Two copies of a file is
 * exactly how one of them quietly stops matching the other, and a publish gate
 * that has drifted is worse than no gate: it passes, and the defect ships.
 *
 * The TESTS of the vendored files are vendored too, and for the same reason: the
 * parent repo's vitest only globs `tests/**`, so `scripts/lib/checkpoint.test.ts` and
 * `test_gates.py` ran nowhere automatically. Here they are inside `npm test`, which
 * means gates.py — the most load-bearing file either repo shares — finally has its
 * battery exercised on every build.
 *
 * So the second copy is allowed, and the drift is turned into a failing check.
 * When the parent repository is present on disk, every vendored file must be
 * byte-identical to its original. When it is not present (Toolforge, CI, a bare
 * clone), there is nothing to compare against and the check reports that and
 * passes.
 *
 * Fixing a failure means copying one way or the other on purpose — never editing
 * one side and leaving the other, and never summarising or reformatting a file to
 * make a diff go away.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);

/** Vendored file -> path inside the parent repository. */
const VENDORED: Record<string, string> = {
  'gates.py': 'scripts/lib/gates.py',
  'is-main.ts': 'scripts/lib/is-main.ts',
  'fa-wiki.ts': 'scripts/lib/fa-wiki.ts',
  'checkpoint.ts': 'scripts/lib/checkpoint.ts',
  'checkpoint.test.ts': 'scripts/lib/checkpoint.test.ts',
  'test_gates.py': 'scripts/lib/test_gates.py',
  'notelist.ts': 'scripts/lib/notelist.ts',
  'infobox-software.ts': 'scripts/lib/infobox-software.ts',
  'infobox-software-map.ts': 'scripts/lib/infobox-software-map.ts',
};

/**
 * Deliberate exceptions, with the reason. An entry here is a promise that the
 * file carries no checking or transforming logic of its own — only the plumbing
 * that differs between the two repositories.
 */
const DIVERGES_ON_PURPOSE: Record<string, string> = {
  'gates.ts':
    'finds gates.py by searching BOT_GATES_PY, then beside itself, then beside the ' +
    'entry script, then <cwd>/scripts/lib — because a Toolforge job runs from the ' +
    'tool home, and inside a bundle "beside itself" resolves to dist/. The parent ' +
    'repo only ever runs from its own root and needs none of that. All of the ' +
    'checking lives in gates.py, which IS compared.',
};

/** The parent repo when this is the `bots/` submodule; null when standalone. */
function parentRepo(): string | null {
  const up = dirname(REPO);
  return existsSync(join(up, 'scripts', 'lib', 'gates.py')) ? up : null;
}

export function checkVendored(): { problems: string[]; compared: number; parent: string | null } {
  const parent = parentRepo();
  const problems: string[] = [];
  if (!parent) return { problems, compared: 0, parent };

  let compared = 0;
  for (const [file, origin] of Object.entries(VENDORED)) {
    const mine = join(REPO, 'src', 'lib', file);
    const theirs = join(parent, origin);
    if (!existsSync(mine)) {
      problems.push(`${file}: listed as vendored but missing from src/lib/`);
      continue;
    }
    if (!existsSync(theirs)) {
      problems.push(`${file}: original ${origin} is gone from the parent repo — decide which copy is now canonical`);
      continue;
    }
    compared++;
    const a = readFileSync(mine);
    const b = readFileSync(theirs);
    if (!a.equals(b)) {
      problems.push(
        `${file}: src/lib/${file} and ${origin} have drifted ` +
          `(${a.length} vs ${b.length} bytes) — diff them and copy one way on purpose`,
      );
    }
  }
  return { problems, compared, parent };
}

const { problems, compared, parent } = checkVendored();
if (!parent) {
  console.log('vendored-copy check: parent repo not on disk (standalone clone) — nothing to compare');
} else {
  console.log(`vendored-copy check: compared ${compared} file(s) against ${parent}`);
  for (const [file, why] of Object.entries(DIVERGES_ON_PURPOSE)) {
    console.log(`  exempt: ${file} — ${why}`);
  }
}
if (problems.length) {
  console.error('\nDRIFT:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('vendored-copy check: OK');
