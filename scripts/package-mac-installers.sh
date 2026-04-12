#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-$(node -p "require('./package.json').version")}"
DIST_DIR="${2:-dist}"

package_arch() {
  local arch="$1"
  local release_dir="cc-desktop-${VERSION}-macos-${arch}-installer"
  local output="${DIST_DIR}/cc-desktop-${VERSION}-macos-${arch}-installer.tar.gz"
  local dmg="${DIST_DIR}/CC-Desktop-${VERSION}-darwin-${arch}.dmg"

  echo "Packaging macOS ${arch} installer: ${output}..."

  if [ ! -f "$dmg" ]; then
    echo "ERROR: Missing DMG: ${dmg}"
    exit 1
  fi

  rm -rf "$release_dir"
  mkdir -p "$release_dir"

  cp "$dmg" "$release_dir/"
  cp scripts/install.sh "$release_dir/"
  printf '%s\n' "$arch" > "${release_dir}/installer-arch.txt"

  cat > "${release_dir}/README.md" << EOF
# CC Desktop ${VERSION} - macOS ${arch} Installer

## Quick Install (Recommended)

\`\`\`bash
bash install.sh
\`\`\`

This installer package will:
1. Verify your macOS architecture matches this package (${arch})
2. Check Node.js and Claude Code CLI
3. Install CC Desktop to /Applications

## Included Files

- \`CC-Desktop-${VERSION}-darwin-${arch}.dmg\`
- \`install.sh\`

## Manual Install

Double-click \`CC-Desktop-${VERSION}-darwin-${arch}.dmg\` and drag the app to /Applications.
EOF

  tar czf "$output" "$release_dir"
  rm -rf "$release_dir"

  echo "Done: ${output}"
}

package_arch "arm64"
package_arch "x64"
