#!/bin/bash
# Toolforge tool: mamouribot   (the only tool; see docs/TOOLFORGE.md)
# وظیفهٔ ۱۲ — فارسی‌سازی پیوندهای انگلیسی‌ماندهٔ مقاله‌ها.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
mkdir -p "$BOT_STATE_DIR" logs

# The candidate selector lives HERE, not in the job's --command.
#
# A Toolforge job command crosses two shells on its way to node, and the task's own notes
# record what that costs: Persian titles passed as arguments get mangled, and a 30-page
# run became 41 pages during testing. Setting them in the script keeps the bytes intact
# and keeps the scope reviewable in git rather than in somebody's shell history.
#
# Pages: a random sample of articles and templates that carry English links or interwiki
# templates, a different sample each run. The extension (red links whose Persian article has
# another name, {{بت}}, {{پیوند با میان‌ویکی}}, templates) is on.
if [ -z "${TARGET_SEARCH:-}" ]; then
  TARGET_SEARCH='hastemplate:"پیوند با میان‌ویکی"||hastemplate:"بت"||insource:"[[A" hastemplate:"چپ‌چین"||insource:"[[A" hastemplate:"Navbox"'
fi
: "${TARGET_CAP:=1500}"
: "${TARGET_NAMESPACE:=0|10}"
: "${LINKFIX_EXTENSION:=1}"
export TARGET_SEARCH TARGET_CAP TARGET_NAMESPACE LINKFIX_EXTENSION

# The worklist of targets the bot refuses to name itself. Disk, not on-wiki: the loop is
# "bot reports what it cannot name, human adds the name, bot runs again".
export LINKFIX_REPORT="${LINKFIX_REPORT:-$BOT_STATE_DIR/linkfix-review.json}"

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs linkfix "$@"
