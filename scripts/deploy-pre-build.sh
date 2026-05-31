#!/usr/bin/env bash
# Pre-build hook for production deploys.
#
# What it does:
#   1. If NODE_ENV=production AND .github-sha doesn't exist yet, runs
#      fresh-push.sh to push the current workspace snapshot to GitHub.
#      fresh-push.sh writes the resulting GitHub commit SHA to .github-sha.
#   2. Runs stamp-version.sh, which reads .github-sha (when present) and bakes
#      that SHA into lib/version/src/version.ts.
#
# Result: the compiled binary's GET /api/version reports the same SHA that is
# on github.com/bitPOS-app/bitpos — honest, verifiable proof of what code is
# running, not a fetched label.
#
# Idempotency:
#   If .github-sha already exists (e.g. because another artifact's prebuild
#   already ran this script), fresh-push.sh is skipped — we don't push twice.
#
# Dev builds:
#   NODE_ENV is not "production" in dev, so fresh-push.sh is never invoked
#   during `pnpm dev`.  stamp-version.sh still runs and stamps the local HEAD.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
GITHUB_SHA_FILE="$REPO_ROOT/.github-sha"

if [ "${NODE_ENV:-}" = "production" ]; then
  if [ -f "$GITHUB_SHA_FILE" ]; then
    echo "deploy-pre-build: .github-sha exists ($(cat "$GITHUB_SHA_FILE" | cut -c1-7)…), skipping fresh-push"
  else
    echo "deploy-pre-build: NODE_ENV=production — running fresh-push to get matching GitHub SHA"
    CI=true bash "$SCRIPT_DIR/fresh-push.sh"
    echo "deploy-pre-build: fresh-push complete, SHA=$(cat "$GITHUB_SHA_FILE" | cut -c1-7)…"
  fi
else
  echo "deploy-pre-build: NODE_ENV=${NODE_ENV:-unset} — skipping fresh-push (dev build)"
fi

bash "$SCRIPT_DIR/stamp-version.sh"
bash "$SCRIPT_DIR/stamp-changelog.sh"
