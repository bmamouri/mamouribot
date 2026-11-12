#!/bin/bash
# Toolforge tool: mamouribot   (the only tool; see docs/TOOLFORGE.md)
# وظیفهٔ ۹ — نام فارسی در link= الگوهای Taxonomy.
set -euo pipefail
cd "$(dirname "$0")"

export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
export BOT_GATES_PY="${BOT_GATES_PY:-$HOME/gates.py}"
mkdir -p "$BOT_STATE_DIR" logs

if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs taxonomy-link-localize "$@"
