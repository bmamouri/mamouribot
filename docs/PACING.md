# How the bot decides when to edit

The bot waits between writes according to what the server reports, not a fixed number. The
code is `src/pacing.ts` (`Pacer`, `RunRegistry`), called from `writeGapMs` in `src/core.ts`.
Tests are in `src/pacing.test.ts`.

## What the server tells a bot

No API endpoint says "now is a good time to edit". The signals are:

| mechanism | when you get it | what it gives |
|---|---|---|
| `maxlag=N` on a request | on rejection | `error.code='maxlag'` with `lag` and `host` |
| `Retry-After` header | on a maxlag rejection and on 429 | seconds to wait (5 on WMF wikis) |
| `X-Database-Lag` header | same | current lag |
| `meta=siteinfo&siprop=dbrepllag` | on request | current replica lag |

Successful responses carry neither header, so `dbrepllag` is the only way to see lag before
being rejected.

## How the gap is chosen

For the bot account the gap is:

1. The floor, `--delay` (default 10s). Each job's value is in its command; see
   `TOOLFORGE.md`.
2. Raised by measured lag. `dbrepllag` is read every 25 writes. At 1s of lag or less the
   floor applies; at `maxlag` (5s) or more the ceiling applies; in between the gap slides
   linearly. The ceiling is `max(6 × --delay, 60s)`.
3. Raised to the server's `Retry-After` if it asked for more. `Retry-After` is read from
   every response and can exceed the ceiling.
4. Multiplied by the number of live runs, so overlapping jobs share one rate.
5. Randomised by ±10%, but never below the floor.

With a 10s floor and a 60s ceiling:

| lag | gap |
|---|---|
| 0.45s | 10s |
| 2s | 22.5s |
| 3s | 35s |
| 4.5s | 53.8s |
| 20s | 60s |

Every gap longer than 1.5 × `--delay` is logged with its reason.

This is the same `max()` pywikibot uses (`throttle.py::get_delay`: a local floor, the server's
`Retry-After`, times `process_multiplicity`), plus the lag reading, which makes the bot slow
down before the server starts refusing it.

## Sharing the rate between runs

Each run writes a heartbeat file to `$BOT_STATE_DIR/runs/`. A run counts as live if its
heartbeat is under two minutes old; stale files are deleted. The gap is multiplied by the
number of live runs. It is not a lock: a second run is slowed down, never blocked, so an
overlap can't turn into a job that silently does nothing.

## Under my own account (`--as-me`)

The gap is drawn uniformly from 30–120s after every write, as the companion repository's
rules require. Lag and `Retry-After` can make it longer, never shorter. `PACE_LO` and
`PACE_HI` (seconds) override the range for one run, and a `--delay` above 30 raises the
floor.

## Why the bot needs its own rule

MamouriBot has `noratelimit` and `apihighlimits` on fa, so the API puts no limit on it. Every
pause is the bot's own choice, which is why it follows the rule above instead of an
arbitrary number.

Choosing quiet hours is a scheduling question, not an API one. On Toolforge that is the cron
schedule in each `jobs.yaml`.
