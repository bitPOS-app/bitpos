#!/usr/bin/env bash
# build-posbox.sh — Build the posBOX ESP32 firmware and publish to API server
# Usage: bash scripts/build-posbox.sh
set -euo pipefail

FIRMWARE_SRC="artifacts/esp32-pos/.pio/build/esp32dev/firmware.bin"
FIRMWARE_DEST="artifacts/api-server/public/firmware/posbox-latest.bin"

echo "==> Checking PlatformIO..."
if ! command -v pio &>/dev/null; then
  echo "ERROR: PlatformIO CLI (pio) not found."
  echo "Install with: pip install platformio"
  exit 1
fi

echo "==> Building posBOX firmware..."
pio run --project-dir artifacts/esp32-pos

if [ ! -f "$FIRMWARE_SRC" ]; then
  echo "ERROR: Build succeeded but firmware.bin not found at $FIRMWARE_SRC"
  exit 1
fi

echo "==> Copying firmware to API server public directory..."
mkdir -p "$(dirname "$FIRMWARE_DEST")"
cp "$FIRMWARE_SRC" "$FIRMWARE_DEST"

SIZE=$(wc -c < "$FIRMWARE_DEST")
echo "==> Done: $FIRMWARE_DEST (${SIZE} bytes)"
echo "    Commit this file and restart the API server to serve the update."
