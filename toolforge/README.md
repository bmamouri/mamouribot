# MamouriBot on Toolforge

**There is one tool: `mamouribot`. Every task runs inside it. Do not create another.**

That is not a preference to be revisited — it is the operating rule. The full reasoning,
the deployment playbook and the gotchas are in `../docs/TOOLFORGE.md`; this file describes
what is in this directory and how it maps onto the tool.

## What is here

One directory per **task**, named by its permission-request number, matching
`src/tasks/task-NN/` and `docs/task-NN-*.md`. The bundles and the gate battery are shared
and sit at the top level, because every task is inside the same tool and therefore shares
them.

| path | purpose |
|---|---|
| `mamouribot.mjs` | every registered `BotTask`, bundled from `src/run.ts` |
| `move-report.mjs` | وظیفهٔ ۱۳, the «مقاله‌های نیازمند تغییرنام» report (`src/tasks/task-13/move-report-cli.ts`) |
| `cite-scan-conflicts.mjs` | وظیفهٔ ۳'s review-page scanner (`src/tasks/task-03/scan-conflicts-cli.ts`) |
| `gates.py` | the publish gate battery. Python, so it cannot be bundled; it ships beside the bundles |
| `task-03-cite-params/` | وظیفهٔ ۳ — `run.sh`, `scan.sh`, `jobs.yaml` |
| `task-08-musician-params/` | وظیفهٔ ۸ — `run.sh`, `jobs.yaml` |
| `task-13-move-report/` | وظیفهٔ ۱۳ — `run.sh`, `jobs.yaml` |

The `.mjs` files and `gates.py` are **build output** and are git-ignored; `npm run bundle`
writes them. The `run.sh` and `jobs.yaml` files are source and are tracked.

On the tool, that becomes:

```
/data/project/mamouribot/
  mamouribot.mjs  destub-watch.mjs  destub-inventory.mjs  cite-scan-conflicts.mjs
  gates.py
  state/              BOT_STATE_DIR — every task's resume checkpoint
  logs/               job logs
  bot/                وظیفهٔ ۵ (Python)
  task-NN-<slug>/     per-task run dir, for tasks that need their own CWD
```

There is **no** `npm install` on Toolforge and no `node_modules` on NFS: each `.mjs` is
self-contained and runs on the stock `node20` image.

## It all fits in one tool, measured

Checked against the live quota on ۸ اکتبر ۲۰۲۶, with four cron jobs running:

| resource | used | limit |
|---|---|---|
| Cron job definitions | 4 | **50** |
| Concurrent pods | 1 | 16 |
| Continuous jobs | 0 | 16 |
| Memory | 1 GiB | 8 GiB (6 GiB per job) |
| CPU | 1 | 16 |

Fourteen tasks with one cron each would be 14 of 50. The ceiling is nowhere near.

## Rebuilding and deploying

```bash
npm run bundle          # from the repo root, after any change under src/
```

Never run esbuild by hand. A bundle collapses every module into one file, so every
`isMain(import.meta.url)` guard inside it becomes true at once and running *any* entry
point with `--live` can fire another task's `main()`. The builder sets the `__BUNDLED__`
define that disables those guards and asserts it reached the output.

Deploy by piping over `become` — you cannot `scp` or `mkdir` into the tool's home as your
shell user, because NFS ignores the supplementary group:

```bash
cat toolforge/mamouribot.mjs \
  | ssh <shell>@login.toolforge.org "become mamouribot bash -c 'cat > ~/mamouribot.mjs'"
```

A bundle must read credentials from the environment and nowhere else. Read the whole list
rather than glancing at it: a new name appearing here is the only sign that something
started reading a secret from a file.

```bash
grep -oE "process\.env\.[A-Z_]+" toolforge/*.mjs | sort -u
```

Expected and nothing else: `WIKIPEDIA_BOT_USERNAME`, `WIKIPEDIA_BOT_PASSWORD`,
`WIKIPEDIA_USERNAME`, `WIKIPEDIA_PASSWORD`, `BOT_STATE_DIR`, `BOT_GATES_PY`, `TZ`, the
per-task caps `MAX_ARTICLES` and `TARGET_CAP`, `LINKFIX_NAMES`, `LINKFIX_REPORT`, and
`TOOLFORGE_SSH` / `TOOLFORGE_TOOL`, which only the developer-machine replica backend reads
and which are unset in a job.

## Credentials

Stored once, on the one tool, as envvars — never in a file here, this repository is
public:

```bash
become mamouribot
toolforge envvars create WIKIPEDIA_BOT_USERNAME   # prompts; value never hits shell history
toolforge envvars create WIKIPEDIA_BOT_PASSWORD
toolforge envvars list
```

One tool means one copy of the credential to manage and to rotate. The nine-tool
arrangement that preceded this had nine.

## Stopping the bot

Any of these halts it within one page:

- blank `کاربر:MamouriBot/توقف` or change it to anything other than `بله`; it is read
  before **every** edit
- an admin blocks the bot account
- `toolforge jobs delete <job>`

Every task checkpoints the titles it has finished in `~/state/`, so restarting after a
stop resumes rather than repeating.

## Pacing

`--delay` is the floor in seconds between writes; the policy floor is 10. The bot also
honours `maxlag` and the server's `Retry-After` on every request and slows down as replica
lag rises — see `../docs/PACING.md`. Don't lower the floor: the per-user edit throttle
(`ratelimited`) is separate from HTTP 429 and will start rejecting writes.
