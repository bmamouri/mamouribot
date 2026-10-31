#!/bin/bash
# Toolforge tool: mamouribot   (the one tool; see docs/TOOLFORGE.md)
# Entry point for وظیفهٔ ۱۱ — create the الگو:Taxonomy/* pages that put articles into
# «رده:صفحه‌های دارای الگوی آرایه‌شناسی گم‌شده» («Missing taxonomy template (fix)»).
#
# Runs HOURLY. The target list is the live category, re-read every run, so a page that
# lands in it is handled within the hour. A chain of k missing ancestors drains in k runs,
# because each run creates the lowest level whose parent already exists.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs
export BOT_GATES_PY="$PWD/../gates.py"

case " $* " in
  *" --live "*|*" --check "*)
    if [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ] || [ -z "${WIKIPEDIA_BOT_PASSWORD:-}" ]; then
      echo "no credentials: set WIKIPEDIA_BOT_USERNAME / WIKIPEDIA_BOT_PASSWORD with" >&2
      echo "  toolforge envvars create WIKIPEDIA_BOT_USERNAME" >&2
      exit 1
    fi ;;
esac

exec node ../mamouribot.mjs taxonomy-create-missing "$@"
