#!/bin/zsh
# Stop the Pingu login agent and remove it.
launchctl bootout gui/$UID/local.pingu.agent 2>/dev/null || true
rm -f ~/Library/LaunchAgents/local.pingu.agent.plist
rm -rf ~/Applications/Pingu.app
rm -f /opt/homebrew/bin/pingu ~/.local/bin/pingu
echo "Pingu removed."
