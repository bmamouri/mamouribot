#!/bin/bash
# Toolforge tool: mamouribot   (the only tool; see docs/TOOLFORGE.md)
# وظیفهٔ ۱۶ — حذف نشانهٔ #:~:text= از نشانی منبع.
# Approved by Huji, ۱۲ اکتبر ۲۰۲۶ ({{مجوز دارد}}), so this runs as MamouriBot — do NOT
# add --as-me here, which would post the whole campaign under the operator's own account.
#
# `node ../mamouribot.mjs` resolves against THIS directory, i.e. the tool home: the bundle
# is shared by every task and is not copied in here. See
# lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
mkdir -p "$BOT_STATE_DIR" logs

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs strip-text-fragment "$@"
