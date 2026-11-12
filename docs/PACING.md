# How the bot decides when to edit

I wrote this on ۸ اکتبر ۲۰۲۶ after Huji raised it in the وظیفهٔ ۱۲ review:

> «PWB هوشمند تر است و وقفه‌اش را تصادفی انتخاب نمی‌کند بلکه بر اساس بار سرورها — که از
> طریق رابط برنامه‌نویسی کاربردی مدیاویکی به اطلاع ربات می‌رسد — آن را تعیین می‌کند»

The code is `src/pacing.ts`, with tests in `src/pacing.test.ts`.

## In short

No API endpoint tells a bot that now is a good time to edit, and pywikibot doesn't use one.
The server only tells you to slow down once you are already going too fast. What the bot
needed was to follow that signal properly, and it now does.

## What the API offers

I tested each of these against fa.wikipedia:

| mechanism | when you get it | what it gives |
|---|---|---|
| `maxlag=N` on a request | on rejection | `error.code='maxlag'` with exact `lag` and the lagging `host` |
| **`Retry-After`** header | on a maxlag rejection and on 429 | how many seconds to wait. **5** on WMF wikis |
| `X-Database-Lag` header | same | current lag |
| `meta=siteinfo&siprop=dbrepllag` | on request, no write | `[{host, lag}]` right now |

```
siprop=dbrepllag                     → [{"host":"db2208","lag":0.878}]
maxlag=-1  (can never be satisfied)  → error maxlag, lag 0.080, host 10.192.32.15
                                        Retry-After: 5     X-Database-Lag: 0
plain query / maxlag=5 (satisfied)   → NO Retry-After, NO X-Database-Lag
```

The last line matters most: successful responses don't carry these headers. The only way
to see lag before being rejected is to ask for it with `dbrepllag`. Everything else arrives
after the fact.

## What pywikibot does

`pywikibot/throttle.py::get_delay`:

```python
current_delay = max(self.mindelay,       # config.minthrottle — LOCAL
                    self.retry_after,    # from the Retry-After header — SERVER
                    min(self.writedelay, self.maxdelay))   # config.put_throttle — LOCAL
return current_delay * self.process_multiplicity
```

So the delay is:

1. a minimum set in the local configuration,
2. raised to whatever the server last asked for in `Retry-After`,
3. multiplied by the number of pywikibot processes running for the same user, so N bots
   share one rate instead of each using it.

None of these predicts anything. It doesn't read `dbrepllag`, doesn't estimate load, and
doesn't pick a quiet hour. pywikibot follows `Retry-After` and splits its rate among its own
processes; it does not wait for a moment when the servers are idle.

## Node.js libraries

`mwn` (3.0.3, maintained, by SD0001 of Toolforge) is the main framework here and is written
in TypeScript. On maxlag it reads `retry-after` from the response, the same as pywikibot.
Otherwise its batch helper waits a fixed `delay = 5000`. It never asks for `dbrepllag`.
`m3api`, `nodemw` and `wikiapi` are thinner clients.

None of them does what Huji described, because the API does not offer it. Moving to `mwn`
would give me its `Retry-After` handling, which is about forty lines, and lose things
`core.ts` has and `mwn` doesn't: the `assert`/`assertuser` identity checks, the stop page on
the wiki, `{{nobots}}`, the publish check, and checking the render after saving with a
self-revert. I decided it was not worth it.

## What the bot does now

It takes the same `max()` as pywikibot, with two additions:

- **`Retry-After` is read from every response** and used by both the retry loop and the
  maxlag handling. Before this, both used their own numbers (an exponential backoff, and
  `lag + 1`) and ignored the figure the server sent.
- **The pause moves between a minimum and a maximum depending on measured lag**, read from
  `dbrepllag` every 25 writes. This is more cautious than pywikibot, which ignores lag until
  a request is refused; this slows down before that happens. Measured behaviour with a 10s
  minimum and a 60s maximum:

  | lag | gap | reason |
  |---|---|---|
  | 0.45s (real reading) | 10s | floor |
  | 2s | 22.5s | lag |
  | 3s | 35s | lag |
  | 4.5s | 53.8s | lag |
  | 20s | 60s | ceiling |

- **Runs at the same time share one rate** (`RunRegistry`), like pywikibot's
  `process_multiplicity`. Each run writes a heartbeat to `$BOT_STATE_DIR/runs/`, and the
  pause is multiplied by the number of live runs. Without this, two overlapping Toolforge
  jobs would each wait 10s and together edit every 5s. It is not a lock: a second run is
  slowed down but never blocked, because blocking would turn an overlap into a job that
  quietly does nothing.

Every pause longer than 1.5 times the minimum is logged with its reason, so anyone reviewing
the bot can see when and why it slowed down.

## Two pauses that are not about server load

- **The 30–120s range under my own account is a fixed rule, not a load setting.** The
  companion repository's rules ask for «a random 30–120s after every write (not a fixed
  cadence)», so under `--as-me` the pause is picked evenly from that whole range. Lag or
  `Retry-After` can make it longer, never shorter. An early version of `pacing.ts` added a
  proportional random amount to the minimum and could produce a 15s pause for a 30s
  minimum. A test caught it.
- **MamouriBot has `noratelimit` and `apihighlimits`** on fa (`groups: ['bot', …]`, checked
  ۸ اکتبر ۲۰۲۶). The API sets no limit on it at all, and every pause the bot makes is its
  own choice. Since nothing outside would stop it going too fast, the pauses should follow
  a clear rule instead of an arbitrary number.

## Going further

The only signal that could predict load is historical. Wikimedia publishes traffic and lag
graphs on Grafana, and a bot could learn the quiet hours for the database section `fawiki`
is on and prefer them. That is a question of scheduling, not of the API, and on Toolforge
the answer is the cron schedule, not code inside the bot.
