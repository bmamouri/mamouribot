#!/bin/bash
# Toolforge tool: mamouribot   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۱ — remove the imported {{Use dmy dates}}, which renders nothing
# on fa.wiki and only files the article into رده:صفحه‌های حاوی الگوی غیر بومی.
# Approved by Huji, ۱۲ اکتبر ۲۰۲۶ ({{مجوز دارد}}), so this runs as MamouriBot — do NOT
# add --as-me here, which would post the whole campaign under the operator's own account.
set -euo pipefail
cd "$(dirname "$0")"

# `node ../mamouribot.mjs` resolves against THIS directory, i.e. the tool home — the
# bundle is shared by every task and is not copied in here. See
# lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md: a fix verified in
# the wrong copy of the bundle looks deployed and changes nothing.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

# The publish gate is Python and cannot be bundled, so it ships beside the bundle.
export BOT_GATES_PY="$PWD/../gates.py"

# Credentials: either a chmod-600 .env beside this script or `toolforge envvars`.
if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs remove-use-dmy-dates "$@"
