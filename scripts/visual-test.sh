#!/bin/sh
# Visual regression test for internal/compose changes.
# Starts the Go API server locally, renders 4 known-good titles across the
# main code paths (poster, backdrop-as-poster+logo, logo letterbox, provider
# chips), saves PNGs to /tmp/xrdb-visual-test/, then opens them.
#
# Usage: ./scripts/visual-test.sh [port]
# Default port: 8788 (avoids conflicts with the full dev stack on 8787)
#
# After the images open, inspect them:
#   • backdrop-as-poster-logo: title logo MUST be overlaid on the backdrop
#   • logo-letterbox: full logo visible, not cropped (transparent padding OK)
#   • standard-poster: normal poster with rating badges
#   • providers: provider chips visible above the badge row
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${1:-8788}"
OUT="/tmp/xrdb-visual-test"
mkdir -p "$OUT"

# Load .env if present (provider API keys).
if [ -f .env ]; then
  set -a; . ./.env; set +a
else
  echo "warning: no .env — images may render as placeholders (no API keys)" >&2
fi

# Kill any lingering server on the test port.
pid="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
[ -n "$pid" ] && kill "$pid" 2>/dev/null && sleep 1 || true

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

XRDB_ADDR=":$PORT" go run ./cmd/api >/tmp/xrdb-visual-test-server.log 2>&1 &
API_PID=$!

# Wait for the server to be ready.
echo "Starting API server on :$PORT …"
i=0
while [ $i -lt 20 ]; do
  curl -sf "http://localhost:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.5
  i=$((i+1))
done
curl -sf "http://localhost:$PORT/healthz" >/dev/null 2>&1 || { echo "Server failed to start. See /tmp/xrdb-visual-test-server.log" >&2; exit 1; }
echo "Server ready."

BASE="http://localhost:$PORT"

# Config helpers (inline JSON — the server accepts ?config={...}).
BACKDROP_LOGO='{"backdropAsPoster":true,"ratings":["imdb","tmdb"],"ratingsLayout":"bottom","badgeStyle":"pill","badgeTheme":"dark"}'
STANDARD='{"ratings":["imdb","tmdb"],"ratingsLayout":"bottom","badgeStyle":"pill","badgeTheme":"dark"}'
WITH_PROVIDERS='{"backdropAsPoster":true,"ratings":["imdb","tmdb"],"ratingsLayout":"bottom","providers":true}'

encode() { python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read()))" <<EOF
$1
EOF
}

echo "Rendering test images …"

# 1. Backdrop-as-poster with logo overlay — The Dark Knight (tt0468569)
curl -sf "${BASE}/poster/tt0468569?config=$(encode "$BACKDROP_LOGO")" -o "$OUT/1-backdrop-logo-batman.png" && echo "  1/4 backdrop+logo (Batman)" || echo "  1/4 FAILED"

# 2. Logo letterbox — The Dark Knight
curl -sf "${BASE}/logo/tt0468569" -o "$OUT/2-logo-letterbox-batman.png" && echo "  2/4 logo letterbox (Batman)" || echo "  2/4 FAILED"

# 3. Standard poster — The Shawshank Redemption (tt0111161)
curl -sf "${BASE}/poster/tt0111161?config=$(encode "$STANDARD")" -o "$OUT/3-standard-poster-shawshank.png" && echo "  3/4 standard poster (Shawshank)" || echo "  3/4 FAILED"

# 4. Backdrop+logo+providers — Shawshank
curl -sf "${BASE}/poster/tt0111161?config=$(encode "$WITH_PROVIDERS")" -o "$OUT/4-backdrop-logo-providers-shawshank.png" && echo "  4/4 backdrop+providers (Shawshank)" || echo "  4/4 FAILED"

echo ""
echo "Images saved to $OUT/"
ls -lh "$OUT/"*.png 2>/dev/null | awk '{print "  " $5 "  " $9}'

# Open on macOS, display on Linux.
if command -v open >/dev/null 2>&1; then
  open "$OUT/"*.png
elif command -v xdg-open >/dev/null 2>&1; then
  for f in "$OUT/"*.png; do xdg-open "$f" & done
fi

echo ""
echo "Checklist:"
echo "  [ ] 1-backdrop-logo: title text overlaid on backdrop, scrim visible"
echo "  [ ] 2-logo-letterbox: full logo shown, no edge clipping"
echo "  [ ] 3-standard-poster: normal poster, rating badges readable"
echo "  [ ] 4-backdrop-providers: provider chips above badge row, no overlap"
echo ""
echo "Press Ctrl-C to stop the test server."
wait "$API_PID"
