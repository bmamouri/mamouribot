# Running bots on Toolforge

How to SSH into the Toolforge box, deploy bot code, and create/run scheduled or
continuous jobs. This is the reusable playbook — the first bot deployed this way
was Task 5 (`empty-unknown-params.py`); follow the same shape for new ones.

> **Editing a citation parameter name?** The source of truth for fa CS1 parameter
> names is not where you would guess, and `پودمان:Citation/CS1/Configuration` is read
> by **InternetArchiveBot**, not by the rendering engines. The chain is documented at
> the top of `src/tasks/task-03/normalize-cite-params.ts`. Read it first.

## Tools — one tool, every task

**`tools.mamouribot` is the tool, and now the only one with anything on it.**
Consolidated ۸ اکتبر ۲۰۲۶: every job runs there, every task's resume checkpoint lives in
`~/state/`, and the eight other tools were emptied of code, credentials and state.

| Job | Task | Schedule | Command |
|---|---|---|---|
| `empty-params` | وظیفهٔ ۵ | `5 3 * * *` | `bot/empty-unknown-params.py` |
| `notelist-daily` | وظیفهٔ ۶ | `23 4 * * *` | `mamouribot.mjs notelist-missing --live --delay 12` |
| `destub-watch` | وظیفهٔ ۱۰ | `*/10 * * * *` | `cd task-10-destub && node ../destub-watch.mjs --live` |
| `destub-inventory-monthly` | وظیفهٔ ۱۰ | `0 2 1 * *` | `cd task-10-destub && node ../destub-inventory.mjs` |

Layout on the tool:

```
~/mamouribot.mjs            all-tasks bundle (run.ts)        ~/state/        BOT_STATE_DIR
~/destub-watch.mjs          وظیفهٔ ۱۰ poller                  ~/logs/         job logs
~/destub-inventory.mjs      وظیفهٔ ۱۰ monthly inventory       ~/bot/          وظیفهٔ ۵ (Python)
~/cite-scan-conflicts.mjs   وظیفهٔ ۳ review-page scanner      ~/task-NN-*/    per-task run dirs
~/gates.py                  the publish gate, beside the bundles
```

**وظیفهٔ ۱۰ needs its own working directory.** Its state paths (`.state/destub/…`) are
relative to the process CWD rather than `BOT_STATE_DIR`, so its jobs `cd ~/task-10-destub`
and reach the bundles as `../destub-watch.mjs`. Everything else uses `BOT_STATE_DIR`.

### The eight retired tools

`fawiki-musician-infobox-params`, `mamouribot-taxobox`, `mamouribot-fa-software-infobox`,
`mamouribot-fa-notelist`, `mamouribot-fa-destub`, `mamouribot-fa-taxonomy-create`,
`mamouribot-fa-cite-normalize`, `mamouribot-fa-cite-update-params`.

All jobs deleted, `bot/`, `state/` and the bot-password `.env` removed from each. Nothing
on them is runnable. **Deleting the tools themselves is a web action at
`https://toolsadmin.wikimedia.org/tools/id/<tool>`** — neither the CLI nor the API can do
it, so that step is the maintainer's.

Their checkpoints were migrated into `~/state/` on `mamouribot` first, not discarded:
`musician-params.json` (3,635 done), `taxonomy-link-localize.json` (6,950),
`infobox-software-params.json` (715), `taxonomy-create-missing.json` (59),
`notelist-missing.json` (227), plus `taxon-fa-map.json` and the destub inventory and
watch checkpoint. Losing those would not corrupt anything, but every future run would
re-examine pages it had already decided about.

**Why one tool.** The split was measured and found to cost more than it bought:
`src/run.ts` bundles *every* registered task into one artifact, so each tool held the same
all-tasks file at whatever vintage it was last deployed — six tools, six checksums, the
oldest less than half the size of the newest because it predated several tasks. The
isolation was nominal while the staleness was real, credentials were duplicated nine
times, and `toolforge jobs list` only ever shows one tool, so the bot's full schedule
existed nowhere. One tool has room: the quota is 50 cron definitions, 15 concurrent jobs,
16 pods, 8 GiB, against four jobs today.

### Verifying this table

It rots silently, so check it rather than trusting it. From a machine with the
Wikimedia developer key:

```bash
ssh mamouri@login.toolforge.org 'id -Gn | tr " " "\n" | grep ^tools[.]'
# then, per tool:
ssh mamouri@login.toolforge.org \
  'become <tool> bash -c "ls ~/bot 2>/dev/null; toolforge jobs list"'
```

Each tool's title and description are public and need no login, at
`https://toolsadmin.wikimedia.org/tools/id/<tool>`. The page is server-rendered,
so a plain `curl` plus tag-stripping reads them; no browser or login required.

Last verified against the live tools: ۸ اکتبر ۲۰۲۶, after the consolidation.

### There is no second tool, and no naming scheme for one

**One tool: `mamouribot`. Every task goes inside it. Do not create another.**

This is the rule, not a default to be weighed against alternatives. An earlier version of
this file carried a naming scheme for new tools (`mamouribot-fa-t<NN>-<slug>`), proposed
on ۷ اکتبر ۲۰۲۶ and superseded by the consolidation later the same day. It was left in as
"for a genuine exception" and that was a mistake: a named scheme reads as permission, and
it had already caused one round of confusion about whether it governed tool names or the
repository's own directories. It governs neither now, because there will not be another
tool. It is deleted.

What a new task needs is a **directory inside the one tool**, not a tool:

```
src/tasks/task-NN/          the code and its tests
docs/task-NN-<slug>.md      what it does and why
toolforge/task-NN-<slug>/   run.sh + jobs.yaml, deployed to ~/task-NN-<slug>/
```

and a job on `mamouribot`. That is the whole of it.

**It fits, measured, not assumed.** Live quota on ۸ اکتبر ۲۰۲۶ with four cron jobs
running: **4 of 50** cron definitions, 1 of 16 concurrent pods, 0 of 16 continuous jobs,
1 GiB of 8 GiB memory (6 GiB per job), 1 of 16 CPU. Fourteen tasks with a cron each would
be 14 of 50. Nothing about the task count brings the one-tool arrangement near a limit.

The old names are gone for good: a Toolforge tool **cannot be renamed**, and a deleted
name is never released for reuse. `mamouribot` says nothing about any particular task,
which is exactly right now that it runs all of them.

⚠️ **Job logs APPEND.** `toolforge jobs run -o ~/logs/x.out` adds to that file
rather than replacing it, so reading the top of it after a re-run shows you the
PREVIOUS run. This reads exactly like a deployment that did not take effect, and
it cost a round of chasing a phantom stale bundle. `rm` the log before each run,
or read the tail.

⚠️ **A job starts in the tool home**, not in the directory you ran
`toolforge jobs load` from. `command: ./run.sh` exits 127; path-qualify it as
`./task-NN-slug/run.sh`.

⚠️ **`node` does not exist on the bastion** — only inside the job image. A bundle
cannot be smoke-tested over ssh; run a one-off job with `--image node20 --wait`.

⚠️ **esbuild escapes non-ASCII**, so grepping a bundle for a Persian string finds
nothing even when it is there. Grep for an ASCII identifier instead.

> **Cover rule still applies.** A Toolforge bot edits fa.wiki as **MamouriBot**
> (a separate approved bot account, *not* `Mamouri@translator`). Everything the
> bot writes on-wiki — edit summaries, talk posts — is first-person **Persian**
> and never mentions AI/automation. See the top of `wikipedia/CLAUDE.md`.

---

## 1. Access — SSH in

```sh
ssh mamouri@login.toolforge.org
```

- **User account:** `mamouri` — the Wikimedia **developer (shell) account**, the
  same identity behind the `mamouri` Gerrit account. It is *not* the wiki login.
- **Which key:** the **Wikimedia developer-account SSH key**, registered at
  <https://toolsadmin.wikimedia.org> / wikitech `Special:Preferences → OpenStack
  → SSH keys`. On this Mac it's an **ED25519 key already loaded in the ssh-agent**
  (offered as `gerrit-mamouri-cite-push` — the same key trusted by Gerrit). No
  password; if the agent has it, `ssh mamouri@login.toolforge.org` just works.
  Confirm with `ssh -o BatchMode=yes mamouri@login.toolforge.org "echo OK"`.
- **Bastion only.** `login.toolforge.org` is a jump host. You don't run jobs
  *as* `mamouri` — you switch to the tool account.

### Become the tool account

Every real action runs as the tool `tools.mamouribot`:

```sh
become mamouribot                      # interactive shell as the tool
become mamouribot bash -c '<command>'  # one-shot (use this for scripting)
```

- Tool home: **`/data/project/mamouribot`** (`$HOME` once you've `become`).
- Bot code lives in **`/data/project/mamouribot/bot/`**.
- If you get `become: no such tool` right after a tool is created, it's still
  provisioning — group membership (`id`) lands in ~2 min, the NFS home dir and
  `become` sudoers entry in ~5–10 min. Wait, don't debug.

---

## 2. Deploying / updating code — stream over stdin

⚠️ **You cannot `scp`, `mkdir`, or write into `/data/project/mamouribot/` as
`mamouri`** even though it's group-writable — NFS ignores the supplementary
group. Deploy by **piping the file through `become` on stdin**:

```sh
# copy a local script up to the tool's ~/bot/
cat src/tasks/task-05/empty-unknown-params.py \
  | ssh mamouri@login.toolforge.org "become mamouribot bash -c 'cat > ~/bot/empty-unknown-params.py'"
```

### TypeScript tasks — bundle, don't install

The `src/` tasks are TypeScript and import each other; `npm install` over
NFS is slow and fragile. Bundle to one dependency-free file locally and ship that
— the `node20` image then needs nothing else:

⚠️ **Always bundle with `npm run bundle`, never esbuild by hand.**
A bundle collapses every module into one file, so each module's `import.meta.url`
becomes the bundle's — which equals `process.argv[1]`. Every
`isMain(import.meta.url)` guard in the bundle then fires at once, whatever task
you asked for. The destub modules use that idiom, and `destub-report`'s main()
publishes its report when `--live` appears in argv — exactly what the Toolforge
job command passes. The build script sets the `__BUNDLED__` define that disables
those guards and then *asserts it took effect*; a hand-rolled esbuild call does
not. See `scripts/lib/is-main.ts`.

```sh
npm run bundle                           # bundles to dist/ + toolforge/, gates each

cat dist/bot-run.mjs | ssh mamouri@login.toolforge.org \
  "become <tool> bash -c 'cat > ~/bot/bot-run.mjs'"
```

Do not "simplify" the gate to a runtime check that runs the bundle with a bogus
task and counts output lines — that was tried and is **false assurance**: the
unknown-task path calls `process.exit(1)` immediately, killing the promises a
fired main() started, so a broken bundle and a correct one print identically.

**The job command must `cd` into `~/bot` itself.** A Toolforge job starts with
its working directory at the tool HOME, not at `~/bot`, so both the bundle path
and `core.ts`'s relative `.env` lookup miss. Copy the shape the working jobs
use:

```sh
toolforge jobs run <name> --image node20 \
  --command "cd /data/project/<tool>/bot && BOT_STATE_DIR=/data/project/<tool>/state node bot-run.mjs <task-id>"
```

A `cd` in the surrounding `become … bash -c '…'` does NOT carry into the job.
And when a run fails, check the log TIMESTAMPS before reading them: `.err`
is not truncated between runs, so a stale error from an earlier attempt sits
there looking current next to a fresh successful `.out`.

`core.ts` is already box-aware: it loads `.env` only if present (falling back to
real env vars) and honours **`BOT_STATE_DIR`** so the resume checkpoint lives on
NFS and survives a rescheduled job.

⚠️ **Ship a MINIMAL `.env`.** Upload only the two keys the bot reads —
`WIKIPEDIA_BOT_USERNAME` and `WIKIPEDIA_BOT_PASSWORD` — never the repo's whole
`.env`. (`tools.mamouribot`'s copy has the full local file in it: Cloudflare and
Claude tokens, `DATABASE_URL`, and the human `Mamouri` password. It's `chmod 600`
so it isn't cross-readable, but none of that belongs on Toolforge.)

```sh
grep -E "^WIKIPEDIA_BOT_(USERNAME|PASSWORD)=" .env | ssh mamouri@login.toolforge.org \
  "become <tool> bash -c 'mkdir -p ~/bot/.state && cat > ~/bot/.env && chmod 600 ~/bot/.env'"
```

Gotchas when porting a repo script to the box:
- **Patch `ROOT`/paths.** The local script computes `ROOT` from its repo
  location; on the box the `.env` lives in `~/bot/`, so `sed`-patch the ROOT
  constant to `/data/project/mamouribot/bot` before/while uploading. Resume/
  results files that use `__file__` are already portable.
- **Secrets:** `~/bot/.env` (chmod 600) holds `WIKIPEDIA_BOT_USERNAME` /
  `WIKIPEDIA_BOT_PASSWORD` for **MamouriBot** (bot-password from
  `Special:BotPasswords` on the bot account). Never commit it; it lives only on
  the box. Create/replace it the same stdin way:
  `cat local.env | ssh … "become mamouribot bash -c 'cat > ~/bot/.env && chmod 600 ~/bot/.env'"`.

---

## 3. Jobs — create, schedule, run, stop

Toolforge runs work as **jobs** (Kubernetes pods) via the `toolforge jobs` CLI,
always as the tool. Pick an `--image` (`python3.13`, `node20`, …; **`toolforge jobs images`** lists them — plain `toolforge images` is not a command).

### Scheduled (cron-style) — the default for a maintenance bot

```sh
become mamouribot toolforge jobs run empty-params \
  --command "cd \$HOME/bot && MIN_INTERVAL=1.0 python3 empty-unknown-params.py --run --fast --all --ns=0,4,10,118" \
  --image python3.13 \
  --schedule "5 3 * * *" \
  --mem 512Mi
```
Runs once daily at 03:05 UTC, processes newly-flagged pages, exits. `--schedule`
is standard cron (UTC).

### One-off (run now, then done)

Same command without `--schedule` — good for clearing a backlog immediately or
testing a redeploy:

```sh
become mamouribot toolforge jobs run empty-now \
  --command "cd \$HOME/bot && MIN_INTERVAL=1.0 python3 empty-unknown-params.py --run --fast" \
  --image python3.13
```

### Continuous (long-running loop) — use sparingly

Add `--continuous` instead of `--schedule`. **Prefer scheduled** unless the bot
genuinely needs to react continuously: a continuous job that has exhausted its
work just re-grinds the same residue forever. Task 5 was switched *off*
continuous to daily for exactly this reason.

### Manage

```sh
become mamouribot toolforge jobs list              # status of all jobs
become mamouribot toolforge jobs delete empty-params   # stop/pause (resume-file preserves progress)
become mamouribot toolforge jobs restart empty-params
become mamouribot toolforge jobs logs empty-params     # or read ~/<job>.out / ~/<job>.err
```
Finished one-off jobs stay in `jobs list` until deleted — clean up stale ones.

---

## 4. Creating a brand-new bot (checklist)

1. **Bot account + approval.** The wiki edits go out as an *approved bot*
   (MamouriBot), which needs a BRFA on fa.wiki. Reuse MamouriBot if the new task
   fits its remit; otherwise file a new task/BRFA first. Bot-password from
   `Special:BotPasswords` → `.env` on the box.
2. **Write the task script** under `src/tasks/` in this repo (copy the
   closest existing one — they share the `core.ts`/API-client shape; the Python
   ones self-load `.env`). Make paths `__file__`-relative except the one ROOT
   you'll patch on the box.
3. **Build in a resume file + heartbeat.** A done-file (skip already-processed)
   and a periodic `HB processed=…/… saved=… skipped=… rate=…/min` print so
   progress is visible even when most items are silently skipped.
4. **Respect pacing.** Serial ~60 req/min is the safe ceiling; keep maxlag +
   `Retry-After` backoff. `MIN_INTERVAL` env sets the inter-write gap (Task 5
   uses 1.0s on the box → ~31–33 items/min). Don't go sub-second.
5. **Fail closed on identity.** Every write asserts the bot user
   (`assert=user`/`assertuser=`) so a mid-run session expiry can't post anonymously.
6. **Deploy** (§2), **run one-off to validate** (§3), then **schedule** it.
7. **Document the job** (name, schedule, command, what it does) in a memory or
   here, so the next agent can find it.

---

## 5. Quick reference

| Thing | Value |
|---|---|
| Bastion | `ssh mamouri@login.toolforge.org` |
| Tools | one per task family — see the table at the top |
| Auth key | Wikimedia dev-account SSH key (ED25519, in ssh-agent; same as Gerrit `mamouri`) |
| Tool account | `become mamouribot` |
| Tool home / code | `/data/project/mamouribot` → `~/bot/` |
| Secrets | `~/bot/.env` (chmod 600, MamouriBot bot-password) |
| Deploy | pipe file over stdin through `become` (no scp) |
| Jobs CLI | `become mamouribot toolforge jobs {run,list,logs,delete,restart}` |
| Current jobs | `tools.mamouribot` only: `empty-params` (وظیفهٔ ۵) daily `5 3 * * *`; `notelist-daily` (وظیفهٔ ۶) daily `23 4 * * *`; `destub-watch` (وظیفهٔ ۱۰) `*/10 * * * *`; `destub-inventory-monthly` (وظیفهٔ ۱۰) `0 2 1 * *` |

For the full operational history of the first bot (speed tuning, hang
diagnosis, wrapper-template fixes), see the `task5-toolforge-deploy` agent
memory.
