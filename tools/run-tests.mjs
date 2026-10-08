/**
 * Runs every unit test in the repository, plus the vendored-copy drift check.
 *
 *   npm test
 *
 * The tests are plain tsx scripts that throw on failure rather than a test
 * framework, so the runner is just "execute each one and collect the exit
 * codes". None of them touches the network.
 */
import { readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const tests = walk(join(REPO, 'src')).sort();
const pythonTests = walk_py(join(REPO, 'src'));

function walk_py(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk_py(p));
    else if (name.startsWith('test_') && name.endsWith('.py')) out.push(p);
  }
  return out;
}

const failures = [];

function run(label, cmd, args) {
  // CITE_WIDENED_SCOPE=1 so the behaviour tests exercise every citation family, including
  // the ten that are OFF in a real run because the permission does not cover them yet.
  // That the default is the approved subset is asserted separately, in scope.test.ts,
  // which spawns a child WITHOUT this variable — otherwise enabling it here would hide
  // the very gate it exists to protect.
  const r = spawnSync(cmd, args, {
    cwd: REPO, stdio: 'inherit',
    env: { ...process.env, CITE_WIDENED_SCOPE: '1' },
  });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

run('vendored-copy drift check', 'npx', ['tsx', 'tools/check-vendored.ts']);
for (const t of tests) run(relative(REPO, t), 'npx', ['tsx', t]);
for (const t of pythonTests) run(relative(REPO, t), 'python3', [t]);

console.log(
  `\n${tests.length + pythonTests.length + 1} suite(s), ${failures.length} failing`,
);
if (failures.length) {
  console.error('failing:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
