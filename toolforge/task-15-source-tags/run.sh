#!/bin/bash
# Toolforge tool: mamouribot   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۱۵ — source maintenance banners: add {{بدون منبع}} to articles
# that plainly have none, and remove it from ones that now have sources.
# Approved by Huji, ۱۲ اکتبر ۲۰۲۶ ({{مجوز دارد}}), so this runs as MamouriBot — do NOT
# add --as-me here, which would post the whole campaign under the operator's own account.
set -euo pipefail
cd "$(dirname "$0")"

# Resume checkpoint on NFS, so a killed or rescheduled job continues where it stopped and
# never re-examines a page it already decided. This task does NOT set recheckAfterDays,
# so a page is decided once; see .claude/rules/bot.md on why expiry is per-task.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

# The publish gate is a Python file that cannot be bundled, so it ships beside the
# bundle. Pointing at it explicitly beats relying on a search order inside a job.
export BOT_GATES_PY="$PWD/../gates.py"

# Credentials: either a chmod-600 .env beside this script or `toolforge envvars`.
if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs source-tags "$@"
