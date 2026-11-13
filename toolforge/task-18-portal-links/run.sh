#!/bin/bash
# Toolforge tool: mamouribot   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۱۸ — افزودن پیوند درگاه به مقاله‌های وابسته.
#
# ⚠️ NOT APPROVED YET. Do not add a scheduled job from jobs.yaml here, and do not
# drop --as-me from a manual run, until a BRFA for this task is granted. See
# docs/task-18-portal-links.md.
#
# `node ../mamouribot.mjs` resolves against THIS directory, i.e. the tool home: the
# bundle is shared by every task and is not copied in here.
set -euo pipefail
cd "$(dirname "$0")"

# Resume state (rotation pointer + per-portal done-stores) lives on NFS, so a killed or
# rescheduled job continues where it stopped rather than re-walking the whole rotation.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
mkdir -p "$BOT_STATE_DIR" logs

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ] && [ -z "${WIKIPEDIA_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600), WIKIPEDIA_BOT_* envvars, or WIKIPEDIA_* for --as-me" >&2
  exit 1
fi

exec node ../mamouribot.mjs portal-links "$@"
