# Running bots on Toolforge

How to SSH into Toolforge, deploy the bot code, and set up scheduled or continuous jobs.
The first bot I deployed this way was Task 5 (`empty-unknown-params.py`); new ones follow the
same pattern.

> **Changing a citation parameter name?** The fa CS1 parameter names are not defined where
> you would expect, and `پودمان:Citation/CS1/Configuration` is read by
> **InternetArchiveBot**, not by the code that renders citations. The full chain is
> described at the top of `src/tasks/task-03/normalize-cite-params.ts`. Read it first.

## One tool for every task

Everything runs on `tools.mamouribot`. I moved all the tasks there on ۸ اکتبر ۲۰۲۶: every job
runs there, every task's resume checkpoint is in `~/state/`, and the eight other tools were
emptied of code, credentials and state.

| Job | Task | Schedule | Command |
|---|---|---|---|
| `empty-params` | وظیفهٔ ۵ | `5 3 * * *` | `bot/empty-unknown-params.py` |
| `notelist-watch` | وظیفهٔ ۶ | `*/15 * * * *` | `mamouribot.mjs notelist-missing --live --delay 12` |
| `tx-hourly` | وظیفهٔ ۱۱ | `45 * * * *` | `task-11-taxonomy/run.sh --live --limit 150 --delay 10` |
| `destub-watch` | وظیفهٔ ۱۰ | `*/10 * * * *` | `cd task-10-destub && node ../destub-watch.mjs --live` |
| `destub-inventory-monthly` | وظیفهٔ ۱۰ | `0 2 1 * *` | `cd task-10-destub && node ../destub-inventory.mjs` |
| `cp-daily` | وظیفهٔ ۴ | `35 6 * * *` | `task-04-company-params/run.sh --live --limit 50 --delay 15` |

Files on the tool:

```
~/mamouribot.mjs            all-tasks bundle (run.ts)        ~/state/        BOT_STATE_DIR
~/destub-watch.mjs          وظیفهٔ ۱۰ poller                  ~/logs/         job logs
~/destub-inventory.mjs      وظیفهٔ ۱۰ monthly inventory       ~/bot/          وظیفهٔ ۵ (Python) ONLY
~/cite-scan-conflicts.mjs   وظیفهٔ ۳ review-page scanner      ~/task-NN-*/    per-task run dirs
~/gates.py                  the publish gate, beside the bundles
```

⚠️ **The TypeScript bundle is `~/mamouribot.mjs`, not `~/bot/mamouribot.mjs`.** Every
`task-NN/run.sh` runs its bundle relative to its own directory (`exec node ../mamouribot.mjs …`
from inside `~/task-03-cite-params/`), which is the tool home. `~/bot/` only exists because
وظیفهٔ ۵ is Python and keeps its script there (`~/bot/empty-unknown-params.py`).

On ۱۳ اکتبر ۲۰۲۶ I deployed a وظیفهٔ ۳ fix twice to `~/bot/mamouribot.mjs`. Both copies built
and passed the checks, but nothing on the tool reads that file, so for about two hours the
cron job kept running the three-day-old `~/mamouribot.mjs` and the fix did nothing. None of
my checks that day showed it: `--check` and a live `toolforge jobs run … --wait` of `--check`
test the credentials and the stop page, not which bundle a scheduled job runs.

**After deploying, check that the change is in the file the scheduled job actually runs.**
Read the job's `--command`, follow the relative path from the directory it `cd`s into, and
grep that file for something the change added:
```sh
become mamouribot bash -c 'grep -c <new-identifier-added-by-the-fix> ~/mamouribot.mjs'
```
Grepping `~/bot/mamouribot.mjs`, or any other path you meant to deploy to, tells you nothing
about what the cron job runs.

**وظیفهٔ ۱۰ needs its own working directory.** Its state paths (`.state/destub/…`) are
relative to the current directory instead of `BOT_STATE_DIR`, so its jobs `cd ~/task-10-destub`
and run the bundles as `../destub-watch.mjs`. Everything else uses `BOT_STATE_DIR`.

### The eight old tools, disabled ۸ اکتبر ۲۰۲۶

`fawiki-musician-infobox-params`, `mamouribot-taxobox`, `mamouribot-fa-software-infobox`,
`mamouribot-fa-notelist`, `mamouribot-fa-destub`, `mamouribot-fa-taxonomy-create`,
`mamouribot-fa-cite-normalize`, `mamouribot-fa-cite-update-params`.

I deleted their jobs, removed `bot/`, `state/` and the bot-password `.env` from each, and
then disabled the tools at toolsadmin.

⚠️ **A disabled tool is not deleted straight away.** toolsadmin says: «Disabled tools are
archived and deleted after 40 days». So until about **۱۷ نوامبر ۲۰۲۶**:

- `id -Gn | grep ^tools[.]` still lists all nine. That does not mean the move failed.
- `become <tool>` still works and the archived home can still be read.
- Nothing runs there: the jobs are gone and the tools are disabled.

Anything missed in the move can still be recovered with `become <tool> cat …` until then.
It also means a script pointed at an old tool will seem to work during that time but will
never be scheduled. Point everything at `mamouribot`.

Their checkpoints were copied into `~/state/` on `mamouribot` first:
`musician-params.json` (3,635 done), `taxonomy-link-localize.json` (6,950),
`infobox-software-params.json` (715), `taxonomy-create-missing.json` (59),
`notelist-missing.json` (227), plus `taxon-fa-map.json` and the destub inventory and
watch checkpoint. Losing them would not break anything, but every later run would look
again at pages it had already decided about.

**Why one tool.** Having one tool per task cost more than it gave. `src/run.ts` bundles every
registered task into one file, so each tool held the same all-tasks file at whatever version
it was last deployed: six tools, six different checksums, and the oldest less than half the
size of the newest because it was built before several tasks existed. The tasks were not
really separated, but the old copies were real. Credentials were stored nine times, and
`toolforge jobs list` only shows one tool, so the bot's full schedule was not visible
anywhere. One tool has enough room: the quota is 50 cron definitions, 15 concurrent jobs,
16 pods and 8 GiB, against four jobs today.

### Checking the table above

The table goes out of date without anyone noticing, so check it. From a machine with the
Wikimedia developer key:

```bash
# the jobs, which is the thing that matters
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs list'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs quota'

# group membership still shows the eight disabled tools until ~۱۷ نوامبر ۲۰۲۶; see above
ssh mamouri@login.toolforge.org 'id -Gn | tr " " "\n" | grep ^tools[.]'
```

A tool's title, description and whether it is disabled or deleted are public at
`https://toolsadmin.wikimedia.org/tools/id/<tool>`. The page is plain HTML, so `curl` and
stripping the tags is enough, with no browser or login. This is the way to tell a disabled
tool from a live one, since `become` and `id` can't:

```bash
curl -s https://toolsadmin.wikimedia.org/tools/id/<tool> | sed -e 's/<[^>]*>/ /g' | tr -s ' ' | grep -i 'disabled\|Tool:'
```

Last checked: ۸ اکتبر ۲۰۲۶. `mamouribot` was live with four cron jobs, and the other eight
were disabled and waiting for automatic deletion.

### Don't create another tool

Every task goes inside `mamouribot`.

An earlier version of this file had a naming scheme for new tools
(`mamouribot-fa-t<NN>-<slug>`), proposed on ۷ اکتبر ۲۰۲۶ and replaced by the move to one tool
later the same day. I left it in "for a genuine exception", which was a mistake: it read as
permission to make new tools, and it had already confused people about whether it named tools
or the repository's directories. I have removed it.

A new task needs a directory inside the tool:

```
src/tasks/task-NN/          the code and its tests
docs/task-NN-<slug>.md      what it does and why
toolforge/task-NN-<slug>/   run.sh + jobs.yaml, deployed to ~/task-NN-<slug>/
```

and a job on `mamouribot`. That is all.

There is plenty of room. The quota on ۸ اکتبر ۲۰۲۶, with four cron jobs running, was 4 of 50
cron definitions, 1 of 16 concurrent pods, 0 of 16 continuous jobs, 1 GiB of 8 GiB memory
(6 GiB per job), and 1 of 16 CPU. Fourteen tasks with a cron job each would be 14 of 50.

The old names are gone for good: a Toolforge tool can't be renamed, and a deleted name is
never given out again. `mamouribot` doesn't refer to any one task, which suits a tool that
runs all of them.

⚠️ **Job logs are appended to.** `toolforge jobs run -o ~/logs/x.out` adds to the file instead
of replacing it, so the top of the file after a re-run shows the previous run. That looks
exactly like a deployment that didn't take effect, and I once spent a while chasing a stale
bundle that wasn't there. Delete the log before each run, or read the end of it.

⚠️ **A job starts in the tool home**, not in the directory you ran `toolforge jobs load`
from. `command: ./run.sh` exits 127; write it as `./task-NN-slug/run.sh`.

⚠️ **`node` is not installed on the bastion**, only inside the job image. You can't test a
bundle over ssh; run a one-off job with `--image node20 --wait`.

⚠️ **esbuild escapes non-ASCII**, so grepping a bundle for a Persian string finds nothing even
when it is there. Grep for an ASCII identifier.

> On Toolforge the bot edits fa.wiki as **MamouriBot**, a separate approved bot account,
> not `Mamouri@translator`. Everything it writes on the wiki, edit summaries and talk posts
> included, is in first-person Persian. See the top of the companion repository's
> `AGENTS.md`.

---

## 1. Access: SSH in

```sh
ssh mamouri@login.toolforge.org
```

- **User account:** `mamouri`, my Wikimedia developer (shell) account. It is the same
  identity as the `mamouri` Gerrit account, and it is not the wiki login.
- **Key:** the Wikimedia developer-account SSH key, registered at
  <https://toolsadmin.wikimedia.org> / wikitech `Special:Preferences → OpenStack
  → SSH keys`. On my Mac it is an ED25519 key already loaded in the ssh-agent (offered as
  `gerrit-mamouri-cite-push`, the same key Gerrit trusts). There is no password; if ssh-agent
  has the key, `ssh mamouri@login.toolforge.org` just works. Check with
  `ssh -o BatchMode=yes mamouri@login.toolforge.org "echo OK"`.
- **The login host is only a bastion.** `login.toolforge.org` is a jump host. Jobs don't run
  as `mamouri`; you switch to the tool account.

### Switching to the tool account

Everything runs as the tool `tools.mamouribot`:

```sh
become mamouribot                      # interactive shell as the tool
become mamouribot bash -c '<command>'  # one-shot (use this for scripting)
```

- Tool home: **`/data/project/mamouribot`** (`$HOME` once you've run `become`).
- Bot code lives in **`/data/project/mamouribot/bot/`**.
- If `become` says `no such tool` right after a tool is created, it is still being set up.
  Group membership (`id`) appears in about 2 minutes, and the NFS home directory and the
  `become` sudoers entry in 5–10 minutes. Wait rather than debugging it.

---

## 2. Deploying and updating code over stdin

⚠️ **You can't `scp`, `mkdir` or write into `/data/project/mamouribot/` as `mamouri`**, even
though it is group-writable, because NFS ignores the supplementary group. Deploy by piping
the file through `become` on stdin:

```sh
# copy a local script up to the tool's ~/bot/
cat src/tasks/task-05/empty-unknown-params.py \
  | ssh mamouri@login.toolforge.org "become mamouribot bash -c 'cat > ~/bot/empty-unknown-params.py'"
```

### TypeScript tasks: bundle, don't install

The `src/` tasks are TypeScript and import each other, and `npm install` over NFS is slow and
unreliable. Bundle everything into one file with no dependencies locally and upload that.
The `node20` image then needs nothing else.

⚠️ **Always bundle with `npm run bundle`, never esbuild by hand.** A bundle puts every module
into one file, so each module's `import.meta.url` becomes the bundle's, which is the same as
`process.argv[1]`. Every `isMain(import.meta.url)` check in the bundle is then true at once,
whatever task you asked for. The destub modules use that pattern, and `destub-report`'s
`main()` publishes its report when `--live` is in argv, which is exactly what the Toolforge
job passes. The build script sets the `__BUNDLED__` define that turns those checks off and
then confirms that it took effect; a hand-written esbuild call does neither. See
`scripts/lib/is-main.ts`.

```sh
npm run bundle                           # bundles to dist/ + toolforge/, gates each

cat dist/bot-run.mjs | ssh mamouri@login.toolforge.org \
  "become <tool> bash -c 'cat > ~/bot/bot-run.mjs'"
```

Don't replace the build-time check with one that runs the bundle with a made-up task and
counts the output lines. I tried that and it proves nothing: the unknown-task path calls
`process.exit(1)` straight away, which kills anything a wrongly triggered `main()` started,
so a broken bundle and a correct one print the same thing.

**The job command has to `cd` into `~/bot` itself.** A Toolforge job starts in the tool home,
not in `~/bot`, so both the bundle path and `core.ts`'s relative `.env` lookup fail. Copy the
form the working jobs use:

```sh
toolforge jobs run <name> --image node20 \
  --command "cd /data/project/<tool>/bot && BOT_STATE_DIR=/data/project/<tool>/state node bot-run.mjs <task-id>"
```

A `cd` in the surrounding `become … bash -c '…'` does not carry into the job. When a run
fails, check the timestamps in the logs before reading them: `.err` is not cleared between
runs, so an old error from an earlier attempt can sit there looking current next to a new,
successful `.out`.

`core.ts` already handles running on the tool: it loads `.env` only if it exists (otherwise
it uses real environment variables) and respects **`BOT_STATE_DIR`**, so the resume
checkpoint lives on NFS and survives a job being rescheduled.

⚠️ **Upload a minimal `.env`.** Upload only the two keys the bot reads,
`WIKIPEDIA_BOT_USERNAME` and `WIKIPEDIA_BOT_PASSWORD`, never the repository's whole `.env`.
(`tools.mamouribot`'s copy currently has the whole local file in it: Cloudflare and other
API tokens, `DATABASE_URL`, and the password for my own `Mamouri` account. It is
`chmod 600`, so other users can't read it, but none of that belongs on Toolforge.)

```sh
grep -E "^WIKIPEDIA_BOT_(USERNAME|PASSWORD)=" .env | ssh mamouri@login.toolforge.org \
  "become <tool> bash -c 'mkdir -p ~/bot/.state && cat > ~/bot/.env && chmod 600 ~/bot/.env'"
```

Things to change when moving a script from the repository to the tool:
- **Fix `ROOT` and paths.** The local script works out `ROOT` from where it sits in the
  repository. On the tool the `.env` is in `~/bot/`, so change the ROOT constant to
  `/data/project/mamouribot/bot` with `sed` before or while uploading. Resume and results
  files that use `__file__` already work.
- **Secrets:** `~/bot/.env` (chmod 600) holds `WIKIPEDIA_BOT_USERNAME` /
  `WIKIPEDIA_BOT_PASSWORD` for **MamouriBot** (a bot password from `Special:BotPasswords`
  on the bot account). Never commit it; it exists only on the tool. Create or replace it the
  same way, over stdin:
  `cat local.env | ssh … "become mamouribot bash -c 'cat > ~/bot/.env && chmod 600 ~/bot/.env'"`.

---

## 3. Jobs: create, schedule, run, stop

Toolforge runs work as jobs (Kubernetes pods) through the `toolforge jobs` command, always as
the tool. Pick an `--image` (`python3.13`, `node20`, …). **`toolforge jobs images`** lists
them; plain `toolforge images` is not a command.

### Scheduled (cron): the normal choice for a maintenance bot

```sh
become mamouribot toolforge jobs run empty-params \
  --command "cd \$HOME/bot && MIN_INTERVAL=1.0 python3 empty-unknown-params.py --run --fast --all --ns=0,4,10,118" \
  --image python3.13 \
  --schedule "5 3 * * *" \
  --mem 512Mi
```
This runs once a day at 03:05 UTC, handles newly flagged pages, and exits. `--schedule` takes
a standard cron expression (UTC).

### One-off (run now, then stop)

The same command without `--schedule`. Useful for clearing a backlog straight away or testing
a redeploy:

```sh
become mamouribot toolforge jobs run empty-now \
  --command "cd \$HOME/bot && MIN_INTERVAL=1.0 python3 empty-unknown-params.py --run --fast" \
  --image python3.13
```

### Continuous (long-running loop): use rarely

Use `--continuous` instead of `--schedule`. Prefer a schedule unless the bot really has to
react all the time: a continuous job that has run out of work just goes over the same
leftover pages forever. I moved Task 5 from continuous to daily for that reason.

### Managing jobs

```sh
become mamouribot toolforge jobs list              # status of all jobs
become mamouribot toolforge jobs delete empty-params   # stop/pause (resume-file preserves progress)
become mamouribot toolforge jobs restart empty-params
become mamouribot toolforge jobs logs empty-params     # or read ~/<job>.out / ~/<job>.err
```
Finished one-off jobs stay in `jobs list` until you delete them, so clean up old ones.

---

## 4. Setting up a new bot (checklist)

1. **Bot account and approval.** Edits go out as an approved bot (MamouriBot), which needs a
   permission request on fa.wiki. Use MamouriBot if the new task fits what it does;
   otherwise file a new task request first. Create a bot password at
   `Special:BotPasswords` and put it in the `.env` on the tool.
2. **Write the task** under `src/tasks/` in this repository. Copy the closest existing task;
   they share the `core.ts` and API-client structure, and the Python ones load `.env`
   themselves. Make paths relative to `__file__`, except the one ROOT you will change on the
   tool.
3. **Add a resume file and a heartbeat.** A done-file so processed items are skipped, and a
   regular `HB processed=…/… saved=… skipped=… rate=…/min` line so progress is visible even
   when most items are skipped without output.
4. **Keep the pace down.** About 60 requests a minute, one at a time, is the safe maximum.
   Keep maxlag and the `Retry-After` backoff. The `MIN_INTERVAL` environment variable sets
   the pause between writes (Task 5 uses 1.0s on the tool, which gives about 31–33 items a
   minute). Don't go below one second.
5. **Stop if the identity is wrong.** Every write asserts the bot user
   (`assert=user`/`assertuser=`), so a session that expires in the middle of a run can't
   post anonymously.
6. **Deploy** (§2), **run it once as a one-off to check it** (§3), then **schedule** it.
7. **Write the job down** (name, schedule, command, what it does) here, so the next person
   can find it.

---

## 5. Quick reference

| Thing | Value |
|---|---|
| Bastion | `ssh mamouri@login.toolforge.org` |
| Tools | `mamouribot` only; see the table at the top |
| Auth key | Wikimedia dev-account SSH key (ED25519, in ssh-agent; same as Gerrit `mamouri`) |
| Tool account | `become mamouribot` |
| Tool home / code | `/data/project/mamouribot` → `~/bot/` |
| Secrets | `~/bot/.env` (chmod 600, MamouriBot bot-password) |
| Deploy | pipe file over stdin through `become` (no scp) |
| Jobs CLI | `become mamouribot toolforge jobs {run,list,logs,delete,restart}` |
| Current jobs | `tools.mamouribot` only: `empty-params` (وظیفهٔ ۵) daily `5 3 * * *`; `notelist-watch` (وظیفهٔ ۶) every 15 min `*/15 * * * *`; `destub-watch` (وظیفهٔ ۱۰) `*/10 * * * *`; `destub-inventory-monthly` (وظیفهٔ ۱۰) `0 2 1 * *`; `cp-daily` (وظیفهٔ ۴) daily `35 6 * * *` |

The full history of deploying the first bot (speed tuning, finding why it hung, fixes for
wrapper templates) is in my notes under `task5-toolforge-deploy`.
