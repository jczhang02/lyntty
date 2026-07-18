#!/bin/sh
set -eu

fail() {
  printf 'Lyntty install failed: %s\n' "$*" >&2
  exit 1
}

BASE_URL=''
VERSION=''
TARGET=''
MANIFEST_SHA256=''
ARCHIVE_SHA256=''
INSTALL_ROOT=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url) [ "$#" -ge 2 ] || fail '--base-url requires a value'; BASE_URL=$2; shift 2 ;;
    --version) [ "$#" -ge 2 ] || fail '--version requires a value'; VERSION=$2; shift 2 ;;
    --target) [ "$#" -ge 2 ] || fail '--target requires a value'; TARGET=$2; shift 2 ;;
    --manifest-sha256) [ "$#" -ge 2 ] || fail '--manifest-sha256 requires a value'; MANIFEST_SHA256=$2; shift 2 ;;
    --archive-sha256) [ "$#" -ge 2 ] || fail '--archive-sha256 requires a value'; ARCHIVE_SHA256=$2; shift 2 ;;
    --install-root) [ "$#" -ge 2 ] || fail '--install-root requires a value'; INSTALL_ROOT=$2; shift 2 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[ -n "$BASE_URL" ] || fail '--base-url is required'
[ -n "$VERSION" ] || fail '--version is required'
case "$VERSION" in *[!0-9A-Za-z._-]*) fail 'version contains unsupported characters' ;; esac
[ -n "$MANIFEST_SHA256" ] || fail '--manifest-sha256 is required'
[ -n "$ARCHIVE_SHA256" ] || fail '--archive-sha256 is required'

case "$MANIFEST_SHA256" in *[!0-9a-f]*|'') fail 'manifest SHA-256 must be lowercase hexadecimal' ;; esac
case "$ARCHIVE_SHA256" in *[!0-9a-f]*|'') fail 'archive SHA-256 must be lowercase hexadecimal' ;; esac
[ "${#MANIFEST_SHA256}" -eq 64 ] || fail 'manifest SHA-256 must be 64 characters'
[ "${#ARCHIVE_SHA256}" -eq 64 ] || fail 'archive SHA-256 must be 64 characters'

if [ -z "$TARGET" ]; then
  case "$(uname -s)" in
    Linux) OS=linux ;;
    Darwin) OS=darwin ;;
    *) fail 'the one-line installer currently supports Linux and macOS only' ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *) fail "unsupported architecture: $(uname -m)" ;;
  esac
  TARGET="$OS-$ARCH"
fi
case "$TARGET" in linux-x64|linux-arm64|darwin-x64|darwin-arm64) ;; *) fail "unsupported target: $TARGET" ;; esac

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v tar >/dev/null 2>&1 || fail 'tar is required'
if command -v sha256sum >/dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  fail 'sha256sum or shasum is required'
fi

CACHE_ROOT=${XDG_CACHE_HOME:-"$HOME/.cache"}/lyntty/install
mkdir -p "$CACHE_ROOT"
chmod 700 "$CACHE_ROOT" 2>/dev/null || true
WORK_DIR=$(mktemp -d "$CACHE_ROOT/transaction.XXXXXX")
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT HUP INT TERM

ARTIFACT_NAME="lyntty-cli-$VERSION-$TARGET"
ARCHIVE="$WORK_DIR/$ARTIFACT_NAME.tar.gz"
URL="${BASE_URL%/}/$ARTIFACT_NAME.tar.gz"
printf 'Downloading %s\n' "$URL"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --output "$ARCHIVE" "$URL"
[ "$(sha256_file "$ARCHIVE")" = "$ARCHIVE_SHA256" ] || fail 'archive SHA-256 mismatch'

tar -tzf "$ARCHIVE" > "$WORK_DIR/archive.list"
tar -tvzf "$ARCHIVE" > "$WORK_DIR/archive.verbose"
while IFS= read -r line; do
  entry_type=$(printf '%.1s' "$line")
  case "$entry_type" in -|d) ;; *) fail "archive contains a link or special entry: $line" ;; esac
done < "$WORK_DIR/archive.verbose"
while IFS= read -r entry; do
  case "$entry" in
    "$ARTIFACT_NAME"|"$ARTIFACT_NAME"/*) ;;
    *) fail "archive contains an unexpected path: $entry" ;;
  esac
done < "$WORK_DIR/archive.list"

tar -xzf "$ARCHIVE" -C "$WORK_DIR"
CANDIDATE="$WORK_DIR/$ARTIFACT_NAME"
[ -x "$CANDIDATE/lyntty" ] || fail 'archive does not contain an executable lyntty binary'
[ "$(sha256_file "$CANDIDATE/artifact-manifest.json")" = "$MANIFEST_SHA256" ] || fail 'manifest SHA-256 mismatch'

"$CANDIDATE/lyntty" --self-check --json >/dev/null
"$CANDIDATE/lyntty" auth login
if [ -n "$INSTALL_ROOT" ]; then
  "$CANDIDATE/lyntty" self install --manifest-sha256 "$MANIFEST_SHA256" --install-root "$INSTALL_ROOT"
else
  "$CANDIDATE/lyntty" self install --manifest-sha256 "$MANIFEST_SHA256"
fi

printf 'Lyntty installed successfully. Ensure %s is on PATH.\n' "${HOME}/.local/bin"
