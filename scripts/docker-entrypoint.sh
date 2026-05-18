#!/bin/sh
set -eu

resolve_data_dir() {
  if [ -n "${XRDB_DB_PATH:-}" ]; then
    dirname "$XRDB_DB_PATH"
    return
  fi

  if [ -n "${XRDB_DATA_DIR:-}" ]; then
    printf '%s\n' "$XRDB_DATA_DIR"
    return
  fi

  printf '%s\n' "/app/data"
}

DATA_DIR="$(resolve_data_dir)"

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  mkdir -p "$DATA_DIR"

  groupmod -o -g "$PGID" node 2>/dev/null || true
  usermod -o -u "$PUID" node 2>/dev/null || true

  if ! chown -R node:node "$DATA_DIR" 2>/dev/null; then
    echo "[xrdb] Warning: unable to change ownership for $DATA_DIR before startup." >&2
    echo "[xrdb] If XRDB cannot write its SQLite database, fix the host mount with sudo chown and recreate the container." >&2
  fi

  exec gosu node "$@"
fi

exec "$@"