# وظیفهٔ ۲۰: English values left in infoboxes and navboxes

Mass imports copied en infoboxes and navboxes into fa and left many values in English.
This task translates two kinds of them, and only those two.

## Status

Filed ۲۲ نوامبر ۲۰۲۶ at `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۲۰`, waiting
for review. A 100-edit trial ran the same day under `--as-me` (97 articles, 3 navboxes, dictionary
rev 45017783): 0 refused before saving, 0 reverted after, every diff checked on the wiki, and the
new Persian value visible in every saved revision. The trial is reported on the request page.

## What it changes

| kind | example | where the Persian comes from |
|---|---|---|
| dictionary value | `\|position=Midfielder` → `\|position=هافبک` | a row of the on-wiki dictionary at the pinned revision |
| navbox label | `[[اترنت\|Ethernet]]` → `[[اترنت]]` | the title of the Persian article the link already points to |

A dictionary value changes only when the **whole** value of a whitelisted parameter of a
named template equals the row's English value (case and spacing aside). Refs, comments and
whitespace around it are kept.

A navbox label changes only when the label is **exactly** the English title of the linked
Persian article (its en sitelink, disambiguator aside, case not aside), the article is not
reached through a redirect, and is not a disambiguation page.

## The dictionary

`ویکی‌پدیا:ربات/وظیفه ۲۰/واژه‌نامه`, one wikitable, five columns: template, parameter, English
value, Persian value, source. Anyone can edit it. The bot reads only the revision in
`src/tasks/task-20/data/pin.json`, and moving that pin is a commit I make after reviewing the
diff. `T20_PIN` overrides it for a dry run. The table is refused as a whole if it does not
parse cleanly: two Persian values for one key, a missing cell, a Persian value still in Latin.

Rows come from translations fa editors already made: `attested.py` pairs every fa infobox
value with the same parameter in the en article's infobox through the sitelink, over both
dumps, and counts the agreement. Agreement is evidence, not proof — the first review rejected
16 of 135 strong candidates as wrong although attested (`seat → صندلی`, `entity → ماهیت`).
Every row is read by me before it goes on the page. No language model is involved.

## What it does not touch

- `{{جعبه اطلاعات منطقه مسکونی}}` labels (`subdivision_type#`, `leader_title#`, postal and
  area code types, demographics). The template shows them in Persian at render time through
  `پودمان:ترجمه مقدار جعبه` (since ۲۲ نوامبر ۲۰۲۶), so an article edit would change nothing a
  reader sees.
- English link targets: task 12.
- Parameter names: tasks 4, 7, 8. Empty or unknown parameters: task 5.
- Names of people, places and clubs.
- Any value with a template, link, line break or comment inside.
- Control keys the template reads (`unit_pref`, `pushpin_*`, colours, `status`).
- Navbox labels that are a surname, symbol, code, model name, qualifier or a different thing
  from the article (`Corbyn`, `Fe`, `http` for «HTTP», `Diode` on «لامپ خلأ»).

## Safety

- `transform` is pure; everything is read in `getTargets`.
- `verify` renders the old and new text the same way (`text=`), and refuses the edit if a new
  Persian value is not visible on the page, or if the page gained a red link.
- The publish gate runs on the diff.
- `core.ts` does the rest: identity assertion, `maxlag`, stop page, `{{nobots}}`, edit-conflict
  protection, post-save check with self-revert.

## Measurements (dump of ۱ نوامبر ۲۰۲۶)

- Census: 578,075 of 1,100,588 articles show a Latin-letter infobox value; 10,952 of 20,981
  navboxes show English. Those numbers describe the problem; this task reaches a small, safe
  part of it.
- Dictionary v1 (12 rows) reaches 1,952 articles.
- Navbox labels: 7 of the 1,240 English labels on Persian links in 100 navboxes pass the rule.
- Dry run, ۲۲ نوامبر ۲۰۲۶, 212 pages: 132 to edit (129 values, 7 labels), 0 refused by
  `verify`. Every changed line was read.

## Running it

```sh
python3 src/tasks/task-20/test_census.py && python3 src/tasks/task-20/test_attested.py
npx tsx src/tasks/task-20/values.test.ts
TARGET_FILE=/tmp/titles.json npx tsx src/run.ts infobox-values --limit 50          # dry run
```

The census, navbox census and attestation run on Toolforge as one-off jobs
(`toolforge/task-20-infobox-values/jobs.yaml`).
