/**
 * Build the dependency-free bundles Toolforge runs, and GATE each one.
 *
 * Use this rather than calling esbuild by hand: the `__BUNDLED__` define is not
 * optional. Without it, every `isMain(import.meta.url)` guard in a bundle is
 * true at once (a bundle collapses all modules into one file, so each module's
 * `import.meta.url` is the bundle, which equals `process.argv[1]`), and the
 * destub report publisher runs as a side effect of any task invoked with
 * `--live` — which is how a Toolforge job command always invokes it.
 *
 * Three entry points, three separate on-box jobs:
 *   dist/bot-run.mjs          — run.ts: manual/one-off dispatch of any
 *                               registered BotTask (`node bot-run.mjs <id> --live …`).
 *   dist/destub-watch.mjs     — destub-watch.ts: the continuous poller,
 *                               scheduled every few minutes; not a BotTask
 *                               itself (it calls destubTask through core.ts
 *                               internally), so it is not reachable through
 *                               run.ts's dispatcher at all.
 *   dist/destub-inventory.mjs — destub-inventory.ts: rebuilds
 *                               stub-templates.json, scheduled monthly.
 *                               loadInventory() refuses a copy older than 30
 *                               days, so a "forever" watcher silently stops
 *                               doing anything once the file ages past that —
 *                               this is what keeps it from ever getting there.
 *
 * All three were, until recently, ONE file each with an `isMain()`-guarded
 * self-invocation at the bottom. That guard is correct ONLY for a module
 * bundled as a dependency inside another entry's bundle (destub-inventory's
 * own library half is also bundled that way, transitively, inside
 * dist/bot-run.mjs) — under `__BUNDLED__`, `isMain()` returns false
 * UNCONDITIONALLY, which silently disables a module's own main() the moment it
 * is bundled SOLO, which is exactly what destub-watch.ts and destub-inventory.ts
 * are here. Each was split into a thin CLI entry (unconditional `main()`, like
 * run.ts — nothing imports it) plus a `-lib.ts` file importers actually use.
 *
 * Every bundle gets gate 1 — the one that matters, and STATIC. It asserts the
 * define actually reached `isMain` in the output. A runtime "run a bogus task
 * and expect one line" check looks stronger but is false assurance: an unknown
 * task id exits immediately, killing the promises a fired main() started, so a
 * broken bundle and a correct one print the same thing. That was measured, not
 * assumed. Gate 2 differs per entry point because each has a different
 * network-free failure path to prove it reaches without crashing.
 *
 *   npx tsx tools/build-bundle.ts
 */
import { spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname } from 'path';
import { tmpdir } from 'os';

/**
 * esbuild is a TRANSITIVE dependency here, not a direct one, so a bare
 * `import 'esbuild'` does not resolve. Find the newest copy pnpm unpacked
 * instead of hardcoding a version that silently rots on the next install.
 */
function loadEsbuild() {
  const req = createRequire(import.meta.url);
  try { return req('esbuild'); } catch { /* not a direct dep — look in the store */ }
  const store = 'node_modules/.pnpm';
  const dirs = readdirSync(store)
    .filter(d => /^esbuild@\d/.test(d))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!dirs.length) throw new Error('esbuild not found in node_modules/.pnpm — run pnpm install');
  const pick = dirs[dirs.length - 1];
  console.log(`esbuild: ${pick}`);
  return req(`${process.cwd()}/${store}/${pick}/node_modules/esbuild`);
}
const { build } = loadEsbuild();

/** gate 1: the define really reached isMain — identical for every bundle. */
function gate1(out: string) {
  const bundle = readFileSync(out, 'utf8');
  if (bundle.includes('__BUNDLED__')) {
    console.error(`\nGATE 1 FAILED (${out}) — the __BUNDLED__ define did not reach the bundle.\n` +
      'Every isMain() guard inside it can fire, so running ANY entry point ' +
      'with --live can also run the destub report publisher. See src/lib/is-main.ts.');
    process.exit(1);
  }
  // A bundle whose dependency graph never calls isMain() (destub-inventory.ts
  // and destub-watch.ts's own CLI entries, after the lib split) legitimately
  // doesn't contain the function at all — there is nothing to fold, and that
  // is correct, not a gate failure.
  if (bundle.includes('function isMain')) {
    const folded = /function isMain\([^)]*\)\s*\{\s*if \(true\) return false;/.test(bundle);
    if (!folded) {
      console.error(`\nGATE 1 FAILED (${out}) — isMain() in the bundle does not short-circuit to false.\n` +
        'Expected the define to fold its first line into `if (true) return false;`. ' +
        'If esbuild changed how it folds this, update the check — do not drop it.');
      process.exit(1);
    }
    console.log(`  گیت ۱: همهٔ محافظ‌های isMain خاموش‌اند ✓  (${out})`);
  } else {
    console.log(`  گیت ۱: isMain() در این بسته اصلاً نیست — نیازی هم نبود ✓  (${out})`);
  }
}

/**
 * The gate battery is a Python file, so it cannot be bundled. Every bundle that may
 * call checkWikitext needs it on disk beside the entry: inside a bundle,
 * `import.meta.url` is the bundle, so gates.ts resolving gates.py "next to itself"
 * lands on `dist/gates.py`. Without this copy the gate dies with
 * `spawnSync python3 EPIPE` at the end of a long run, and only in the deployed
 * artifact. See the resolution order in src/lib/gates.ts.
 */
function shipGates(dir: string) {
  copyFileSync('src/lib/gates.py', `${dir}/gates.py`);
  console.log(`  همراه: ${dir}/gates.py`);
}

async function buildOne(entry: string, out: string) {
  mkdirSync(dirname(out), { recursive: true });
  await build({
    entryPoints: [entry], bundle: true, platform: 'node', target: 'node20',
    format: 'esm', outfile: out,
    define: { __BUNDLED__: 'true' },   // the whole point of this file — see src/lib/is-main.ts
    // An ESM bundle has no `require`, but a CommonJS dependency rolled into it may still
    // call one at RUN time, and esbuild leaves that as a stub that throws «Dynamic require
    // of "buffer" is not supported». It is invisible until the code path actually runs:
    // the move-report bundle built, passed both gates and its own selftest, and died on
    // the tool the first time it reached the replica, because mysql2 → sql-escaper
    // requires `buffer` dynamically.
    //
    // This shim gives the bundle a real `require`. Keep it on every bundle, not just the
    // one that needed it: the next CJS dependency will fail the same way, equally late.
    banner: {
      js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
    },
  });
  console.log(`ساخته شد: ${out}`);
  gate1(out);
  shipGates(dirname(out));
}

// ---- dist/bot-run.mjs ----
await buildOne('src/run.ts', 'dist/bot-run.mjs');
{
  // gate 2: loads and dispatches at all. Weaker on purpose (see header) — this
  // only proves no import-time crash and that the task registry is reachable.
  const r = spawnSync('node', ['dist/bot-run.mjs', '__gate_no_such_task__', '--live', '--delay', '12'], {
    encoding: 'utf8', env: { ...process.env, BOT_STATE_DIR: '/tmp/bot-bundle-gate' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (!out.startsWith('وظیفهٔ ناشناخته')) {
    console.error('\nGATE 2 FAILED (dist/bot-run.mjs) — did not dispatch cleanly:');
    console.error(out.slice(0, 2000));
    process.exit(1);
  }
  console.log('  گیت ۲: وظیفه‌ها را می‌شناسد ✓  (dist/bot-run.mjs)');
}

// ---- toolforge/mamouribot.mjs ----
// The deployed artifact is a COPY of the gated bundle, never a separate esbuild
// run: a hand-built bundle is missing the __BUNDLED__ define, which is the whole
// reason this file exists. toolforge/run.sh execs it by this name.
copyFileSync('dist/bot-run.mjs', 'toolforge/mamouribot.mjs');
shipGates('toolforge');
console.log('ساخته شد: toolforge/mamouribot.mjs (رونوشت از dist/bot-run.mjs)');

// ---- dist/move-report.mjs ----
await buildOne('src/tasks/task-13/move-report-cli.ts', 'dist/move-report.mjs');
{
  // gate 2: the rule engine itself, with no network and no database. An entry that
  // imported cleanly but whose rules were folded wrong by bundling would otherwise
  // look healthy right up to the moment it published a page of wrong proposals.
  const r = spawnSync('node', ['dist/move-report.mjs', '--selftest'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (!out.startsWith('SELFTEST OK')) {
    console.error('\nGATE 2 FAILED (dist/move-report.mjs) — the rules did not survive bundling:');
    console.error(out.slice(0, 2000));
    process.exit(1);
  }
  console.log(`  گیت ۲: ${out} ✓  (dist/move-report.mjs)`);
}
copyFileSync('dist/move-report.mjs', 'toolforge/move-report.mjs');
console.log('ساخته شد: toolforge/move-report.mjs (رونوشت از dist/move-report.mjs)');

// ---- dist/destub-watch.mjs ----
await buildOne('src/tasks/task-10/destub-watch.ts', 'dist/destub-watch.mjs');
{
  // gate 2: destub-watch.ts has no task registry to probe, so the deterministic
  // network-free failure is different — `poll()`'s very first line is
  // `loadInventory()`, which reads a path relative to CWD (not BOT_STATE_DIR;
  // that env var only moves core.ts's OWN per-task checkpoint). Run the bundle
  // from an empty directory and it MUST fail with exactly that "not built" error
  // before ever touching the network — proving the bundle imported cleanly and
  // actually reached poll(), not just that node could parse the file.
  const emptyCwd = mkdtempSync(`${tmpdir()}/destub-watch-gate-`);
  const bundlePath = `${process.cwd()}/dist/destub-watch.mjs`;
  const r = spawnSync('node', [bundlePath], {
    encoding: 'utf8', cwd: emptyCwd, stdio: ['ignore', 'pipe', 'pipe'],
  });
  rmSync(emptyCwd, { recursive: true, force: true });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!out.includes('فهرست الگوهای خرد ساخته نشده است')) {
    console.error('\nGATE 2 FAILED (dist/destub-watch.mjs) — did not fail the expected network-free way:');
    console.error(out.slice(0, 2000));
    process.exit(1);
  }
  console.log('  گیت ۲: بدون شبکه به loadInventory() می‌رسد ✓  (dist/destub-watch.mjs)');
}

// ---- dist/destub-inventory.mjs ----
await buildOne('src/tasks/task-10/destub-inventory.ts', 'dist/destub-inventory.mjs');
// No gate 2 here: unlike destub-watch.ts, this entry has no network-free
// precondition to check before it must hit the API (`build()`'s very first
// calls are `list=embeddedin` and `meta=siteinfo`) — there is nothing
// deterministic to assert without actually talking to fa.wikipedia. Gate 1 is
// what matters for this file anyway, per the file header.

// ---- dist/cite-scan-conflicts.mjs ----
await buildOne('src/tasks/task-03/scan-conflicts-cli.ts', 'dist/cite-scan-conflicts.mjs');
{
  // gate 2: `run()`'s first act is titlesToScan(), which reads the resume checkpoint
  // from BOT_STATE_DIR. Point it at a directory with no checkpoint in it and the
  // bundle MUST refuse with exactly that message, before any network call — which
  // proves it imported cleanly and really reached run(), not merely that node parsed it.
  const emptyDir = mkdtempSync(`${tmpdir()}/cite-scan-gate-`);
  const r = spawnSync('node', ['dist/cite-scan-conflicts.mjs'], {
    encoding: 'utf8', env: { ...process.env, BOT_STATE_DIR: emptyDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  rmSync(emptyDir, { recursive: true, force: true });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!out.includes('سیاههٔ پیشرفت یافت نشد')) {
    console.error('\nGATE 2 FAILED (dist/cite-scan-conflicts.mjs) — did not fail the expected network-free way:');
    console.error(out.slice(0, 2000));
    process.exit(1);
  }
  console.log('  گیت ۲: بدون شبکه به titlesToScan() می‌رسد ✓  (dist/cite-scan-conflicts.mjs)');
}
copyFileSync('dist/cite-scan-conflicts.mjs', 'toolforge/cite-scan-conflicts.mjs');
console.log('ساخته شد: toolforge/cite-scan-conflicts.mjs (رونوشت از dist/cite-scan-conflicts.mjs)');

