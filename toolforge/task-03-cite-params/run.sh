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
# `getTargets` walks the duplicate-parameter category before the legacy-alias searches,
# and the in-run cap is `--limit * 20`, so a scheduled capped run re-enumerates the SAME
# leading window every time and goes idle once that window is done, with tens of thousands
# of pages left. The category is NOT drained: ~92% of its 45,126 members are actionable
# under the approved scope.
#
# So the targets are harvested once and frozen to a file — the 45,126 members of
# «رده:صفحه‌های دارای ارجاع با متغیر تکراری», plus the union of the eight searches the
# scope covers (archiveurl, archive-url, archivedate, archive-date, نشانی بایگانی,
# dead-url, deadurl, ref=harv). The resume checkpoint in $BOT_STATE_DIR skips the ones
# already done. CirrusSearch hard-errors past offset 10,000
# (`cirrussearch-offset-too-large`), so each search contributes one 10,000 window; the
# list is currently 80,450 titles. Regenerate it with
# `scripts/archive/task3-harvest-targets.py` in the companion repo when it runs dry.
#
# The list is SHUFFLED, with a fixed seed. Not cosmetic: `list=categorymembers` returns a
# stable order whose leading window is almost all already-clean pages — measured, the
# first 100 category members yield 4 edits while a random 100 yield 100. A capped run that
# walks the list from the start therefore reports "nothing to do" and looks finished. That
# is what the original «live1 processed 25 pages for 0 edits» actually was, and it is why
# this handover once claimed the category was drained. Shuffled, every run's slice is
# representative and the edit rate matches the population.
export TARGET_FILE="${TARGET_FILE:-$PWD/targets.txt}"

exec node ../mamouribot.mjs normalize-cite-params "$@"
