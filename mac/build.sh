#!/bin/zsh
# Build mac/build/Pingu.app (ad-hoc signed). Used by install.sh and CI.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build/Pingu.app
mkdir -p build/Pingu.app/Contents/MacOS
cp Info.plist build/Pingu.app/Contents/
swiftc -O -target "$(uname -m)-apple-macos13" Pingu.swift -o build/Pingu.app/Contents/MacOS/Pingu
codesign --force --sign - build/Pingu.app
