#!/bin/bash
# Toolforge tool: mamouribot   (the one tool; see docs/TOOLFORGE.md)
# Rebuilds the وظیفهٔ ۳ manual-review page. Reads articles, never edits one.
#
# The only page it can write is
# «ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی», and only with --live.
set -euo pipefail
cd "$(dirname "$0")"

# Must be the same state dir the run uses: the list of titles to re-read comes from
# that run's resume checkpoint, and the worklist is stored beside it.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

export BOT_GATES_PY="$PWD/../gates.py"

case " $* " in
  *" --live "*)
    if [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ] || [ -z "${WIKIPEDIA_BOT_PASSWORD:-}" ]; then
      echo "no credentials: set WIKIPEDIA_BOT_USERNAME / WIKIPEDIA_BOT_PASSWORD" >&2
      exit 1
    fi ;;
esac

exec node ../cite-scan-conflicts.mjs "$@"
