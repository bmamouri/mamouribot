/**
 * Regression tests for the two commitments the permission requests make in writing.
 *
 *   npx tsx src/promises.test.ts
 *
 * Both were broken once, both silently, and neither showed up in any other test because
 * neither produces an error — the bot just keeps editing. They are asserted here against
 * the SOURCE, because what matters is a property of the code's shape (how often the stop
 * page is polled; which requests carry maxlag) rather than of one function's return value.
 *
 * What is promised, quoted from وظیفهٔ ۳ and وظیفهٔ ۶ / ۱۰:
 *
 *   «کلید توقف اضطراری: پیش از هر ویرایش، کلید توقفِ مشترکِ ربات بررسی می‌شود؛ … خالی‌کردن
 *    صفحه یا تغییر آن به «خیر» ربات را بی‌درنگ متوقف می‌کند»
 *   «رعایت سیاست: maxlag=۵ …»
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MAX_STOP_READ_FAILURES, STOP_PAGE } from './core.js';

const core = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'core.ts'), 'utf8');

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

console.log('== the stop page is checked before EVERY edit, never sampled ==');
{
  // The bug: `if (stopTick++ % 5 === 0) { … mustStop() … }`. At the bot's 10s cadence that
  // let it run five more edits past a stop request; under the human 30-120s pacing, ten
  // minutes. The stop page itself promises «پیش از هر ویرایش».
  ok('no modulo gate guards the stop check',
     !/stopTick|%\s*\d+\s*===\s*0[^\n]*mustStop/.test(core),
     'a counter or modulo appears next to the stop check again');
  ok('mustStop is awaited in the writer loop',
     /const ms = await this\.mustStop\(\);/.test(core));
  ok('and its result breaks the loop',
     /if \(ms\.stop\)[^\n]*break;/.test(core));
}

console.log('\n== the stop switch fails CLOSED when it cannot be read ==');
{
  // An unreadable kill switch is not a kill switch. One blip must not halt a batch, but
  // carrying on forever while unable to check is the situation the switch exists for.
  ok('a failure threshold exists', MAX_STOP_READ_FAILURES >= 1, String(MAX_STOP_READ_FAILURES));
  ok('consecutive failures are counted', /stopReadFailures\+\+/.test(core));
  ok('the counter resets on a good read', /this\.stopReadFailures = 0;/.test(core));
  ok('and the threshold halts the run',
     /stopReadFailures >= MAX_STOP_READ_FAILURES[\s\S]{0,200}stop: true/.test(core));
  ok('the stop page is the documented one', STOP_PAGE === 'کاربر:MamouriBot/توقف', STOP_PAGE);
}

console.log('\n== maxlag rides on every request, not only on writes ==');
{
  // The bug: maxlag was set in edit() only. Reads are most of the bot's traffic — target
  // enumeration, four concurrent prefetches, the render guard, the post-save check and
  // the stop poll — so the write backed off politely while the rest hammered.
  ok('reads attach maxlag', /const withLag = p\.action === 'login'[\s\S]{0,160}maxlag: String\(this\.opts\.maxlag\)/.test(core));
  ok('posts attach it too', (core.match(/maxlag: String\(this\.opts\.maxlag\), \.\.\.p/g) ?? []).length >= 2,
     'expected both apiGet and apiPost to add it');
  ok('login does NOT, which would risk a recursion while lagged',
     /p\.action === 'login'\s*\?\s*p/.test(core));
  ok('edit() still sets it explicitly', /maxlag: String\(this\.opts\.maxlag\),/.test(core));
}

console.log('\n== a maxlag rejection is obeyed centrally, and is fatal if it persists ==');
{
  ok('handled in request(), so every verb benefits',
     /if \(json\?\.error\?\.code === 'maxlag'\)/.test(core));
  ok('the server’s Retry-After is preferred over a guess',
     /takeRetryAfterMs\(\)[\s\S]{0,120}lag \+ 1/.test(core));
  ok('persistent lag halts the run fatally',
     /attempt >= 8\) throw new BotStop\('maxlag پایدار/.test(core));
  // The first version threw that BotStop inside a bare `catch`, which swallowed it and
  // reported a misleading "non-JSON" error instead of halting.
  ok('a deliberate halt is never retried as a transient failure',
     /if \(e instanceof BotStop\) throw e;/.test(core));
  ok('the maxlag branch sits outside the JSON parse catch',
     core.indexOf("if (json !== undefined)") < core.indexOf("error?.code === 'maxlag'"),
     'the fatal stop can be swallowed again');
}


console.log('\n== the bot flag is separable from the account ==');
{
  // A BAG member declined وظیفهٔ ۱۳ as needing no permission AND asked that its edits not
  // be bot-flagged: the flag is flood control, and the task writes one page a day. The
  // obvious reading — "run it as the human account" — would have put the operator's
  // password on Toolforge. It is not needed: `bot=1` is per-edit opt-in, verified live on
  // ۹ اکتبر ۲۰۲۶ (recentchanges reported bot:false without it, bot:true with it).
  ok('RunOptions carries flagEdits', /flagEdits\?: boolean;/.test(core));
  ok('it overrides only the flag, not the account',
     /if \(opts\.flagEdits !== undefined\) this\.id = \{ \.\.\.this\.id, botFlag: opts\.flagEdits \};/.test(core));
  ok('edit() still gates bot=1 on that one field', /this\.id\.botFlag \? \{ bot: '1' \}/.test(core));
  const mr = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tasks/task-13/move-report.ts'), 'utf8');
  ok('وظیفهٔ ۱۳ asks for unflagged edits', /flagEdits: false/.test(mr));
  ok('and still authenticates as the bot, not as the operator',
     !/identity: 'human'/.test(mr), 'task 13 must not switch to the human account');
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
