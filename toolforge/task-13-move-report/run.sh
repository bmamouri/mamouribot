#!/bin/bash
# Toolforge tool: (no tool yet — وظیفهٔ ۱۳ is not filed)   (see docs/TOOLFORGE.md for the full task/tool table)
# Entry point for وظیفهٔ ۱۳ — the «مقاله‌های نیازمند تغییرنام» database report.
set -euo pipefail
cd "$(dirname "$0")"

# The title list and the report are rebuilt from scratch each run, so there is no
# resume state to keep; BOT_STATE_DIR only holds the cached title enumeration.
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

# The title enumeration reads the replica directly; ~/replica.my.cnf is provisioned
# with the tool and is what selects the `direct` backend.
if [ ! -f "$HOME/replica.my.cnf" ]; then
  echo "no $HOME/replica.my.cnf — the replica backend cannot start" >&2
  exit 1
fi

exec node ../move-report.mjs "$@"
