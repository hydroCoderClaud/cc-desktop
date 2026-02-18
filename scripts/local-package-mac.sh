#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="cc-desktop-${VERSION}-macos"
OUTPUT="dist/cc-desktop-${VERSION}-macos.tar.gz"

echo "Packaging macOS installer: ${OUTPUT}..."

mkdir -p "$RELEASE_DIR"
find dist -name "*${VERSION}*.dmg" -exec cp {} "$RELEASE_DIR/" \;
if [ -z "$(ls "$RELEASE_DIR"/*.dmg 2>/dev/null)" ]; then
  echo "ERROR: No .dmg file matching version ${VERSION} found in dist/"
  exit 1
fi
cp scripts/install.sh "$RELEASE_DIR/"

cat > "$RELEASE_DIR/README.md" << EOF
# CC Desktop ${VERSION} - macOS Installer

## Quick Install (Recommended)

\`\`\`bash
bash install.sh
\`\`\`

This will:
1. Detect your system architecture (ARM64 or x64)
2. Check if Claude Code CLI is installed (install if not)
3. Install CC Desktop to /Applications

## Manual Install

- **Apple Silicon (M1/M2/M3)**: \`CC-Desktop-${VERSION}-darwin-arm64.dmg\`
- **Intel**: \`CC-Desktop-${VERSION}-darwin-x64.dmg\`
EOF

tar czf "$OUTPUT" "$RELEASE_DIR"
rm -rf "$RELEASE_DIR"

echo "Done: ${OUTPUT}"
