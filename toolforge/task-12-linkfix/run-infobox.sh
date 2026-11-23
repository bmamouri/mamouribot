#!/bin/bash
# وظیفهٔ ۱۲ over a ranked list instead of a random search sample: articles whose infobox has
# an English link to a subject that has an fa article (direct Wikidata sitelink), most links
# first. Built by task-20's link_targets.py from the dump census (~95,000 articles, 158,000
# links on the ۱ نوامبر ۲۰۲۶ dump). Same task, same approved scope, same checks as lf-daily;
# only the selector differs. Pages already seen by task 12 are skipped before the cap.
set -euo pipefail
cd "$(dirname "$0")"
export TARGET_FILE="${TARGET_FILE:-$HOME/task-20-infobox-values/census/20261101/lf-infobox-targets.txt}"
export TARGET_FILE_SKIP_SEEN=1
export TARGET_SEARCH=" "
: "${TARGET_CAP:=1000}"
export TARGET_CAP
exec ./run.sh "$@"
