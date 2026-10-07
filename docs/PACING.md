# When should the bot edit? What the server actually tells us

Research note, ۸ اکتبر ۲۰۲۶. Written because it was raised in the وظیفهٔ ۱۲ review:

> «PWB هوشمند تر است و وقفه‌اش را تصادفی انتخاب نمی‌کند بلکه بر اساس بار سرورها — که از
> طریق رابط برنامه‌نویسی کاربردی مدیاویکی به اطلاع ربات می‌رسد — آن را تعیین می‌کند»

The implementation is `src/pacing.ts`, tested in `src/pacing.test.ts`.

## The short answer

**There is no endpoint that says "now is a good time to run", and pywikibot does not use
one.** The server's load signal is reactive: it tells you to slow down once you are
already going too fast. Honouring that signal properly is the whole of the difference,
and it is the part this framework was missing.

## What the API offers — probed, not assumed

| mechanism | when you get it | what it gives |
|---|---|---|
| `maxlag=N` on a request | on rejection | `error.code='maxlag'` with exact `lag` and the lagging `host` |
| **`Retry-After`** header | on a maxlag rejection and on 429 | how many seconds to wait. **5** on WMF wikis |
| `X-Database-Lag` header | same | current lag |
| `meta=siteinfo&siprop=dbrepllag` | on request, no write | `[{host, lag}]` right now |

Probes against fa.wikipedia:

```
siprop=dbrepllag                     → [{"host":"db2208","lag":0.878}]
maxlag=-1  (can never be satisfied)  → error maxlag, lag 0.080, host 10.192.32.15
                                        Retry-After: 5     X-Database-Lag: 0
plain query / maxlag=5 (satisfied)   → NO Retry-After, NO X-Database-Lag
```

That last line is the load-bearing one: **the headers are absent from successful
responses.** So lag can only be seen before a rejection by asking for it with
`dbrepllag`. Everything else is after the fact.

## What pywikibot actually does

`pywikibot/throttle.py::get_delay`:

```python
current_delay = max(self.mindelay,       # config.minthrottle — LOCAL
                    self.retry_after,    # from the Retry-After header — SERVER
                    min(self.writedelay, self.maxdelay))   # config.put_throttle — LOCAL
return current_delay * self.process_multiplicity
```

Three things, none of them predictive:

1. a locally configured floor,
2. raised to whatever the server last asked for via `Retry-After`,
3. multiplied by the number of concurrent pywikibot processes for the same user, so N
   bots share one rate instead of N.

It does not consult `dbrepllag`, does not model load, and does not pick an idle hour. So
"PWB chooses the moment the server is idle" is not what happens; what happens is that PWB
obeys `Retry-After` and divides its rate among its own processes.

## The Node.js landscape

`mwn` (3.0.3, maintained, by SD0001 of Toolforge) is the real framework in this space and
is TypeScript-native. On maxlag it reads `retry-after` from the response, exactly as
above. Its batch helper otherwise paces on `delay = 5000` — a constant. It never polls
`dbrepllag`. `m3api`, `nodemw`, `wikiapi` are thinner clients.

**No library does the thing that was hoped for**, because the API does not expose it.
Adopting `mwn` would buy the `Retry-After` handling and cost the things `core.ts` has that
it does not: identity gating with `assert`/`assertuser`, the on-wiki emergency stop page,
`{{nobots}}`, the publish gate, post-save render verification and self-revert. Not worth
the trade for one feature that is forty lines.

## What this framework now does

Same `max()` shape as pywikibot, plus two things it lacks:

- **`Retry-After` is read off every response** and obeyed by the retry loop and the maxlag
  handler. Previously both invented a number — an exponential backoff, and `lag + 1` —
  while the server's own figure sat unread in the response.
- **The gap slides between a floor and a ceiling on measured lag**, polled from
  `dbrepllag` every 25 writes. This is *more conservative* than pywikibot, not cleverer:
  pywikibot ignores lag until it is refused, whereas this slows down beforehand. Live
  behaviour with a 10s floor and a 60s ceiling:

  | lag | gap | reason |
  |---|---|---|
  | 0.45s (real reading) | 10s | floor |
  | 2s | 22.5s | lag |
  | 3s | 35s | lag |
  | 4.5s | 53.8s | lag |
  | 20s | 60s | ceiling |

- **Concurrent runs share one rate** (`RunRegistry`), which is pywikibot's
  `process_multiplicity`. Each run heartbeats into `$BOT_STATE_DIR/runs/`; the gap is
  multiplied by the number of live runs. Two overlapping Toolforge jobs otherwise each
  honour a 10s gap and together produce an edit every 5s. It is deliberately not a lock:
  a second run is slowed, never blocked, because blocking turns an overlap into a job
  that silently does nothing.

Every gap longer than 1.5× the floor is logged with its reason, because a bot that
quietly changes its own pace is one nobody can review.

## Two things that are NOT performance settings

- **The human account's 30–120s spread is cover, not courtesy.** AGENTS.md requires «a
  random 30–120s after every write (not a fixed cadence)», so under `--as-me` the pacer
  uses a uniform spread across that whole range. It may be *lengthened* by lag or by
  `Retry-After`; it is never shortened. An early version of `pacing.ts` applied
  proportional jitter to a floor and could emit a 15s gap for a 30s floor — caught by a
  test, not by review.
- **MamouriBot holds `noratelimit` and `apihighlimits`** on fa (`groups: ['bot', …]`,
  verified ۸ اکتبر ۲۰۲۶). The API therefore imposes no ceiling whatsoever, and every gap
  the bot waits is self-imposed. That is the argument for making it principled rather
  than arbitrary: nothing external will catch it being too aggressive.

## If someone wants to go further

The only genuinely predictive signal available is historical: Wikimedia publishes traffic
and lag metrics on Grafana, and a bot could learn the quiet hours for `fawiki`'s section
and prefer them. That is a scheduling question, not an API one, and on Toolforge it is
answered by choosing the cron expression — not by code inside the bot.
