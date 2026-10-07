/**
 * Tests for the resume checkpoint. Worth having: the two ways this can be wrong
 * are both silent and both expensive — either an approved task suddenly
 * re-sweeps its whole backlog, or nothing is ever re-checked and a re-broken
 * page is skipped forever while the run reports success.
 *
 *   npx tsx scripts/lib/checkpoint.test.ts
 */
import {
  isKnown, isParked, loadCheckpoint, markDeferred, markDone, serializeCheckpoint,
} from './checkpoint.js';

const DAY = 86400_000;
const NOW = 1_800_000_000_000;
let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failed++;
}

// ---- legacy array migration ----
{
  const cp = loadCheckpoint({ done: ['آ', 'ب'], deferred: ['پ'] }, NOW);
  check('legacy arrays migrate to timestamped maps', cp.done['آ'] === NOW && cp.deferred['پ'] === NOW);
  check('migration is reported', cp.migrated === true);
  // the important one: migrating must NOT make everything instantly eligible,
  // or the first run after the upgrade re-sweeps the entire backlog
  check('migrated entries are NOT immediately eligible', isParked(cp, 'آ', 30, NOW) === true);
  check('migrated entries become eligible after the TTL',
    isParked(cp, 'آ', 30, NOW + 31 * DAY) === false);
}

// ---- a task that did not opt in keeps the old behaviour exactly ----
{
  const cp = loadCheckpoint({ done: { آ: NOW - 999 * DAY } }, NOW);
  check('without recheckAfterDays a parked title is always skipped',
    isParked(cp, 'آ', 0, NOW) === true);
  check('undefined recheckAfterDays behaves as 0',
    isParked(cp, 'آ', undefined, NOW) === true);
}

// ---- TTL boundary ----
{
  const cp = loadCheckpoint({ done: { تازه: NOW - 2 * DAY, کهنه: NOW - 31 * DAY } }, NOW);
  check('recent title stays parked', isParked(cp, 'تازه', 30, NOW) === true);
  check('expired title is eligible again', isParked(cp, 'کهنه', 30, NOW) === false);
  check('unseen title is never parked', isParked(cp, 'ناشناس', 30, NOW) === false);
  check('isKnown sees both parked and expired', isKnown(cp, 'کهنه') && isKnown(cp, 'تازه') && !isKnown(cp, 'ناشناس'));
}

// ---- deferred expires too, so improved code gets another go ----
{
  const cp = loadCheckpoint({ deferred: { x: NOW - 31 * DAY } }, NOW);
  check('expired deferral is eligible again', isParked(cp, 'x', 30, NOW) === false);
}

// ---- moving between sets must not leave a stale stamp ----
{
  const cp = loadCheckpoint({ deferred: { x: NOW - 31 * DAY } }, NOW);
  markDone(cp, 'x', NOW);
  check('markDone clears an older deferred stamp', cp.deferred['x'] === undefined && cp.done['x'] === NOW);
  check('freshly done title is parked again', isParked(cp, 'x', 30, NOW) === true);

  const cp2 = loadCheckpoint({ done: { y: NOW - 31 * DAY } }, NOW);
  markDeferred(cp2, 'y', NOW);
  check('markDeferred clears an older done stamp', cp2.done['y'] === undefined && cp2.deferred['y'] === NOW);
}

// ---- corrupt values must not silently unpark or park it forever ----
{
  const cp = loadCheckpoint({ done: { a: 'nonsense', b: null, c: NaN } }, NOW);
  check('non-numeric stamps are replaced with now, not dropped',
    cp.done['a'] === NOW && cp.done['b'] === NOW && cp.done['c'] === NOW);
  check('corrupt state is flagged as migrated', cp.migrated === true);
}

// ---- round trip ----
{
  const cp = loadCheckpoint({ done: ['آ'], deferred: ['ب'] }, NOW);
  const again = loadCheckpoint(JSON.parse(serializeCheckpoint(cp)), NOW + DAY);
  check('serialize → load preserves stamps', again.done['آ'] === NOW && again.deferred['ب'] === NOW);
  check('reloading v2 is not a migration', again.migrated === false);
}

// ---- empty / absent ----
{
  const cp = loadCheckpoint({}, NOW);
  check('absent state is empty and not a migration',
    Object.keys(cp.done).length === 0 && cp.migrated === false);
}

console.log(failed ? `\n${failed} FAILED` : '\nall checkpoint tests passed');
process.exit(failed ? 1 : 0);
