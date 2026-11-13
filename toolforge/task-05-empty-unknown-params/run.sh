#!/bin/bash
# Toolforge tool: mamouribot   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۵ — حذف پارامترهای خالی و ناشناختهٔ یادکرد.
# Approved by Huji, ۱۵ سپتامبر ۲۰۲۶ ({{مجوز دارد}}). Ported from the original Python
# script to this framework (TODO.md §8), so this runs as MamouriBot — do NOT add --as-me
# here, which would post the whole run under the operator's own account.
#
# `node ../mamouribot.mjs` resolves against THIS directory, i.e. the tool home — the
# bundle is shared by every task and is not copied in here. See
# lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md: a fix verified in
# the wrong copy of the bundle looks deployed and changes nothing.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
mkdir -p "$BOT_STATE_DIR" logs

# Namespaces the category is read across: article, project, template, draft. Matches the
# scope the original Python job ran at (`--ns=0,4,10,118`).
export TARGET_NAMESPACE="${TARGET_NAMESPACE:-0|4|10|118}"

# Credentials: either a chmod-600 .env beside this script or `toolforge envvars`.
if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs empty-unknown-params "$@"
