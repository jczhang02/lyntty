#!/usr/bin/env bash
set -euo pipefail

VECTOR_PACK_DIR="${1:-${LYNTTY_VECTOR_PACK_DIR:-}}"
if [[ -z "${VECTOR_PACK_DIR}" ]]; then
  echo "Usage: $0 /path/to/lyntty_vector_pack" >&2
  exit 2
fi
if [[ ! -d "${VECTOR_PACK_DIR}" ]]; then
  echo "Vector pack not found: ${VECTOR_PACK_DIR}" >&2
  exit 2
fi
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT="${APP_DIR}/sources/assets/images"
PUBLIC="${APP_DIR}/public"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

render_square() {
  local src="$1"
  local size="$2"
  local dst="$3"
  magick -background none -density 384 "$src" -resize "${size}x${size}" -depth 8 -strip -define png:compression-level=9 "$dst"
}

render_wordmark() {
  local src="$1"
  local dst="$2"
  local scale="$3"
  magick -background none -density 384 "$src" -resize "$scale" -depth 8 -strip -define png:compression-level=9 "$dst"
}

make_light_svg() {
  local src="$1"
  local dst="$2"
  python3 - "$src" "$dst" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1])
dst = Path(sys.argv[2])
text = src.read_text()
text = text.replace('#111827', '#F8FAFF')
dst.write_text(text)
PY
}

mkdir -p "$OUT" "$PUBLIC"

ICON="${VECTOR_PACK_DIR}/icons/lyntty_icon_1024.svg"
MASKABLE="${VECTOR_PACK_DIR}/icons/lyntty_icon_maskable.svg"
MARK_DARK="${VECTOR_PACK_DIR}/marks/lyntty_mark_outline_dark_tight.svg"
MARK_LIGHT="${VECTOR_PACK_DIR}/marks/lyntty_mark_outline_inverse.svg"
WORDMARK="${VECTOR_PACK_DIR}/wordmarks/lyntty_wordmark_mark_left.svg"
WORDMARK_LIGHT="${TMP}/lyntty_wordmark_mark_left_light.svg"
make_light_svg "$WORDMARK" "$WORDMARK_LIGHT"

render_square "$ICON" 1024 "$OUT/icon.png"
render_square "$MASKABLE" 1024 "$OUT/icon-adaptive.png"
render_square "$MARK_DARK" 1024 "$OUT/icon-monochrome.png"
render_square "$MARK_LIGHT" 96 "$OUT/icon-notification.png"
render_square "$ICON" 1024 "$OUT/icon-tauri.png"
render_square "$ICON" 1024 "$OUT/splash-android-light.png"
render_square "$MASKABLE" 1024 "$OUT/splash-android-dark.png"
render_square "$MARK_DARK" 512 "$OUT/logo-black.png"
render_square "$MARK_LIGHT" 512 "$OUT/logo-white.png"
render_square "$ICON" 48 "$OUT/favicon.png"
render_square "$ICON" 48 "$OUT/favicon-active.png"
magick "$OUT/favicon.png" "$PUBLIC/favicon.ico"
magick "$OUT/favicon-active.png" "$PUBLIC/favicon-active.ico"

render_wordmark "$WORDMARK" "$OUT/logotype.png" "1500x360"
render_wordmark "$WORDMARK" "$OUT/logotype@2x.png" "3000x720"
render_wordmark "$WORDMARK" "$OUT/logotype@3x.png" "4500x1080"
render_wordmark "$WORDMARK" "$OUT/logotype-dark.png" "1500x360"
render_wordmark "$WORDMARK" "$OUT/logotype-dark@2x.png" "3000x720"
render_wordmark "$WORDMARK" "$OUT/logotype-dark@3x.png" "4500x1080"
render_wordmark "$WORDMARK_LIGHT" "$OUT/logotype-light.png" "1500x360"
render_wordmark "$WORDMARK_LIGHT" "$OUT/logotype-light@2x.png" "3000x720"
render_wordmark "$WORDMARK_LIGHT" "$OUT/logotype-light@3x.png" "4500x1080"

printf 'Generated Lyntty brand assets into %s\n' "$OUT"
