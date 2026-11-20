#!/bin/zsh
# Build Pingu.app, install to ~/Applications, and (re)load the login agent.
set -euo pipefail
cd "$(dirname "$0")"

APP=~/Applications/Pingu.app
LABEL=local.pingu.agent
PLIST=~/Library/LaunchAgents/$LABEL.plist

./build.sh

launchctl bootout gui/$UID/$LABEL 2>/dev/null || true
pkill -x Pingu || true  # e.g. a copy started by hand with `open`
mkdir -p ~/Applications ~/Library/LaunchAgents
rm -rf $APP && cp -R build/Pingu.app $APP

cat > $PLIST <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$APP/Contents/MacOS/Pingu</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/pingu.log</string>
</dict></plist>
EOF
launchctl bootstrap gui/$UID $PLIST
echo "Pingu installed and running. Logs: /tmp/pingu.log"
