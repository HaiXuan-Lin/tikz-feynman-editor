#!/bin/bash
# Build for this Mac, test the result, and publish only a verified app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$ROOT/scripts/macos-common.sh"
source "$ROOT/scripts/macos-toolchain.sh"
[[ $# == 0 ]] || fail "Usage: ./build.sh (no arguments). Architecture and replacement are handled automatically."
[[ "$(uname -s)" == Darwin ]] || fail "Run this script on macOS."
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64 ;;
  *) fail "Unsupported Mac architecture: $ARCH" ;;
esac

TASK_OUTPUT="$ROOT/$APP_NAME.app"
confirm_replacement "$TASK_OUTPUT" || exit 0
# Stage on the same volume as the destination so publication uses rename.
TASK_WORK="$(mktemp -d "$ROOT/.build-XXXXXX")"
register_cleanup
BUILT="$TASK_WORK/$APP_NAME.app"
RESOURCES="$BUILT/Contents/Resources"
mkdir -p "$TASK_WORK/web" "$RESOURCES" "$BUILT/Contents/MacOS" "$TASK_WORK/npm-cache" "$TASK_WORK/swift-cache"
export npm_config_cache="$TASK_WORK/npm-cache"
export npm_config_progress=false
export npm_config_update_notifier=false
export CLANG_MODULE_CACHE_PATH="$TASK_WORK/swift-cache"
export SWIFT_MODULECACHE_PATH="$TASK_WORK/swift-cache"

printf '\n[1/7] Preparing the build toolchain...\n'
ensure_apple_tools
ensure_node "$NODE_ARCH" "$TASK_WORK"

printf '\n[2/7] Installing dependencies in an isolated workspace...\n'
for file in package.json package-lock.json index.html favicon.ico LICENSE README.md build.sh install.sh; do
  cp "$ROOT/$file" "$TASK_WORK/web/"
done
for directory in src scripts tests css img; do
  cp -R "$ROOT/$directory" "$TASK_WORK/web/$directory"
done
(cd "$TASK_WORK/web" && npm ci --include=dev --no-audit --no-fund)

printf '\n[3/7] Running tests before compilation...\n'
bash -n "$ROOT/build.sh" "$ROOT/install.sh" "$ROOT/scripts/macos-common.sh" "$ROOT/scripts/macos-toolchain.sh"
(cd "$TASK_WORK/web" && npm run format:check && npm test)

printf '\n[4/7] Compiling the web editor and bundling offline resources...\n'
(cd "$TASK_WORK/web" && npm run build)
cp "$TASK_WORK/web/bundle.js" "$TASK_WORK/web/index.html" "$ROOT/favicon.ico" "$ROOT/LICENSE" "$RESOURCES/"
cp -R "$TASK_WORK/web/css" "$TASK_WORK/web/img" "$TASK_WORK/web/vendor" "$RESOURCES/"
cp "$ROOT/macos/AppIcon.icns" "$RESOURCES/AppIcon.icns"
node - "$ROOT/package.json" "$BUILT/Contents/Info.plist" <<'NODE'
const fs = require('fs')
const [packagePath, plistPath] = process.argv.slice(2)
const source = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
fs.writeFileSync(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>TikZFeynmanEditor</string>
<key>CFBundleIdentifier</key><string>com.tikzfeynman.editor</string>
<key>CFBundleName</key><string>TikZ Feynman Editor</string>
<key>CFBundleDisplayName</key><string>TikZ Feynman Editor</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>AppIcon.icns</string>
<key>CFBundleShortVersionString</key><string>${xml(source.version)}</string>
<key>CFBundleVersion</key><string>${xml(source.version)}</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`)
NODE

printf '\n[5/7] Compiling the native WebKit app for %s...\n' "$ARCH"
xcrun swiftc -O -whole-module-optimization -module-cache-path "$TASK_WORK/swift-cache" \
  -target "$ARCH-apple-macosx11.0" -framework Cocoa -framework WebKit \
  "$ROOT/macos/main.swift" -o "$BUILT/Contents/MacOS/TikZFeynmanEditor"
strip -x "$BUILT/Contents/MacOS/TikZFeynmanEditor"

printf '\n[6/7] Testing compiled resources, signature, and offline WebKit startup...\n'
node "$ROOT/scripts/verify-app.mjs" "$BUILT"
plutil -lint "$BUILT/Contents/Info.plist"
codesign --force --sign - "$BUILT"
verify_app "$BUILT"
xcrun swiftc -O -module-cache-path "$TASK_WORK/swift-cache" \
  -framework Cocoa -framework WebKit "$ROOT/macos/smoke-test.swift" -o "$TASK_WORK/smoke-test"
"$TASK_WORK/smoke-test" "$RESOURCES"

printf '\n[7/7] Publishing the verified app...\n'
publish_app "$BUILT" "$TASK_OUTPUT"
printf '\nBuilt: %s\n' "$TASK_OUTPUT"
du -sh "$TASK_OUTPUT"
printf 'Install with: ./install.sh\n'
