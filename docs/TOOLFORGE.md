# Running the bot on Toolforge

Every task runs inside one Toolforge tool, `mamouribot`. A new task is a directory and a job
inside it; don't create another tool. On Toolforge the bot edits as **MamouriBot**, not as
`Mamouri`.

> Changing a citation parameter name? The fa CS1 names are not defined where you would
> expect, and `پودمان:Citation/CS1/Configuration` is read by InternetArchiveBot, not by the
> code that renders citations. The chain is described at the top of
> `src/tasks/task-03/normalize-cite-params.ts`.

## 1. Logging in

```sh
ssh mamouri@login.toolforge.org
become mamouribot                      # interactive shell as the tool
become mamouribot bash -c '<command>'  # one command, for scripting
```

- `mamouri` is my Wikimedia developer (shell) account, not the wiki login. The key is the
  developer-account ED25519 key in my ssh-agent (the same one Gerrit trusts). Check with
  `ssh -o BatchMode=yes mamouri@login.toolforge.org "echo OK"`.
- `login.toolforge.org` is only a bastion. Jobs run as the tool, and `node` is not installed
  on the bastion, only in the job image.
- Tool home: `/data/project/mamouribot` (`$HOME` after `become`).

The eight tools used before `mamouribot` are disabled and are deleted automatically about
۱۷ نوامبر ۲۰۲۶. Until then `id` and `become` still list them; nothing runs there.

## 2. Layout on the tool

```
~/mamouribot.mjs            every registered BotTask (src/run.ts)
~/task-13-reports.mjs       وظیفهٔ ۱۳, every database report
~/cite-scan-conflicts.mjs   وظیفهٔ ۳'s review-page scanner
~/destub-watch.mjs          وظیفهٔ ۱۰ poller
~/destub-inventory.mjs      وظیفهٔ ۱۰ monthly inventory
~/gates.py                  the publish check, beside the bundles
~/task-NN-<slug>/           run.sh (+ jobs.yaml) per task, deployed from toolforge/
~/task-10-destub/           وظیفهٔ ۱۰'s working directory (its state is relative to it)
~/state/                    BOT_STATE_DIR: every task's resume checkpoint
~/logs/                     job logs
~/bot/                      وظیفهٔ ۵ only (Python): empty-unknown-params.py and its .env
```

The TypeScript bundle is `~/mamouribot.mjs`. Every `run.sh` does `cd "$(dirname "$0")"` and
then `exec node ../mamouribot.mjs <task-id>`, so it runs the file in the tool home.
`~/bot/` is only for وظیفهٔ ۵.

Each `run.sh` sets `BOT_STATE_DIR` to `$HOME/state` and, for most tasks, `BOT_GATES_PY` to
the `gates.py` in the tool home.

## 3. Credentials

The bot password for MamouriBot is stored as tool environment variables:

```sh
become mamouribot
toolforge envvars create WIKIPEDIA_BOT_USERNAME   # prompts; the value stays out of shell history
toolforge envvars create WIKIPEDIA_BOT_PASSWORD
toolforge envvars list
```

`core.ts` reads a `.env` only if one exists, so nothing else is needed. وظیفهٔ ۵ (Python)
reads `~/bot/.env` (`chmod 600`). Upload only the two keys it needs:

```sh
grep -E "^WIKIPEDIA_BOT_(USERNAME|PASSWORD)=" .env | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/bot/.env && chmod 600 ~/bot/.env'"
```

Open: the current `~/bot/.env` on the tool is a copy of my whole local `.env`, including
unrelated tokens and my own account's password. It should be replaced with the two-key
version above.

## 4. Bundle and upload

Always build with `npm run bundle`, never esbuild by hand. It sets the `__BUNDLED__` define
that turns off every `isMain()` guard and checks that it took effect; without it, any job run
with `--live` can also start another module's `main()`.

```sh
npm run bundle
```

It writes `dist/*.mjs` and copies the ones jobs use into `toolforge/`:
`toolforge/mamouribot.mjs`, `toolforge/task-13-reports.mjs`,
`toolforge/cite-scan-conflicts.mjs` and `toolforge/gates.py`. The destub bundles stay in
`dist/`. All of these are build output and git-ignored.

You can't `scp` or `mkdir` into the tool home as `mamouri` (NFS ignores the supplementary
group), so upload through `become` on stdin:

```sh
cat toolforge/mamouribot.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/mamouribot.mjs'"
cat toolforge/gates.py | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/gates.py'"
cat toolforge/task-13-reports.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/task-13-reports.mjs'"
cat dist/destub-watch.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-watch.mjs'"

# a task's run.sh
cat toolforge/task-15-source-tags/run.sh | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'mkdir -p ~/task-15-source-tags && cat > ~/task-15-source-tags/run.sh && chmod +x ~/task-15-source-tags/run.sh'"

# وظیفهٔ ۵
cat src/tasks/task-05/empty-unknown-params.py | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/bot/empty-unknown-params.py'"
```

`empty-unknown-params.py` has a hard-coded `ROOT` for finding `.env`. Change it to
`/data/project/mamouribot/bot` when uploading.

After uploading, check that the change is in the file the job actually runs. esbuild escapes
non-ASCII, so grep for an ASCII identifier the change added, not a Persian string:

```sh
ssh mamouri@login.toolforge.org "become mamouribot bash -c 'grep -c <new-identifier> ~/mamouribot.mjs'"
```

Check what the bundle reads from the environment, and read the whole list:

```sh
grep -oE "process\.env\.[A-Z_]+" toolforge/*.mjs | sort -u
```

A new name there is the only sign that something started reading a secret.

## 5. Jobs and their schedules

### Scheduled jobs

| job | task | schedule (UTC) | command |
|---|---|---|---|
| `st-daily` | ۱۵ | `5 3 * * *` | `./task-15-source-tags/run.sh --live --limit 200 --delay 15` |
| `empty-params` | ۵ | `5 3 * * *` | `cd $HOME/bot && MIN_INTERVAL=1.0 python3 empty-unknown-params.py --run --fast --all --ns=0,4,10,118` |
| `mr-daily` | ۱۳ | `17 3 * * *` | `./task-13-move-report/run.sh --live --refresh` |
| `pr-daily` | ۱۳ | `40 4 * * *` | `./task-13-move-report/run.sh --report portals --live` |
| `fc-weekly` | ۱۳ | `50 4 * * 1` | `./task-13-move-report/run.sh --report featured --live` |
| `up-weekly` | ۱۳ | `55 4 * * 1` | `./task-13-move-report/run.sh --report prefs --live` |
| `nb-daily` | ۱۳ | `10 5 * * *` | `./task-13-move-report/run.sh --report neighbors --live` |
| `moves-daily` | ۱۳ | `30 5 * * *` | `./task-13-move-report/run.sh --report usermoves --live` |
| `ir-weekly` | ۱۳ | `20 6 * * 3` | `./task-13-move-report/run.sh --report iranica --live` |
| `ud-daily` | ۱ | `20 6 * * *` | `./task-01-use-dmy-dates/run.sh --live --limit 200 --delay 15` |
| `cp-daily` | ۴ | `35 6 * * *` | `./task-04-company-params/run.sh --live --limit 50 --delay 15` |
| `tf-daily` | ۱۶ | `50 6 * * *` | `./task-16-text-fragment/run.sh --live --limit 200 --delay 15` |
| `cite-params-hourly` | ۳ | `25 * * * *` | `./task-03-cite-params/run.sh --live --limit 250 --delay 5` |
| `tx-hourly` | ۱۱ | `45 * * * *` | `./task-11-taxonomy/run.sh --live --limit 150 --delay 10` |
| `notelist-watch` | ۶ | `*/15 * * * *` | `cd /data/project/mamouribot && BOT_STATE_DIR=/data/project/mamouribot/state node mamouribot.mjs notelist-missing --live --delay 12` |
| `destub-watch` | ۱۰ | `*/10 * * * *` | `cd /data/project/mamouribot/task-10-destub && node ../destub-watch.mjs --live` |
| `destub-inventory-monthly` | ۱۰ | `0 2 1 * *` | `cd /data/project/mamouribot/task-10-destub && node ../destub-inventory.mjs` |

The ones with a `run.sh` are defined in `toolforge/task-NN-*/jobs.yaml`, except
`cite-params-hourly`. That job and the last four rows were created by hand with
`toolforge jobs run`; their commands are in `docs/task-03-citation-normalization.md`,
`docs/task-06-notelist.md` and `docs/task-10-destub.md`.

### One-off jobs in the `jobs.yaml` files

These have no schedule. They are the check, dry-run and trial steps for each task.

| task | jobs |
|---|---|
| ۱ | `ud-check`, `ud-dry`, `ud-first` |
| ۳ | `cn-check`, `cn-dry`, `cn-trial-50`, `cn-trial-1000` |
| ۴ | `cp-check`, `cp-dry`, `cp-first` |
| ۸ | `mp-check`, `mp-targets`, `mp-trial`, `mp-full` |
| ۱۱ | `tx-check` |
| ۱۲ | `lf-check`, `lf-dry`, `lf-trial` |
| ۱۳ | `mr-selftest`, `mr-dry` |
| ۱۴ | `pop-check`, `pop-dry`, `pop-trial`, `pop-full` |
| ۱۵ | `st-check`, `st-dry`, `st-first` |
| ۱۶ | `tf-check`, `tf-dry`, `tf-first` |

`--check` tests the credentials, the bot flag and the stop page, and makes no edits. A run
without `--live` is a dry run.

### Creating a job

Never use `toolforge jobs load`. It syncs: it deletes every scheduled job that is not in the
file you give it, which means every other task's jobs, and it starts every one-off job in the
file at once. Create each job on its own with `toolforge jobs run`, copying the fields from
its `jobs.yaml`:

```sh
become mamouribot toolforge jobs run tx-hourly --image node20 --mem 1Gi --schedule "45 * * * *" \
  --command "./task-11-taxonomy/run.sh --live --limit 150 --delay 10" \
  --retry 0 --emails onfailure -o logs/tx-hourly.out -e logs/tx-hourly.err
```

- A job starts in the tool home, not where you ran the command. Write
  `./task-NN-slug/run.sh`, not `./run.sh` (which exits 127).
- A `cd` in the surrounding `become … bash -c '…'` does not carry into the job.
- Drop `--schedule` for a one-off. Add `--wait` to block until it finishes.
- Prefer `--schedule` to `--continuous`: a continuous job that runs out of work loops over the
  same leftovers.
- `toolforge jobs images` lists the images (`node20`, `python3.13`, …).
- To change a job: `toolforge jobs delete X`, then `toolforge jobs run X …` again. Update its
  `jobs.yaml` and the table above in the same change.

There is plenty of room in the quota (50 cron definitions, 16 concurrent pods, 8 GiB):

```sh
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs list'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs quota'
```

## 6. Logs

```sh
become mamouribot toolforge jobs logs <job>
become mamouribot bash -c 'tail -50 ~/logs/<job>.out'
```

The log files are set by each job's `filelog-stdout`/`filelog-stderr` (`-o`/`-e`), relative to
the tool home, so they are in `~/logs/`. Some older jobs use other names (`logs/daily.out` for
`mr-daily`, `logs/check.out` for `cn-check`); check the `jobs.yaml`.

Log files are appended to, never replaced, and `.err` is not cleared between runs. Read the
end of the file and check timestamps, or delete the log before a run.

## 7. Stopping

Any of these stops the bot within one page:

- change `کاربر:MamouriBot/توقف` to anything other than `بله`; it is read before every edit
- `toolforge jobs delete <job>`
- an admin blocks the bot account

Every task saves the titles it has finished in `~/state/`, so a restarted job carries on
where it stopped.

## 8. Adding a task's job

1. The task is approved for the scope it will run (`BUILDING-A-TASK.md` §0).
2. Add `toolforge/task-NN-<slug>/run.sh` and `jobs.yaml`, copied from the closest task.
   Put Persian page selectors in `run.sh`, not in the job command, because the two shells a
   job command passes through mangle Persian text.
3. `npm run bundle`, upload the bundle and `run.sh` (§4).
4. Run the `-check` job, then the dry run, then a small live batch, and read the diffs.
5. Create the scheduled job (§5) and add it to the table above.
