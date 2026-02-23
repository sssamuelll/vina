#!/usr/bin/env bash
# Convert all .sm2d files from Seamly2D source tree to JSON
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"

SEAMLY_DIR="${1:-/tmp/seamly2d}"

find "$SEAMLY_DIR" -name "*.sm2d" -type f | sort | while read -r f; do
  npx tsx "$SCRIPT_DIR/converter.ts" "$f" "$OUTPUT_DIR" || echo "  ✗ Failed: $f"
done

echo ""
echo "Done. Output in $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/*.json 2>/dev/null | wc -l | xargs -I{} echo "{} files converted"
