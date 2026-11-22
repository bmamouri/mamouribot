#!/bin/bash
# وظیفهٔ ۲۰ navbox census: English in navbox/sidebar templates. Read-only.
# Output: ~/task-20-infobox-values/census/<dump date>/nav-*
set -euo pipefail
cd "$(dirname "$0")"
DUMPS=/public/dumps/public/fawiki
DATE=${DUMP_DATE:-$(ls "$DUMPS" | grep -E '^[0-9]{8}$' | sort | while read d; do
  ls "$DUMPS/$d"/*-pages-articles-multistream-index.txt.bz2 >/dev/null 2>&1 && echo "$d"; done | tail -1)}
OUT="census/$DATE"
mkdir -p "$OUT"
python3 navbox_census.py scan --dump "$DUMPS/$DATE" --out "$OUT" --workers "${WORKERS:-3}" "$@"
python3 navbox_census.py aggregate --out "$OUT"
