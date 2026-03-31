#!/usr/bin/env bash
set -euo pipefail

run_cmd() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  printf '%s\n' "sudo not found. Run this script as root."
  exit 1
}

install_fonts() {
  if command -v apt-get >/dev/null 2>&1; then
    run_cmd apt-get update
    run_cmd apt-get install -y fontconfig fonts-dejavu fonts-freefont-ttf fonts-noto-core
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_cmd dnf install -y fontconfig dejavu-fonts-all gnu-free-fonts google-noto-sans-fonts google-noto-serif-fonts
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_cmd pacman -Sy --needed fontconfig ttf-dejavu gnu-free-fonts noto-fonts
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    run_cmd apk add --no-cache fontconfig ttf-dejavu ttf-freefont font-noto
    return
  fi

  printf '%s\n' "Unsupported distro. Install fontconfig, DejaVu, FreeFont, and Noto manually."
  exit 1
}

install_fonts
run_cmd fc-cache -f
printf '%s\n' "Fonts installed and cache refreshed."
