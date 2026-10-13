#!/bin/bash
# Install the app produced by build.sh into /Applications.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$ROOT/scripts/macos-common.sh"
[[ $# == 0 ]] || fail "Usage: ./install.sh (no arguments)."
[[ "$(uname -s)" == Darwin ]] || fail "Run this script on macOS."
SOURCE="$ROOT/$APP_NAME.app"
INSTALL_DIRECTORY="/Applications"
TASK_OUTPUT="$INSTALL_DIRECTORY/$APP_NAME.app"
[[ -d "$SOURCE" ]] || fail "Built application not found. Run ./build.sh first."
printf 'Verifying the built application...\n'
verify_app "$SOURCE"
confirm_replacement "$TASK_OUTPUT" || exit 0

if [[ ! -w "$INSTALL_DIRECTORY" || ( -e "$TASK_OUTPUT" && ! -w "$TASK_OUTPUT" ) ]]; then
  printf 'Administrator permission is required to install in /Applications.\n'
  sudo -v
  TASK_PRIVILEGED=true
fi
TASK_WORK="$(task_run mktemp -d "$INSTALL_DIRECTORY/.tikz-feynman-install.XXXXXX")"
register_cleanup
task_run chmod 755 "$TASK_WORK"
STAGED="$TASK_WORK/$APP_NAME.app"
printf 'Copying the application...\n'
task_run /usr/bin/ditto "$SOURCE" "$STAGED"
printf 'Verifying the installed copy...\n'
verify_app "$STAGED"
publish_app "$STAGED" "$TASK_OUTPUT"
printf '\nInstalled: %s\nOpen it from Finder or Launchpad.\n' "$TASK_OUTPUT"
