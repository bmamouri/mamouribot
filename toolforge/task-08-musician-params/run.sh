#!/bin/bash
# Toolforge tool: fawiki-musician-infobox-params   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for every MamouriBot job on Toolforge.
set -euo pipefail
cd "$(dirname "$0")"

# Resume checkpoint + frozen target list live on NFS, so a killed/rescheduled job
# continues instead of restarting, and never re-edits a page it already did.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

# Credentials: either a chmod-600 .env beside this script (the convention in
# docs/TOOLFORGE.md, which the bundle loads itself) or `toolforge envvars`.
# Accept both; fail loudly only if neither is present.
if [ ! -f .env ] && [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ]; then
  echo "no credentials: expected ./.env (chmod 600) or WIKIPEDIA_BOT_* envvars" >&2
  exit 1
fi

exec node ../mamouribot.mjs musician-params "$@"
