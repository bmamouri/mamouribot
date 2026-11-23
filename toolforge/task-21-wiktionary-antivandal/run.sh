#!/bin/bash
# Toolforge tool: mamouribot.  وظیفهٔ ۲۱: fa.wiktionary anti-vandalism patrol
# (docs/task-21-wiktionary-antivandal.md).
#
#   run.sh patrol            dry: reads, scores, logs decisions, never writes
#   run.sh backtest          measure against the gold set (reads only)
#   run.sh patrol --live     refused until WIKT_PATROL_APPROVED=1 (set only after approval)
set -euo pipefail
cd "$(dirname "$0")"
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

# Toolforge job commands do not run through a shell, so VAR=value in the command line
# does not set anything. Take them from the arguments instead.
while [[ "${1:-}" == *=* ]]; do export "$1"; shift; done

case "${1:-patrol}" in
  backtest)
    shift
    exec node ../wikt-patrol.mjs backtest "$HOME/wikt-research/gold.jsonl" --out "$HOME/wikt-research" "$@" ;;
  patrol)
    shift
    exec node ../wikt-patrol.mjs patrol "$@" ;;
  *)
    exec node ../wikt-patrol.mjs "$@" ;;
esac
