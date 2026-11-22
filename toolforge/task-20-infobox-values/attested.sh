#!/bin/bash
# وظیفهٔ ۲۰: dictionary candidates from fa/en infobox pairs. Read-only.
# Needs the census of the same fa dump. Output: census/<date>/attested/candidates.tsv
set -euo pipefail
cd "$(dirname "$0")"
DATE=${DUMP_DATE:?set DUMP_DATE, e.g. 20261101}
OUT="census/$DATE/attested"
mkdir -p "$OUT"
python3 attested.py fa --fa-dump /public/dumps/public/fawiki/$DATE --census "census/$DATE" --out "$OUT" --workers 3
python3 attested.py en --en-dump /public/dumps/public/enwiki/$DATE --out "$OUT" --workers 3
python3 attested.py join --census "census/$DATE" --out "$OUT"
