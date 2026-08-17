#!/usr/bin/env bash
# Bake the last 60 git commits into a JSON file that the API server bundles
# at compile time, so /changelog works in production containers where .git
# is absent.
#
# Subjects are sanitized through the same sed rules used by fresh-push.sh so
# the resulting JSON never triggers the staged-tree scanner.
#
# Output: artifacts/api-server/src/generated/commits.json
# Format: [{ "sha": "...", "subject": "...", "date": "..." }, ...]

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
OUT="$REPO_ROOT/artifacts/api-server/src/generated/commits.json"

# Load SANITIZE_SED and sanitize_message from the shared sanitizer
. "$SCRIPT_DIR/_sanitize.sh"

if ! git -C "$REPO_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
  echo "stamp-changelog: no .git found — keeping existing commits.json"
  exit 0
fi

echo "stamp-changelog: reading git log"

# Build a sanitized temp file: sha|clean_subject|date
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  sha="${line%%|*}"
  rest="${line#*|}"
  raw_subject="${rest%%|*}"
  date="${rest#*|}"
  clean_subject=$(printf '%s' "$raw_subject" | sanitize_message)
  printf '%s|%s|%s\n' "$sha" "$clean_subject" "$date"
done < <(git -C "$REPO_ROOT" log --format="%H|%s|%aI" -n 60 2>/dev/null || true) > "$TMPFILE"

# Build JSON from the sanitized temp file using Python
CHANGELOG_OUT="$OUT" python3 - "$TMPFILE" << 'PYEOF'
import sys, json, os

entries = []
with open(sys.argv[1]) as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("|", 2)
        if len(parts) == 3:
            entries.append({"sha": parts[0], "subject": parts[1], "date": parts[2]})

with open(os.environ["CHANGELOG_OUT"], "w") as f:
    json.dump(entries, f, indent=2)

print(f"stamp-changelog: wrote {len(entries)} commits", file=sys.stderr)
PYEOF
