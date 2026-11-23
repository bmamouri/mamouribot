#!/bin/bash
# Toolforge tool: mamouribot   (the only tool; see docs/TOOLFORGE.md)
# وظیفهٔ ۱۹ — تکمیل یادکردهای نشانی عریان و اصلاح نشانی منبع‌ها.
#
# Approved by Huji, ۲۲ نوامبر ۲۰۲۶ ({{مجوز دارد}}), after a 149-edit trial under my own
# account. Runs as MamouriBot — do NOT add --as-me here.
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
# Lookups stop as soon as there are --limit pages to edit (cite-urls.ts); the cap is only a
# ceiling. Candidate pages read per run scale with --limit unless TARGET_CAP is set.
mkdir -p "$BOT_STATE_DIR" logs

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs cite-urls "$@"
