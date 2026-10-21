#!/usr/bin/env bash
# Builds CafePOS.zip for a Windows cafe PC. P62, docs/WINDOWS-INSTALL.md.
#
#   bash box/windows/make-package.sh
#
# Run on a developer machine. Takes the committed code (git archive: never .env,
# never box-data, never anything uncommitted), adds the built screens, and puts
# "Install Cafe POS.bat" at the top so the person at the cafe sees it first.
# The result is release/CafePOS.zip. No secrets are inside it: the installer
# makes the cafe's own on the cafe PC.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/release"
STAGE="$OUT/CafePOS"
cd "$ROOT"

if [[ -n "$(git status --porcelain -- server client box setup package.json package-lock.json)" ]]; then
  echo "Commit your changes first: the package is made from the last commit."; git status --short; exit 1
fi

echo "Building the screens..."
(cd client && npx vite build >/dev/null)

rm -rf "$STAGE" "$OUT/CafePOS.zip"
mkdir -p "$STAGE"
git archive --format=tar HEAD | tar -x -C "$STAGE"
rm -rf "$STAGE/e2e" "$STAGE/docs/archive" "$STAGE/setup/archive" "$STAGE/.github"
mkdir -p "$STAGE/client/dist"
cp -R client/dist/. "$STAGE/client/dist/"
cp "box/windows/Install Cafe POS.bat" "$STAGE/Install Cafe POS.bat"
cat > "$STAGE/READ ME FIRST.txt" <<'TXT'
CAFE POS - SETUP ON THIS PC (once)

1. This folder should be C:\CafePOS  (move it there if it is somewhere else).
2. The PC must be on the internet for the first setup only.
3. Double-click "Install Cafe POS" and click Yes when Windows asks.
4. Answer the questions: cafe name, owner name, owner mobile, owner password.
5. When it says "All done", use the "Cafe POS" icon on the desktop.

Tablets and phones: join the same WiFi as this PC, then open the address the
installer showed, or open "Cafe POS - Connect a device" and scan the QR codes.

Full guide: docs\WINDOWS-INSTALL.md and docs\STAFF-SETUP.md
TXT
printf '%s\n' "$(git rev-parse --short HEAD)" > "$STAGE/VERSION.txt"
(cd "$OUT" && zip -qr CafePOS.zip CafePOS)
rm -rf "$STAGE"
echo "Made $OUT/CafePOS.zip ($(du -h "$OUT/CafePOS.zip" | cut -f1)), version $(git rev-parse --short HEAD)."
