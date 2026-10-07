/**
 * Unit tests for server-driven pacing. No network, no clock dependence.
 *
 *   npx tsx src/pacing.test.ts
 *
 * The numbers here are the ones probed off fa.wikipedia on ۸ اکتبر ۲۰۲۶: a maxlag
 * rejection carries `Retry-After: 5`, and `siprop=dbrepllag` reports lag on demand.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Pacer, RunRegistry } from './pacing.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const pacer = (over: Partial<ConstructorParameters<typeof Pacer>[0]> = {}) =>
  new Pacer({ floorMs: 10_000, ceilMs: 60_000, healthyLagS: 1, busyLagS: 5, ...over });

console.log('== with no information, the floor applies ==');
{
  const p = pacer();
  const g = p.nextGap();
  ok('the gap is the floor', g.ms === 10_000, String(g.ms));
  ok('and it says the lag is unknown', g.why.includes('lag unknown'), g.why);
}

console.log('\n== a healthy server gets the floor, not a penalty ==');
{
  const p = pacer();
  p.noteLag(0.878);   // the real reading from db2208
  ok('lag under the healthy threshold stays at the floor', p.nextGap().ms === 10_000);
}

console.log('\n== the gap slides up with measured lag ==');
{
  const p = pacer();
  p.noteLag(3);       // halfway between healthy (1s) and busy (5s)
  const g = p.nextGap();
  ok('halfway lag gives roughly the midpoint', g.ms === 35_000, String(g.ms));
  ok('and the reason names the lag', g.why.includes('lag 3.00s'), g.why);
}
{
  const p = pacer();
  p.noteLag(99);
  ok('lag past the busy threshold is capped at the ceiling', p.nextGap().ms === 60_000);
}

console.log('\n== Retry-After is the server speaking and overrides our own choice ==');
{
  const p = pacer();
  p.noteRetryAfter(5);
  const g = p.nextGap();
  // 5s is BELOW the 10s floor, so the floor still wins: Retry-After is a minimum, not a
  // licence to go faster than our own courtesy limit.
  ok('a Retry-After under the floor does not speed us up', g.ms === 10_000, String(g.ms));
}
{
  const p = pacer();
  p.noteRetryAfter(120);
  const g = p.nextGap();
  ok('a Retry-After above the CEILING is still honoured in full', g.ms === 120_000, String(g.ms));
  ok('and the reason attributes it to the server', g.why.includes('Retry-After'), g.why);
}
{
  const p = pacer();
  p.noteRetryAfter(120);
  p.nextGap();
  ok('it applies once and is then consumed', p.nextGap().ms === 10_000, 'a single instruction must not become a permanent slow-down');
}
{
  const p = pacer();
  p.noteRetryAfter(30); p.noteRetryAfter(90); p.noteRetryAfter(60);
  ok('several instructions take the largest', p.nextGap().ms === 90_000);
}

console.log('\n== concurrent runs of the same bot share the rate ==');
{
  const p = pacer();
  p.noteLag(0);
  p.noteConcurrency(3);
  const g = p.nextGap();
  ok('three runs each wait three times as long', g.ms === 30_000, String(g.ms));
  ok('and the reason says so', g.why.includes('2 other run(s)'), g.why);
  p.noteConcurrency(0);
  ok('a nonsense concurrency cannot speed the bot up', p.nextGap().ms === 10_000);
}

console.log('\n== randomisation never undercuts the floor ==');
{
  const p = pacer({ jitter: 0.2 });
  p.noteLag(0);
  const seen = new Set<number>(); let min = Infinity, max = 0;
  for (let i = 0; i < 200; i++) {
    const ms = p.nextGap().ms;
    seen.add(ms); min = Math.min(min, ms); max = Math.max(max, ms);
  }
  ok('never faster than the floor', min >= 10_000, `min ${min}`);
  ok('and not much slower', max <= 12_000, `max ${max}`);
  ok('and not a constant', seen.size > 20, `${seen.size} distinct values`);
}

console.log('\n== the human account keeps its mandated 30-120s spread ==');
{
  // AGENTS.md: «a random 30-120s after every write (not a fixed cadence)». This is a
  // cover requirement, so the pacer may lengthen it but must never shorten it, and it
  // must stay a spread rather than collapsing onto a floor with a wobble.
  const p = new Pacer({ floorMs: 30_000, ceilMs: 120_000, busyLagS: 5,
                        spread: 'uniform-to-ceiling' });
  p.noteLag(0.4);
  let min = Infinity, max = 0; const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const ms = p.nextGap().ms;
    min = Math.min(min, ms); max = Math.max(max, ms); seen.add(Math.round(ms / 1000));
  }
  ok('never below 30s', min >= 30_000, `min ${min}`);
  ok('never above 120s', max <= 120_000, `max ${max}`);
  ok('spread across the range, not clustered at the floor', max - min > 60_000, `range ${max - min}`);
  ok('many distinct values', seen.size > 40, `${seen.size} distinct seconds`);
}
{
  // ...and the server can still slow it down past the ceiling
  const p = new Pacer({ floorMs: 30_000, ceilMs: 120_000, spread: 'uniform-to-ceiling' });
  p.noteRetryAfter(300);
  ok('a long Retry-After is honoured even with the uniform spread',
     p.nextGap().ms >= 300_000, String(p.nextGap().ms));
}

console.log('\n== the run registry counts live runs and forgets dead ones ==');
{
  const dir = mkdtempSync(join(tmpdir(), 'pacing-'));
  const a = new RunRegistry(dir, 'run-a');
  ok('a lone run counts itself', a.beat() === 1);

  const b = new RunRegistry(dir, 'run-b');
  ok('a second live run is seen by itself', b.beat() === 2);
  ok('and by the first', a.beat() === 2);

  b.close();
  ok('a closed run stops counting', a.beat() === 1);

  // a heartbeat older than the stale window belongs to a killed job
  mkdirSync(join(dir, 'runs'), { recursive: true });
  writeFileSync(join(dir, 'runs', 'zombie.json'), JSON.stringify({ pid: 1, at: Date.now() - 600_000 }));
  ok('a stale heartbeat is ignored', a.beat() === 1);

  writeFileSync(join(dir, 'runs', 'corrupt.json'), '{ not json');
  ok('a corrupt heartbeat does not crash the run and is dropped', a.beat() === 1);

  a.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
