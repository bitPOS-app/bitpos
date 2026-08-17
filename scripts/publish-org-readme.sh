#!/usr/bin/env bash
# Publishes the bitPOS-app GitHub organization profile README.
#
# Pushes the contents of org-readme/ to github.com/bitPOS-app/.github,
# which GitHub renders at https://github.com/bitPOS-app as the org profile.
#
# Idempotent: creates the remote repo via the GitHub API if missing,
# otherwise force-pushes the local staging tree as the new main branch.
#
# Requires: $GITHUB_WORKFLOW_TOKEN with `repo` and `admin:org` (write) scope.

set -euo pipefail

ORG="bitPOS-app"
REPO=".github"
STAGING="$(git rev-parse --show-toplevel)/org-readme"
TOKEN="${GITHUB_WORKFLOW_TOKEN:-}"

[ -z "$TOKEN" ] && { echo "ERROR: GITHUB_WORKFLOW_TOKEN is not set"; exit 1; }
[ -d "$STAGING/profile" ] || { echo "ERROR: $STAGING/profile not found"; exit 1; }
[ -f "$STAGING/profile/README.md" ] || { echo "ERROR: profile/README.md missing"; exit 1; }
[ -f "$STAGING/.github/workflows/refresh-verify.yml" ] || { echo "ERROR: workflow file missing"; exit 1; }

API="https://api.github.com"
HDR=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

echo "── 1/5 ensure repo exists ──────────────────────────────────────────────"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${HDR[@]}" "$API/repos/$ORG/$REPO")
if [ "$HTTP" = "404" ]; then
  echo "    creating $ORG/$REPO ..."
  CREATE=$(curl -s -X POST "${HDR[@]}" "$API/orgs/$ORG/repos" \
    -d '{"name":".github","description":"bitPOS organization profile - verify, don'\''t trust","private":false,"has_issues":true,"has_projects":false,"has_wiki":false,"auto_init":false}')
  if ! echo "$CREATE" | grep -q '"full_name"'; then
    echo "ERROR: failed to create repo. response:"
    echo "$CREATE" | head -20
    exit 1
  fi
  echo "    created."
elif [ "$HTTP" = "200" ]; then
  echo "    $ORG/$REPO already exists."
else
  echo "ERROR: unexpected HTTP $HTTP probing $ORG/$REPO"
  exit 1
fi

echo "── 2/5 prepare local staging git repo ─────────────────────────────────"
cd "$STAGING"
rm -rf .git
git init -q -b main
git add -A
echo "    staged $(git status --short | wc -l) files"

echo "── 3/5 commit ──────────────────────────────────────────────────────────"
SHORT_LIVE=$(cd .. && git rev-parse --short HEAD)
git -c user.email="bitpos-verify-bot@users.noreply.github.com" \
    -c user.name="bitpos-verify-bot" \
    commit -q -m "chore: bitPOS-app org profile - verify, don't trust" \
              -m "Initial profile with self-updating 'currently in production' block. Workflow at .github/workflows/refresh-verify.yml refreshes hourly from bitPOS-app/bitpos@main (seed sha=${SHORT_LIVE})."
echo "    HEAD = $(git rev-parse HEAD)"

echo "── 4/5 push to $ORG/$REPO:main (force) ─────────────────────────────────"
git push --force "https://x-access-token:${TOKEN}@github.com/$ORG/$REPO.git" main

echo "── 5/5 verify via GitHub API ───────────────────────────────────────────"
sleep 2
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(curl -s "${HDR[@]}" "$API/repos/$ORG/$REPO/branches/main" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit',{}).get('sha','?'))")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "    ✓ remote main SHA matches local HEAD: $LOCAL_SHA"
else
  echo "    ✗ MISMATCH local=$LOCAL_SHA remote=$REMOTE_SHA"
  exit 1
fi

# Trigger the workflow immediately so the verify block gets its first refresh
echo ""
echo "── triggering first verify refresh ─────────────────────────────────────"
sleep 3   # let GitHub register the workflow file
DISPATCH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${HDR[@]}" \
  "$API/repos/$ORG/$REPO/actions/workflows/refresh-verify.yml/dispatches" \
  -d '{"ref":"main"}')
if [ "$DISPATCH" = "204" ]; then
  echo "    ✓ workflow_dispatch fired (refresh-verify.yml)"
else
  echo "    ⚠ workflow_dispatch returned HTTP $DISPATCH - may need a moment to register; you can trigger manually from the Actions tab"
fi

echo ""
echo "  Org profile: https://github.com/$ORG"
echo "  Repo:        https://github.com/$ORG/$REPO"
echo "  Workflow:    https://github.com/$ORG/$REPO/actions/workflows/refresh-verify.yml"
echo ""
echo "  Visit https://github.com/$ORG in ~60s to see the rendered profile with the live verify block."

cd - > /dev/null
