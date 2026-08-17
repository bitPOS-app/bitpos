#!/usr/bin/env bash
# Cut and publish a new release tag for bitPOS.
#
# Usage:
#   bash scripts/tag-release.sh v0.1.0 "first public release"
#
# What it does:
#   1. Validates the tag format (vMAJOR.MINOR.PATCH).
#   2. Aborts if the tag already exists locally or remotely.
#   3. Creates an annotated tag against the current HEAD.
#   4. Pushes the tag to origin (github.com/bitPOS-app/bitpos) via $GITHUB_WORKFLOW_TOKEN.
#   5. Re-stamps lib/version/src/version.ts so the new tag shows up locally.
#
# After this runs, the next deploy will serve `/api/version` reporting the new tag.

set -euo pipefail

TAG="${1:-}"
MSG="${2:-Release $TAG}"
TOKEN="${GITHUB_WORKFLOW_TOKEN:-}"

[ -z "$TAG" ] && { echo "Usage: $0 <vX.Y.Z> [\"message\"]"; exit 1; }
[ -z "$TOKEN" ] && { echo "ERROR: GITHUB_WORKFLOW_TOKEN is not set"; exit 1; }

if ! echo "$TAG" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$'; then
  echo "ERROR: tag '$TAG' does not match vMAJOR.MINOR.PATCH[-prerelease]"
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "ERROR: tag '$TAG' already exists locally"
  exit 1
fi

echo "── 1/4 verify tag does not exist on remote ─────────────────────────────"
REMOTE_HAS=$(git ls-remote --tags "https://x-access-token:${TOKEN}@github.com/bitPOS-app/bitpos.git" "refs/tags/$TAG" | wc -l)
if [ "$REMOTE_HAS" -gt 0 ]; then
  echo "ERROR: tag '$TAG' already exists on origin"
  exit 1
fi
echo "    clear."

echo "── 2/4 create annotated tag at HEAD ────────────────────────────────────"
HEAD_SHA=$(git rev-parse HEAD)
git -c user.email="bitpos-release-bot@users.noreply.github.com" \
    -c user.name="bitpos-release-bot" \
    tag -a "$TAG" -m "$MSG" "$HEAD_SHA"
echo "    $TAG -> $HEAD_SHA"

echo "── 3/4 push tag to origin ──────────────────────────────────────────────"
git push "https://x-access-token:${TOKEN}@github.com/bitPOS-app/bitpos.git" "refs/tags/$TAG"

echo "── 4/4 re-stamp lib/version ────────────────────────────────────────────"
bash "$ROOT/scripts/stamp-version.sh"

echo ""
echo "  ✓ Released: https://github.com/bitPOS-app/bitpos/releases/tag/$TAG"
echo "  Commit:    https://github.com/bitPOS-app/bitpos/commit/$HEAD_SHA"
echo ""
echo "  Next step: redeploy so /api/version reports the new tag."
echo "  The org README at https://github.com/bitPOS-app will update within an hour"
echo "  (or instantly, once the notify-org workflow is set up)."
