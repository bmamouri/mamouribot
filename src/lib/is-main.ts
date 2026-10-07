/**
 * "Was this module run directly?" — safe to use in a file that gets BUNDLED.
 *
 * The obvious idiom is wrong once esbuild is involved:
 *
 *     if (import.meta.url === `file://${process.argv[1]}`) { main(); }
 *
 * A bundle collapses every module into one file, so `import.meta.url` becomes
 * the bundle's own URL — which *equals* `process.argv[1]`. Every such guard in
 * the bundle fires at once, whatever task was actually requested. Not
 * hypothetical: four destub modules used the idiom, and bundling them beside the
 * Toolforge runner meant `node bot-run.mjs <any-task> --live` also ran destub's
 * report publisher, because its main() gates on `--live` appearing in argv and
 * the Toolforge job command supplies exactly that.
 *
 * Comparing file names does NOT fix it — inside a bundle both sides are the
 * bundle. The only reliable signal comes from the build itself, so
 * `bots/tools/build-bundle.ts` defines `__BUNDLED__` and every such guard goes
 * false. `bots/tools/build-bundle.ts` then asserts that it really did, so a
 * bundle built without the define cannot ship.
 */
import { basename } from 'path';
import { fileURLToPath } from 'url';

/** injected by esbuild via `define` in bots/tools/build-bundle.ts */
declare const __BUNDLED__: boolean | undefined;

const stem = (p: string) => basename(p).replace(/\.(ts|mts|cts|js|mjs|cjs)$/, '');

export function isMain(moduleUrl: string): boolean {
  // `typeof` on an undeclared identifier is safe — under tsx this is just undefined
  if (typeof __BUNDLED__ !== 'undefined' && __BUNDLED__) return false;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return stem(fileURLToPath(moduleUrl)) === stem(entry);
  } catch {
    return false;
  }
}
