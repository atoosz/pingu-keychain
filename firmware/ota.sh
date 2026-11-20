#!/bin/zsh
# Build the firmware and send it to Pingu over Bluetooth. Hold K4 for 3s on Pingu when asked.
set -euo pipefail
cd "$(dirname "$0")"
pio run
BIN=$PWD/.pio/build/esp32dev/firmware.bin
LOG=$(mktemp -t pingu-ota)
AGENT=gui/$UID/local.pingu.agent

# The ESP32 takes one connection at a time, so pause the Pingu agent while uploading.
launchctl bootout $AGENT 2>/dev/null || true
trap 'kill $TAIL 2>/dev/null; launchctl bootstrap gui/$UID ~/Library/LaunchAgents/local.pingu.agent.plist 2>/dev/null || true' EXIT
tail -f $LOG & TAIL=$!
# Launch through `open` so the Bluetooth permission is Pingu.app's, not the terminal's.
open -W -n --stdout $LOG --stderr $LOG ~/Applications/Pingu.app --args --ota $BIN
sleep 0.5
grep -q "OTA OK" $LOG
