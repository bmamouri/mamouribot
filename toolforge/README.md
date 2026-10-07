# MamouriBot on Toolforge

One directory per tool. The bundles and the gate battery are shared and sit at the top
level; each tool's directory holds only its entry point and its job list.

| path | purpose |
|---|---|
| `mamouribot.mjs` | every registered `BotTask`, bundled (`src/run.ts`) |
| `move-report.mjs` | وظیفهٔ ۱۳, the «برای انتقال مقاله» report (`src/tasks/task-13/move-report-cli.ts`) |
| `gates.py` | the publish gate battery. Python, so it cannot be bundled; it has to be on disk beside the bundle |
| `musician-params/` | وظیفهٔ ۸ — tool `fawiki-musician-infobox-params`, approved 2026-09-24 |
| `move-report/` | وظیفهٔ ۱۳ — tool not created yet; the permission request comes first |

There is **no** `npm install` on Toolforge and no `node_modules` on NFS: each `.mjs` is
self-contained and runs on the stock `node20` image. Deploy a tool by copying the
bundle, `gates.py` and the tool's two files into the tool home.

## Rebuilding the bundle

From the repo root, after any change under `src/`:

```bash
npm run bundle
```

Never run esbuild by hand. A bundle collapses every module into one file, so
every `isMain(import.meta.url)` guard inside it becomes true at once and running
*any* entry point with `--live` can also fire another task's `main()`. The
builder sets the `__BUNDLED__` define that disables those guards, asserts the
define actually reached the output, and only then copies the result here. The
shipped `mamouribot.mjs` is a copy of `dist/bot-run.mjs`, so "is the bundle
current?" is answered by rebuilding and diffing:

```bash
npm run bundle && git diff --stat toolforge/mamouribot.mjs   # empty = current
```

A bundle must read credentials from the environment and from nowhere else. Verify
before deploying, and read the whole list rather than glancing at it: a new name
appearing here is the only sign that something started reading a secret from a file.

```bash
grep -oE "process\.env\.[A-Z_]+" toolforge/*.mjs | sort -u
```

Expected, and nothing else: `WIKIPEDIA_BOT_USERNAME`, `WIKIPEDIA_BOT_PASSWORD`,
`BOT_STATE_DIR`, `BOT_GATES_PY`, `TZ`, the two per-task caps `MAX_ARTICLES` and
`TARGET_CAP`, and `TOOLFORGE_SSH` / `TOOLFORGE_TOOL`, which only the developer-machine
replica backend reads and which are unset in a job.

## One-time setup

1. Tool: **`fawiki-musician-infobox-params`**
 (already created).
2. `ssh <shell-name>@login.toolforge.org` then `become fawiki-musician-infobox-params`.
3. Store the bot-password credentials as envvars — **never** in a file here, tool
   repos are public. We reuse MamouriBot's existing bot password (the same pair
   that is in the local `.env`); its grants were checked and already cover this
   task: `bot` ✓, `edit` ✓, `apihighlimits` ✓.
   ```bash
   toolforge envvars create WIKIPEDIA_BOT_USERNAME   # value: MamouriBot@<appname>
   toolforge envvars create WIKIPEDIA_BOT_PASSWORD   # prompts; not echoed
   toolforge envvars list                            # confirm both exist
   ```
   `toolforge envvars create` prompts for the value on stdin, so the secret never
   lands in your shell history. Read the values from the local `.env` — don't
   retype them:
   ```bash
   grep '^WIKIPEDIA_BOT_' .env            # run on your machine, copy the values across
   ```
   This is the same password used for local runs — deliberately, so there is one
   credential to manage rather than two.
4. Copy the files into the tool's `$HOME` (from your machine):
   ```bash
   rsync -av toolforge/ <shell-name>@login.toolforge.org:/data/project/fawiki-musician-infobox-params/
   ```

## Running — in this order, do not skip step 2's audit

```bash
become fawiki-musician-infobox-params

# 0. preflight: prove the credentials + emergency stop work. NO edits.
toolforge jobs run mp-check --image node20 --command "./run.sh --check" --wait
toolforge jobs logs mp-check        # must end with «آمادهٔ اجرا است.»

# 1. build the frozen target list (~6 min, no login, no writes)
toolforge jobs run mp-targets --image node20 --command "./run.sh --limit 1" --wait
cat state/musician-params.targets.json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))'

# 2. the trial — 100 live edits, then it stops on its own
toolforge jobs load jobs.yaml      # defines all four; only run what you need
toolforge jobs run mp-trial --image node20 --command "./run.sh --live --limit 100 --delay 15"
toolforge jobs logs mp-trial -f

#    *** AUDIT HERE *** — see below. Do not continue until it passes.

# 3. the rest (~1,200 more edits at 15s ≈ 5 hours)
toolforge jobs run mp-full --image node20 --command "./run.sh --live --delay 15"
```

`jobs.yaml` is loadable with `toolforge jobs load jobs.yaml` if you prefer
declarative; the explicit `run` commands above are identical.

## Auditing the trial

From the repo on your machine:

```bash
npx tsx src/tasks/task-08/audit.ts        # reads MamouriBot's last 100 edits (local only)
```

It re-renders every edited article before/after and checks: the page left the
tracking category, no new Lua/template errors, no unexpected value changes, and
the diff touches parameter *names* only. Investigate anything it flags before
running `mp-full`.

## Stopping it

Any of these halts the bot within one page:

- blank or change `کاربر:MamouriBot/توقف` to anything other than `بله`
- an admin blocks the bot account
- `toolforge jobs delete mp-full`

State is in `$HOME/state/musician-params.json`; the bot never re-edits a title
recorded there, so restarting after a stop is safe and resumes where it left off.

## Note

`--delay 15` is seconds *between writes*. The policy floor is 10s. Don't lower it —
the per-user edit throttle (`ratelimited`) is separate from HTTP 429 and will start
rejecting writes.
