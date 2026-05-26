#!/bin/sh
set -e
cd /cli

echo "=== Installing dependencies ==="
npm install --silent 2>&1 | tail -3

echo "=== Building TypeScript ==="
npm run build 2>&1 | tail -5

echo "=== Installing esbuild + pkg ==="
npm install --save-dev esbuild @yao-pkg/pkg --silent 2>&1 | tail -3

echo "=== Bundling to CJS ==="
./node_modules/.bin/esbuild dist/index.js \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=bundle.cjs \
  --target=node20 \
  --define:process.env.FORCE_COLOR='"3"' \
  --log-level=warning

echo "Bundle size: $(wc -c < bundle.cjs) bytes"

echo "=== Building native binaries ==="
mkdir -p /binaries

./node_modules/.bin/pkg bundle.cjs \
  --targets node20-linux-x64,node20-macos-x64,node20-macos-arm64 \
  --output /binaries/zyphron \
  2>&1

echo "=== Done ==="
ls -lh /binaries/
