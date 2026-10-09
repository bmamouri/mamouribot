#!/bin/bash
# Toolforge tool: mamouribot   (the one tool; see docs/TOOLFORGE.md)
# Entry point for وظیفهٔ ۳ — citation parameter normalization.
set -euo pipefail
cd "$(dirname "$0")"

# Resume checkpoint on NFS, so a killed or rescheduled job continues instead of
# restarting, and never re-edits a page it already did.
export BOT_STATE_DIR="${BOT_STATE_DIR:-$HOME/state}"
mkdir -p "$BOT_STATE_DIR" logs

# The publish gate is a Python file and cannot be bundled, so it ships beside the
# bundle. Point at it explicitly rather than relying on a search order in a job.
export BOT_GATES_PY="$PWD/../gates.py"

# Credentials come from `toolforge envvars`, never from a file in this directory.
#
# Only demanded for a run that actually authenticates. A dry run reads and logs in
# nowhere, so requiring them unconditionally would make the read-only smoke test
# impossible on a freshly created tool, which is precisely when you want to run it.
case " $* " in
  *" --live "*|*" --check "*)
    if [ -z "${WIKIPEDIA_BOT_USERNAME:-}" ] || [ -z "${WIKIPEDIA_BOT_PASSWORD:-}" ]; then
      echo "no credentials: set WIKIPEDIA_BOT_USERNAME / WIKIPEDIA_BOT_PASSWORD with" >&2
      echo "  toolforge envvars create WIKIPEDIA_BOT_USERNAME" >&2
      exit 1
    fi ;;
esac

# The frozen target list, and why this task uses one instead of enumerating each run.
#
# `getTargets` walks the duplicate-parameter category (45,173 members) BEFORE the
# legacy-alias searches, and for the approved scope that category is drained — an early
# capped run processed 25 pages for 0 edits. A scheduled run with a cap would therefore
# spend its whole budget on pages with nothing to do and the task would look finished
# while 250,000 articles still needed it.
#
# So the targets are harvested once from the searches the scope actually covers
# (archiveurl, archive-url, archivedate, archive-date, نشانی بایگانی, dead-url, deadurl,
# ref=harv) and frozen to a file; the resume checkpoint in $BOT_STATE_DIR skips the ones
# already done. CirrusSearch will not paginate past ~10,000 per query, so the list is the
# union of the eight, currently 43,919 titles. Regenerate it with
# `scripts/archive/task3-harvest-targets.py` in the companion repo when it runs dry.
export TARGET_FILE="${TARGET_FILE:-$PWD/targets.txt}"

exec node ../mamouribot.mjs normalize-cite-params "$@"
