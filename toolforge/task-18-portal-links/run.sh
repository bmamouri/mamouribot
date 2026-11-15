#!/bin/bash
# Toolforge tool: mamouribot   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۱۸ — افزودن پیوند درگاه به مقاله‌های وابسته.
#
# Approved by Huji, ۱۴ نوامبر ۲۰۲۶ ({{مجوز دارد}}), so this runs as MamouriBot — do NOT
# add --as-me here, which would post the whole campaign under the operator's own account.
# The pre-approval trial (100 edits, --as-me) is recorded on the request page; see
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
