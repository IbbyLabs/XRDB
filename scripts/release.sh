#!/usr/bin/env bash
# Cut a release: check, tag, push. The tag is the release — pushing it triggers
# the Docker build, which chains into the GitHub release and the :latest
# promotion.
#
# There is no version to bump in a file. The binary takes its version from the
# tag at build time, so the tag is the single source of truth.
#
#   scripts/release.sh patch     v3.0.0 -> v3.0.1
#   scripts/release.sh minor     v3.0.0 -> v3.1.0
#   scripts/release.sh major     v3.0.0 -> v4.0.0
#   scripts/release.sh v3.2.0    an explicit version
#
#   DRY_RUN=1   report what would happen and stop
#   SKIP_CHECKS=1  skip tests and lint (they run in CI regardless)

set -euo pipefail

cd "$(dirname "$0")/.."

LEVEL="${1:-}"
RELEASE_BRANCH="${RELEASE_BRANCH:-main}"

die() { printf 'release: %s\n' "$1" >&2; exit 1; }
note() { printf '  %s\n' "$1"; }

[ -n "$LEVEL" ] || die "usage: scripts/release.sh <patch|minor|major|vX.Y.Z>"

# ── Preflight ────────────────────────────────────────────────────────────────
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "$RELEASE_BRANCH" ] || die "on branch '$branch', expected '$RELEASE_BRANCH'"

[ -z "$(git status --porcelain)" ] || die "working tree is not clean; commit or stash first"

# Not fatal: this repo carries a moving tag that git reports as rejected, which
# would otherwise abort the release for a reason that has nothing to do with it.
# The checks below still work against local state.
if ! git fetch --quiet --tags origin 2>/dev/null; then
  note "fetch:   could not refresh from origin; comparing against local state"
fi
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "origin/$RELEASE_BRANCH" 2>/dev/null || echo "$local_head")"
[ "$local_head" = "$remote_head" ] || die "local $RELEASE_BRANCH differs from origin; push or pull first"

# ── Work out the version ─────────────────────────────────────────────────────
latest="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | tail -n 1)"
[ -n "$latest" ] || latest="v0.0.0"

if printf '%s' "$LEVEL" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  next="$LEVEL"
else
  IFS=. read -r major minor patch <<<"${latest#v}"
  case "$LEVEL" in
    major) next="v$((major + 1)).0.0" ;;
    minor) next="v${major}.$((minor + 1)).0" ;;
    patch) next="v${major}.${minor}.$((patch + 1))" ;;
    *) die "unknown level '$LEVEL'; use patch, minor, major, or vX.Y.Z" ;;
  esac
fi

git rev-parse -q --verify "refs/tags/$next" >/dev/null && die "tag $next already exists"

# ── Changelog ────────────────────────────────────────────────────────────────
# The release notes are generated from the matching CHANGELOG entry, so a
# missing one yields an empty release.
if ! grep -q "^## \[${next}\]" CHANGELOG.md 2>/dev/null; then
  die "CHANGELOG.md has no '## [${next}]' entry; add one before releasing"
fi

echo "Release $latest -> $next"
note "branch:  $branch @ $(git rev-parse --short=8 HEAD)"

# ── Checks ───────────────────────────────────────────────────────────────────
if [ -n "${SKIP_CHECKS:-}" ]; then
  note "checks:  skipped"
else
  note "checks:  building"
  go build ./... >/dev/null
  note "checks:  testing"
  go test ./... >/dev/null
  if command -v golangci-lint >/dev/null 2>&1; then
    note "checks:  linting"
    golangci-lint run >/dev/null
  else
    note "checks:  golangci-lint not installed, skipped (CI runs it)"
  fi
  note "checks:  passed"
fi

if [ -n "${DRY_RUN:-}" ]; then
  echo "Dry run: would tag $next and push it."
  exit 0
fi

# ── Cut it ───────────────────────────────────────────────────────────────────
# Whichever tag sorts highest takes :latest, so a release below the current
# highest is worth pausing on.
highest="$( { printf '%s\n' "$next"; git tag --list 'v[0-9]*.[0-9]*.[0-9]*'; } | sort -V | tail -n 1 )"
if [ "$highest" = "$next" ]; then
  note "latest:  $next will take the :latest Docker tag"
else
  note "latest:  $highest keeps :latest; $next will not take it"
fi

git tag -a "$next" -m "$next"
git push origin "$next"

echo "Pushed $next. The Docker build runs now, then the GitHub release, then the :latest promotion."
