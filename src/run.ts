/**
 * MamouriBot runner.
 *
 *   npx tsx src/run.ts <task-id> [--live] [--limit N] [--delay S]
 *   npx tsx src/run.ts <task-id> --check     # verify credentials only
 *
 * Default is DRY-RUN (reads only, no login, no writes). Pass --live to actually
 * edit (requires WIKIPEDIA_BOT_USERNAME/PASSWORD in .env and an approved bot flag).
 *
 * Examples:
 *   npx tsx src/run.ts remove-use-dmy-dates                 # full dry-run
 *   npx tsx src/run.ts remove-use-dmy-dates --limit 20      # dry-run 20
 *   npx tsx src/run.ts remove-use-dmy-dates --live --limit 25 --delay 15  # BRFA trial
 */
import { Bot, type BotTask, type RunOptions } from './core.js';
import { useDmyDatesTask } from './tasks/task-01/use-dmy-dates.js';
import { companyDeprecatedParamsTask } from './tasks/task-04/company-deprecated-params.js';
import { citationAccessDateDedupTask } from './tasks/task-04/citation-dedup-accessdate.js';
import { notelistMissingTask } from './tasks/task-06/notelist-missing.js';
import { musicianParamsTask } from './tasks/task-08/musician-params.js';
import { taxonomyLinkLocalizeTask } from './tasks/task-09/taxonomy-link-localize.js';
import { infoboxSoftwareParamsTask } from './tasks/task-07/infobox-software-params.js';
import { normalizeCiteParamsTask } from './tasks/task-03/normalize-cite-params.js';
import { destubTask } from './tasks/task-10/destub.js';
import { task as taxonomyCreateMissingTask } from './tasks/task-11/taxonomy-create-missing.js';
import { linkfixTask } from './tasks/task-12/linkfix.js';
import { populationBoxTask } from './tasks/task-14/population-box.js';

const TASKS: Record<string, BotTask> = {
  [useDmyDatesTask.id]: useDmyDatesTask,
  [companyDeprecatedParamsTask.id]: companyDeprecatedParamsTask,
  [citationAccessDateDedupTask.id]: citationAccessDateDedupTask,
  [notelistMissingTask.id]: notelistMissingTask,
  [musicianParamsTask.id]: musicianParamsTask,
  [taxonomyLinkLocalizeTask.id]: taxonomyLinkLocalizeTask,
  [infoboxSoftwareParamsTask.id]: infoboxSoftwareParamsTask,
  [normalizeCiteParamsTask.id]: normalizeCiteParamsTask,
  [destubTask.id]: destubTask,
  [taxonomyCreateMissingTask.id]: taxonomyCreateMissingTask,
  [linkfixTask.id]: linkfixTask,
  [populationBoxTask.id]: populationBoxTask,
};

function parseArgs(argv: string[]) {
  const a = argv.slice(2);
  const taskId = a[0];
  const flag = (name: string) => a.includes(name);
  const val = (name: string, def: number) => { const i = a.indexOf(name); return i >= 0 && a[i + 1] ? Number(a[i + 1]) : def; };
  // --as-me: authenticate as the human operator instead of the bot. For trialling a
  // task, or a widened scope, that the bot is not approved for yet.
  const identity: 'bot' | 'human' = flag('--as-me') ? 'human' : 'bot';
  // AGENTS.md requires a RANDOM 30-120s gap after every write for the human account, not
  // a fixed cadence; the bot's 10s floor is a bot-policy number and does not apply.
  // delayMs is the floor here and randomness is added per write by the runner.
  const opts: RunOptions = {
    dryRun: !flag('--live'),
    delayMs: val('--delay', identity === 'human' ? 30 : 10) * 1000,
    limit: val('--limit', 0),
    maxlag: 5,
    identity,
  };
  return { taskId, opts };
}

async function main() {
  const { taskId, opts } = parseArgs(process.argv);
  const task = TASKS[taskId];
  if (!task) {
    console.error(`وظیفهٔ ناشناخته. وظیفه‌های موجود: ${Object.keys(TASKS).join(', ')}`);
    process.exit(1);
  }

  // --check: prove the credentials and the emergency stop work, WITHOUT editing.
  // Run this first on a new host (e.g. Toolforge) so a wrong/expired envvar fails
  // here instead of half-way through a live batch.
  if (process.argv.includes('--check')) {
    const bot = new Bot({ ...opts, dryRun: false });
    await bot.login();
    const ui = (await bot.apiGet({ action: 'query', meta: 'userinfo', uiprop: 'groups|rights' })).query.userinfo;
    const groups: string[] = ui.groups ?? [];
    const rights: string[] = ui.rights ?? [];
    console.log(`هویت      : ${ui.name}`);
    console.log(`گروه‌ها    : ${groups.join(', ')}`);
    for (const r of ['bot', 'edit', 'apihighlimits']) {
      console.log(`  ${rights.includes(r) ? '✓' : '✗'} ${r}`);
    }
    const stop = await bot.mustStop();
    console.log(`کلید توقف : ${stop.stop ? `⏹ متوقف (${stop.why})` : '✓ اجازهٔ اجرا'}`);
    const fatal = ui.anon !== undefined || !groups.includes('bot') || !rights.includes('edit') || stop.stop;
    console.log(fatal ? '\nنتیجه: آمادهٔ اجرا نیست.' : '\nنتیجه: آمادهٔ اجرا است.');
    process.exit(fatal ? 1 : 0);
  }
  if (!opts.dryRun) {
    console.log(opts.identity === 'human'
      ? '⚠️  حالت واقعی با حساب انسانی Mamouri: ویرایش‌ها پرچم ربات نمی‌خورند و در تغییرات اخیر دیده می‌شوند.'
      : '⚠️  حالت واقعی: نیازمند پرچم ربات تأییدشده و حساب MamouriBot است.');
  }
  const bot = new Bot(opts);
  await bot.runTask(task);
}
main().catch(e => { console.error(e); process.exit(1); });
