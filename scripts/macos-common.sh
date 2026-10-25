#!/bin/bash
# Shared by build.sh and install.sh; compatible with macOS's Bash 3.2.
APP_NAME="TikZ Feynman Editor"
APP_IDENTIFIER="com.tikzfeynman.editor"
TASK_WORK=""
TASK_OUTPUT=""
TASK_BACKUP=""
TASK_PUBLISHED=false
TASK_PRIVILEGED=false
TASK_REPLACE_APPROVED=false

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

task_run() {
  if [[ "$TASK_PRIVILEGED" == true ]]; then
    sudo -- "$@"
  else
    "$@"
  fi
}

# Conda and cross-compilation packages ship commands with these same names.
# Bundle metadata and Mach-O operations must use the installed Apple tools.
app_identifier() {
  /usr/bin/plutil -extract CFBundleIdentifier raw -o - "$1/Contents/Info.plist"
}

verify_native_binary() {
  local binary="$1" architecture="$2"
  [[ -f "$binary" && -s "$binary" && -x "$binary" && ! -L "$binary" ]] || fail "Native executable is missing, empty or not executable: $binary"
  /usr/bin/lipo "$binary" -verify_arch "$architecture" || fail "Native executable is not valid Mach-O for $architecture: $binary"
}

prepare_native_binary() {
  verify_native_binary "$1" "$2"
  /usr/bin/strip -x "$1"
  verify_native_binary "$1" "$2"
}

sign_app() {
  local allocator
  allocator="$(/usr/bin/xcrun --find codesign_allocate)" || fail "Apple codesign_allocate is unavailable. Check the installed Apple Command Line Tools."
  [[ -x "$allocator" ]] || fail "Apple codesign_allocate is not executable: $allocator"
  CODESIGN_ALLOCATE="$allocator" /usr/bin/codesign --force --sign - "$1"
}

confirm_replacement() {
  local destination="$1" answer
  [[ -e "$destination" || -L "$destination" ]] || return 0
  [[ -d "$destination" && ! -L "$destination" ]] || fail "Destination is not a regular app bundle: $destination"
  [[ "$(app_identifier "$destination" 2>/dev/null)" == "$APP_IDENTIFIER" ]] || fail "Destination belongs to another application: $destination"
  printf 'An application already exists at:\n  %s\nReplace it? [y/N] ' "$destination"
  if ! IFS= read -r answer; then answer=""; fi
  case "$answer" in
    y|Y|yes|YES|Yes) TASK_REPLACE_APPROVED=true; return 0 ;;
    *) printf '\nCancelled; existing application preserved.\n'; return 1 ;;
  esac
}

verify_app() {
  local app="$1" architecture
  [[ -d "$app" && ! -L "$app" ]] || fail "Application is missing: $app"
  [[ "$(app_identifier "$app")" == "$APP_IDENTIFIER" ]] || fail "Invalid application identifier."
  [[ "$(/usr/bin/plutil -extract CFBundleExecutable raw -o - "$app/Contents/Info.plist")" == TikZFeynmanEditor ]] || fail "Invalid application executable."
  architecture="$(/usr/bin/uname -m)"
  verify_native_binary "$app/Contents/MacOS/TikZFeynmanEditor" "$architecture"
  [[ -s "$app/Contents/Resources/build-manifest.sha256" ]] || fail "Build verification manifest is missing. Run ./build.sh first."
  (cd "$app" && /usr/bin/shasum -a 256 -c Contents/Resources/build-manifest.sha256 >/dev/null) || fail "Built application files failed integrity checks."
  /usr/bin/codesign --verify --deep --strict "$app" || fail "Application signature verification failed."
}

publish_app() {
  local source="$1" destination="$2"
  [[ -d "$source" && ! -L "$source" ]] || fail "Staged application is missing: $source"
  if [[ -e "$destination" || -L "$destination" ]]; then
    [[ "$TASK_REPLACE_APPROVED" == true ]] || fail "An app appeared during this operation. Run again to confirm replacement."
    [[ -d "$destination" && ! -L "$destination" ]] || fail "Destination changed during the operation."
    [[ "$(app_identifier "$destination" 2>/dev/null)" == "$APP_IDENTIFIER" ]] || fail "Destination belongs to another application."
    TASK_BACKUP="$TASK_WORK/previous.app"
    task_run mv "$destination" "$TASK_BACKUP"
  fi
  task_run mv "$source" "$destination"
  TASK_PUBLISHED=true
}

cleanup_task() {
  local status=$? failed=false
  trap - EXIT INT TERM
  # Restore the previous app if publication failed or was interrupted.
  if [[ "$TASK_PUBLISHED" != true && -n "$TASK_BACKUP" && -d "$TASK_BACKUP" ]]; then
    if [[ -e "$TASK_OUTPUT" ]]; then
      task_run mv "$TASK_OUTPUT" "$TASK_WORK/interrupted.app" || failed=true
    fi
    if [[ "$failed" == false ]]; then
      task_run mv "$TASK_BACKUP" "$TASK_OUTPUT" || failed=true
    fi
    if [[ "$failed" == true ]]; then
      printf 'Could not restore the previous app; it is preserved at %s\n' "$TASK_BACKUP" >&2
      exit 1
    fi
  fi
  if [[ -n "$TASK_WORK" && -d "$TASK_WORK" ]]; then
    task_run rm -rf -- "$TASK_WORK" || { printf 'Could not clean temporary files: %s\n' "$TASK_WORK" >&2; exit 1; }
    printf 'Temporary dependencies and caches cleaned.\n'
  fi
  exit "$status"
}

register_cleanup() {
  trap cleanup_task EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}
