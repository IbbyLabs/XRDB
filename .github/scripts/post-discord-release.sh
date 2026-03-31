#!/usr/bin/env bash
set -euo pipefail

exec node ./.github/scripts/post-discord-release.mjs "$@"
