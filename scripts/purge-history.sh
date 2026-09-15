#!/usr/bin/env bash
# One-off: strip the seed dumps and the removed image assets out of git history.
#
# This rewrites every commit and is NOT part of any routine workflow. It exists
# as a script rather than a pasted command so the exact path list is reviewable,
# and so a second clone can be brought in line with the same input.
#
# What it removes, and why each is safe:
#
#   docker/backups/latest.sql.gz    ~49 MB across 16 versions. gzip does not
#   docker/backups/f1tracker_*.gz   delta-compress, so every refresh stored a
#                                   whole new copy. Now a release asset —
#                                   scripts/seed-fetch.sh.
#   apps/web/public/headshots/      Driver photos, ~1.5 MB across 106 blobs.
#   apps/web/public/logos/          Team logos, ~0.8 MB across 52 blobs.
#                                   Both deleted from the tree in 4cb10e1 for
#                                   licensing reasons; until this runs, every
#                                   clone still carries and redistributes them.
#
# Nine commits disappear because they contained nothing else — all of them
# "update backup"/"add headshot" data commits. No commit carrying code is lost.
#
# Usage:
#   ./scripts/purge-history.sh <fresh-mirror-dir>
#
# It refuses to touch a normal working clone: run it on a fresh `git clone
# --mirror`, inspect the result, then force-push. See docs/HISTORY-PURGE.md.
set -euo pipefail

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Error: git-filter-repo is not installed." >&2
  echo "       uv tool install git-filter-repo   (or: pipx install git-filter-repo)" >&2
  exit 1
fi

if [ ! -d "$TARGET" ]; then
  echo "Error: $TARGET does not exist." >&2
  echo "       git clone --mirror git@github.com:hugoogb/f1-tracker.git $TARGET" >&2
  exit 1
fi

# A mirror has no working tree and no checked-out branch, which is what makes it
# safe to rewrite: nothing local can be silently clobbered, and every ref
# (branches, tags, refs/pull/*) is present so none is left pointing at old
# history.
if [ "$(git -C "$TARGET" rev-parse --is-bare-repository 2>/dev/null)" != "true" ]; then
  echo "Error: $TARGET is not a bare repository." >&2
  echo "       This must run on a fresh mirror, not a working clone:" >&2
  echo "       git clone --mirror git@github.com:hugoogb/f1-tracker.git $TARGET" >&2
  exit 1
fi

BEFORE=$(git -C "$TARGET" count-objects -vH | awk '/size-pack/{print $2, $3}')

# git-filter-repo deletes the origin remote on purpose, so that a rewritten
# repository cannot be pushed back by reflex. Capture the URL first so the
# command printed at the end is one that actually runs.
ORIGIN_URL=$(git -C "$TARGET" remote get-url origin 2>/dev/null || echo "<repo-url>")

git -C "$TARGET" filter-repo --force --invert-paths \
  --path docker/backups/latest.sql.gz \
  --path-glob 'docker/backups/f1tracker_*.sql.gz' \
  --path apps/web/public/headshots/ \
  --path apps/web/public/logos/

AFTER=$(git -C "$TARGET" count-objects -vH | awk '/size-pack/{print $2, $3}')

echo ""
echo "Pack size: $BEFORE -> $AFTER"
echo ""

# Prove the removal rather than assert it: anything matching here means the
# rewrite missed a path and the result must not be pushed.
LEFT=$(git -C "$TARGET" rev-list --objects --all \
  | awk '$2 ~ /(docker\/backups\/.*\.sql\.gz|public\/headshots\/|public\/logos\/)/{print $2}' | sort -u)
if [ -n "$LEFT" ]; then
  echo "FAILED: these paths are still in history:" >&2
  echo "$LEFT" >&2
  exit 1
fi
echo "Verified: no dump or removed-image blob remains in any ref."
echo ""
echo "Inspect it, then publish with:"
echo "    git -C $TARGET push --force $ORIGIN_URL 'refs/heads/*:refs/heads/*'"
echo ""
echo "The URL is spelled out because filter-repo removes the origin remote, so"
echo "a rewritten repo cannot be pushed back by reflex."
echo ""
# Deliberately not --mirror. A mirror clone of a GitHub repo carries
# refs/pull/*, which GitHub refuses to accept, so the push fails partway. Worse,
# --mirror makes the remote match this clone exactly: the 'seed' tag created by
# `gh release create` lives only on the remote, so a mirror taken before it
# existed would delete that tag — and the seed release with it. Pushing
# refs/heads/* moves every branch and leaves tags and PR refs alone.
echo "Not --mirror: that would push refs/pull/* (which GitHub rejects) and"
echo "delete any tag this clone predates, including the seed release's own."
echo ""
echo "Every existing clone must be re-cloned afterwards — old history cannot"
echo "be fast-forwarded onto the new one."
