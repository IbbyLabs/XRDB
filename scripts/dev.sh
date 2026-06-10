#!/bin/sh
# Start the full local dev stack: Go API on :8787 + Next.js web on :3001.
# Provider keys are read from .env in the repo root (gitignored).
# Ctrl-C stops both.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT="${XRDB_API_PORT:-8787}"
WEB_PORT="${XRDB_WEB_PORT:-3001}"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
else
  echo "warning: no .env found — preview will render placeholder artwork (no provider keys)" >&2
fi

# Free the ports if a previous run is lingering.
for port in "$API_PORT" "$WEB_PORT"; do
  pid="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pid" ] && kill $pid 2>/dev/null && sleep 1 || true
done

cleanup() {
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

XRDB_ADDR=":$API_PORT" go run ./cmd/api &
API_PID=$!

cd web
NEXT_PUBLIC_API_BASE_URL="http://localhost:$API_PORT" npm run dev -- -p "$WEB_PORT" &
WEB_PID=$!
cd "$ROOT"

echo ""
echo "  XRDB dev stack"
echo "  api: http://localhost:$API_PORT"
echo "  web: http://localhost:$WEB_PORT"
echo ""

wait
