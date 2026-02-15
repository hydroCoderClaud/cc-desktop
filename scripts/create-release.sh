#!/usr/bin/env bash
# 创建发布包（包含两个架构的 DMG）

set -e

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="release/cc-desktop-v${VERSION}-macos"

echo "📦 Creating release package for v${VERSION}..."

# 检查 DMG 文件是否存在
if [ ! -f "dist/CC Desktop-${VERSION}-darwin-arm64.dmg" ] || [ ! -f "dist/CC Desktop-${VERSION}-darwin-x64.dmg" ]; then
    echo "❌ DMG files not found. Please run 'npm run build:mac' first."
    exit 1
fi

# 创建目录
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# 复制文件
echo "📋 Copying files..."
cp "dist/CC Desktop-${VERSION}-darwin-arm64.dmg" "$RELEASE_DIR/"
cp "dist/CC Desktop-${VERSION}-darwin-x64.dmg" "$RELEASE_DIR/"
cp scripts/install.sh "$RELEASE_DIR/"

# 创建 README
cat > "$RELEASE_DIR/README.md" << EOF
# CC Desktop v${VERSION}

## Quick Install (Recommended)

\`\`\`bash
bash install.sh
\`\`\`

This will:
1. Detect your system architecture (ARM64 or x64)
2. Check if Claude Code CLI is installed (install if not)
3. Install CC Desktop to /Applications

## Manual Install

- **Apple Silicon (M1/M2/M3)**: Double-click \`CC Desktop-${VERSION}-darwin-arm64.dmg\`
- **Intel**: Double-click \`CC Desktop-${VERSION}-darwin-x64.dmg\`

Then drag to Applications folder.

## Files

- \`CC Desktop-${VERSION}-darwin-arm64.dmg\` - Apple Silicon (156MB)
- \`CC Desktop-${VERSION}-darwin-x64.dmg\` - Intel (160MB)
- \`install.sh\` - One-click installer script
EOF

# 打包
echo "🗜️  Creating tarball..."
cd release
tar czf "cc-desktop-v${VERSION}-macos.tar.gz" "cc-desktop-v${VERSION}-macos"
cd ..

echo ""
echo "✅ Release package created successfully!"
echo ""
echo "📦 Package: release/cc-desktop-v${VERSION}-macos.tar.gz"
echo "📊 Size: $(du -h "release/cc-desktop-v${VERSION}-macos.tar.gz" | cut -f1)"
echo ""
echo "🎯 Contents:"
echo "   - CC Desktop-${VERSION}-darwin-arm64.dmg (Apple Silicon)"
echo "   - CC Desktop-${VERSION}-darwin-x64.dmg (Intel)"
echo "   - install.sh (Auto-detect installer)"
echo "   - README.md"
echo ""
echo "🚀 To test:"
echo "   tar xzf release/cc-desktop-v${VERSION}-macos.tar.gz"
echo "   cd cc-desktop-v${VERSION}-macos"
echo "   bash install.sh"
