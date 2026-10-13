#!/bin/bash

apple_tools_ready() {
  /usr/bin/xcode-select -p >/dev/null 2>&1 &&
    /usr/bin/xcrun --find swiftc >/dev/null 2>&1 &&
    /usr/bin/xcrun --sdk macosx --show-sdk-path >/dev/null 2>&1
}

ensure_apple_tools() {
  if apple_tools_ready; then return; fi
  printf 'Requesting Apple Command Line Tools. Complete the macOS installation dialog; this build will resume automatically.\n'
  /usr/bin/xcode-select --install || printf 'Checking for an installation already in progress...\n'
  local deadline=$((SECONDS + 1800))
  until apple_tools_ready; do
    [[ $SECONDS -lt $deadline ]] || fail "Apple tools are still unavailable after 30 minutes. Complete installation, then run ./build.sh again."
    sleep 5
  done
}

node_ready() {
  command -v node >/dev/null && command -v npm >/dev/null &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=12) ? 0 : 1)' &&
    npm --version >/dev/null 2>&1
}

ensure_node() {
  local architecture="$1" workspace="$2" manifest archive checksum filename
  if node_ready; then
    printf 'Using Node.js %s and npm %s.\n' "$(node --version)" "$(npm --version)"
    return
  fi
  printf 'Installing a temporary official Node.js 22 LTS toolchain (%s)...\n' "$architecture"
  manifest="$workspace/SHASUMS256.txt"
  /usr/bin/curl --silent --show-error --proto '=https' --tlsv1.2 --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
    'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -o "$manifest"
  archive="$(awk -v arch="$architecture" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-darwin-" arch "\\.tar\\.gz$") {print; exit}' "$manifest")"
  [[ -n "$archive" ]] || fail "Official Node.js manifest does not contain a binary for this Mac."
  IFS=' ' read -r checksum filename <<< "$archive"
  /usr/bin/curl --silent --show-error --proto '=https' --tlsv1.2 --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
    "https://nodejs.org/dist/latest-v22.x/$filename" -o "$workspace/$filename"
  printf '%s  %s\n' "$checksum" "$filename" > "$workspace/node.sha256"
  (cd "$workspace" && /usr/bin/shasum -a 256 -c node.sha256) || fail "Node.js download failed checksum verification."
  mkdir -p "$workspace/toolchain"
  /usr/bin/tar -xzf "$workspace/$filename" -C "$workspace/toolchain" --strip-components=1
  export PATH="$workspace/toolchain/bin:$PATH"
  node_ready || fail "The downloaded Node.js toolchain could not start on this Mac."
  printf 'Using temporary Node.js %s.\n' "$(node --version)"
}
