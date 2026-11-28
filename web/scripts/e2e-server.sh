#!/usr/bin/env bash
# Serves the static export through the real XRDB binary for the e2e suite.
# Builds the export when missing, then the binary, which embeds it. Runs offline
# on a throwaway data dir with no provider keys.
set -euo pipefail

web="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(dirname "$web")"
port="${XRDB_E2E_PORT:-3002}"

if [ ! -f "$repo/internal/ui/dist/index.html" ]; then
  echo "No export in internal/ui/dist, building it first" >&2
  (cd "$web" && npm run build >&2)
fi

data="$(mktemp -d "${TMPDIR:-/tmp}/xrdb-e2e.XXXXXX")"
pid=""
cleanup() {
  set +e
  [ -n "$pid" ] && kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null
  rm -rf "$data"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# go:embed reads dist at compile time, so this has to run after the export build.
(cd "$repo" && go build -o "$data/xrdb-api" ./cmd/api)

# env -i keeps the caller's provider keys out. The dead proxy fails any outbound
# call fast; the specs mock what they need with page.route.
env -i PATH="$PATH" HOME="$data" TMPDIR="$data" \
  XRDB_ADDR="127.0.0.1:$port" \
  XRDB_DB="$data/xrdb.db" \
  XRDB_CACHE_DIR="$data/cache" \
  XRDB_ADMIN_KEY="${XRDB_E2E_ADMIN_KEY:?set by playwright.config.ts}" \
  XRDB_LOG_LEVEL="${XRDB_E2E_LOG_LEVEL:-warn}" \
  XRDB_STREAM_ADDON_URL=off \
  HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost \
  "$data/xrdb-api" &
pid=$!
wait "$pid"
