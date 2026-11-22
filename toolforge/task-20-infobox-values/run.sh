#!/bin/bash
# وظیفهٔ ۲۰ — English values in infoboxes and navboxes. Not approved yet: dry runs only.
#
# Targets: one file of titles per run, built by targets.py from the newest census.
# The dictionary is read at the revision in data/pin.json (bundled); T20_PIN overrides it
# for a dry run only.
set -euo pipefail
cd "$(dirname "$0")"
export BOT_STATE_DIR="$HOME/state"
export BOT_GATES_PY="$HOME/gates.py"
export TARGET_FILE="${TARGET_FILE:-$PWD/targets.json}"
export T20_REQUIRE_DICT=1
exec node ../mamouribot.mjs infobox-values "$@"
