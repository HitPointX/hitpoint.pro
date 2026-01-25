#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
NATIVE_DIR="$ROOT_DIR/x/games/gachitop/native"
OUT_DIR="$ROOT_DIR/x/games/gachitop"

EMSDK_DIR="${EMSDK_DIR:-$HOME/.cache/emsdk}"
if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
  echo "[gachitop:web] emsdk not found at: $EMSDK_DIR" >&2
  echo "[gachitop:web] Install it, then re-run:" >&2
  echo "  mkdir -p \"$HOME/.cache\" && cd \"$HOME/.cache\" && git clone https://github.com/emscripten-core/emsdk.git" >&2
  echo "  cd emsdk && ./emsdk install 3.1.56 && ./emsdk activate 3.1.56" >&2
  exit 1
fi

source "$EMSDK_DIR/emsdk_env.sh" >/dev/null

mkdir -p "$OUT_DIR"

em++ -std=c++20 -O2 \
  -I"$NATIVE_DIR/src" \
  -I"$NATIVE_DIR/include" \
  "$NATIVE_DIR/src/lcd_buffer.cpp" \
  "$NATIVE_DIR/src/game_rules.cpp" \
  "$NATIVE_DIR/src/illness_db.cpp" \
  "$NATIVE_DIR/src/pet_sim.cpp" \
  "$NATIVE_DIR/src/save_system.cpp" \
  "$NATIVE_DIR/src/ui.cpp" \
  "$NATIVE_DIR/src/web_api.cpp" \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createGachitopModule \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s FILESYSTEM=0 \
  -s EXIT_RUNTIME=0 \
  -s EXPORTED_FUNCTIONS='["_gch_init","_gch_step","_gch_rgba_ptr","_gch_rgba_len","_gch_save_json_ptr","_gch_save_json_len","_gch_reset","_gch_load_save_json","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","UTF8ToString","lengthBytesUTF8","stringToUTF8"]' \
  -o "$OUT_DIR/gachitop.js"

echo "[gachitop:web] Built: $OUT_DIR/gachitop.js and $OUT_DIR/gachitop.wasm"
