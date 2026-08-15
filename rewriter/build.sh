#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "[BUILD] Compiling Rust to WASM..."
cargo build --target wasm32-unknown-unknown --release

echo "[BUILD] Running wasm-bindgen..."
wasm-bindgen \
  --target nodejs \
  --out-dir pkg \
  ../target/wasm32-unknown-unknown/release/flashproxy_rewriter.wasm

echo "[BUILD] Optimizing with wasm-opt..."
if command -v wasm-opt &> /dev/null; then
    wasm-opt -O3 pkg/flashproxy_rewriter_bg.wasm -o pkg/flashproxy_rewriter_bg.wasm
    echo "[BUILD] wasm-opt done"
else
    echo "[WARN] wasm-opt not found, skipping optimization"
fi

echo "[BUILD] Done! Output in rewriter/pkg/"
