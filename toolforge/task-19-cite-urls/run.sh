#!/bin/bash
# Toolforge tool: mamouribot   (the only tool; see docs/TOOLFORGE.md)
# وظیفهٔ ۱۹ — تکمیل یادکردهای نشانی عریان و اصلاح نشانی منبع‌ها.
#
# NOT APPROVED YET. Until the request page carries {{مجوز دارد}}, only the dry-run and
# `--check` jobs below may be created. A trial runs from a developer machine with
# `--as-me`, never from here.
#
# `node ../mamouribot.mjs` resolves against THIS directory, i.e. the tool home: the bundle
# is shared by every task and is not copied in here. See
# lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
# Metadata lookups per run. Each is up to four requests to Citoid, the site and Wayback,
# all serialised behind their own gaps (src/tasks/task-19/resolve.ts).
export T19_MAX_LOOKUPS="${T19_MAX_LOOKUPS:-600}"
mkdir -p "$BOT_STATE_DIR" logs

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs cite-urls "$@"
