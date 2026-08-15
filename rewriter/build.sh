#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

command -v cargo >/dev/null 2>&1 || { echo "[ERROR] cargo is required" >&2; exit 1; }
command -v wasm-bindgen >/dev/null 2>&1 || { echo "[ERROR] wasm-bindgen CLI is required" >&2; exit 1; }

if ! rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
  echo "[BUILD] Installing Rust wasm32 target..."
  rustup target add wasm32-unknown-unknown
fi

echo "[BUILD] Compiling Rust to WASM..."
cargo build --target wasm32-unknown-unknown --release --manifest-path "$SCRIPT_DIR/Cargo.toml"

echo "[BUILD] Running wasm-bindgen..."
rm -rf pkg
wasm-bindgen \
  --target nodejs \
  --out-dir pkg \
  ../target/wasm32-unknown-unknown/release/flashproxy_rewriter.wasm

if command -v wasm-opt >/dev/null 2>&1; then
  echo "[BUILD] Optimizing with wasm-opt..."
  wasm-opt -O3 pkg/flashproxy_rewriter_bg.wasm -o pkg/flashproxy_rewriter_bg.wasm
else
  echo "[WARN] wasm-opt not found; skipping optional optimization"
fi

echo "[BUILD] Done: $SCRIPT_DIR/pkg"
