#!/bin/bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")

echo "Packaging split macOS installer archives for ${VERSION}..."
bash scripts/package-mac-installers.sh "$VERSION" "dist"
echo "Done."
