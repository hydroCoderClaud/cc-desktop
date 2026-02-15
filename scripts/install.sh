#!/usr/bin/env bash
# ------------------------------------------------------------------
# CC Desktop installer for macOS / Linux
#
# Usage:  bash install.sh
# ------------------------------------------------------------------

set -euo pipefail

# --- helpers ------------------------------------------------------
step()  { printf '\n\033[36m>> %s\033[0m\n' "$*"; }
ok()    { printf '   \033[32m[OK]\033[0m %s\n' "$*"; }
warn()  { printf '   \033[33m[!]\033[0m %s\n' "$*"; }
err()   { printf '   \033[31m[ERROR]\033[0m %s\n' "$*"; }

detect_platform() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

# Reload PATH from shell profiles
refresh_path() {
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.bash_profile"; do
        if [ -f "$rc" ]; then
            # shellcheck disable=SC1090
            source "$rc" 2>/dev/null || true
        fi
    done
}

# ------------------------------------------------------------------
# 1. Detect Claude Code CLI
# ------------------------------------------------------------------
step "Detecting Claude Code CLI..."

if command -v claude &>/dev/null; then
    ver=$(claude --version 2>/dev/null || echo "unknown")
    ok "Claude CLI found: $ver"
else
    warn "Claude CLI not found. Installing..."

    # ------------------------------------------------------------------
    # 2. Install Claude Code CLI (official installer, fallback to npm)
    # ------------------------------------------------------------------
    step "Installing Claude Code CLI..."

    # Try official installer first
    if curl -fsSL https://claude.ai/install.sh | bash 2>/dev/null; then
        ok "Installed via official installer"
    else
        warn "Official installer failed (network/region issue), trying npm..."

        # Check if npm is available
        if ! command -v npm &>/dev/null; then
            err "npm not found. Please install Node.js first:"
            echo "  macOS: brew install node"
            echo "  or download from: https://nodejs.org/"
            exit 1
        fi

        # Install via npm
        if npm install -g @anthropic-ai/claude-code; then
            ok "Installed via npm"
        else
            err "Failed to install Claude CLI via both methods."
            echo ""
            echo "  Please install manually:"
            echo "    npm install -g @anthropic-ai/claude-code"
            echo ""
            exit 1
        fi
    fi

    # Refresh PATH so we can find the newly installed binary
    refresh_path
    export PATH="$HOME/.claude/local/bin:$HOME/.local/bin:$PATH"

    if command -v claude &>/dev/null; then
        ver=$(claude --version 2>/dev/null || echo "unknown")
        ok "Claude CLI installed successfully: $ver"
    else
        err "Claude CLI installation succeeded but 'claude' is not in PATH."
        echo "  Please restart your terminal and try again."
        exit 1
    fi
fi

# ------------------------------------------------------------------
# 3. Install CC Desktop
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM=$(detect_platform)

step "Looking for CC Desktop installer (platform: $PLATFORM)..."

install_macos() {
    # Detect system architecture
    local arch
    arch=$(uname -m)
    case "$arch" in
        arm64|aarch64) arch="arm64" ;;
        x86_64|amd64)  arch="x64" ;;
        *)
            warn "Unknown architecture: $arch"
            arch=""
            ;;
    esac

    # Look for .dmg in script dir or parent dir
    # Priority: 1) arch-specific DMG, 2) any CC Desktop DMG
    local dmg
    if [ -n "$arch" ]; then
        dmg=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name "*darwin-${arch}.dmg" -iname '*cc*desktop*' 2>/dev/null | head -n1)
    fi

    if [ -z "$dmg" ]; then
        dmg=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name '*.dmg' -iname '*cc*desktop*' 2>/dev/null | head -n1)
    fi

    if [ -z "$dmg" ]; then
        warn "No CC Desktop .dmg found in the current directory."
        echo "  Please download it from the releases page and install manually."
        return
    fi

    ok "Found: $(basename "$dmg")"
    step "Installing CC Desktop to /Applications..."

    local mount_point
    mount_point=$(hdiutil attach "$dmg" -nobrowse -noverify 2>/dev/null | grep '/Volumes/' | awk -F'\t' '{print $NF}')

    if [ -z "$mount_point" ]; then
        err "Failed to mount $dmg"
        echo "  Please double-click the .dmg file to install manually."
        return
    fi

    local app
    app=$(find "$mount_point" -maxdepth 1 -name '*.app' | head -n1)

    if [ -z "$app" ]; then
        err "No .app found inside the DMG."
        hdiutil detach "$mount_point" -quiet 2>/dev/null || true
        return
    fi

    local app_name
    app_name=$(basename "$app")

    # Remove old version if present
    if [ -d "/Applications/$app_name" ]; then
        warn "Removing existing /Applications/$app_name ..."
        rm -rf "/Applications/$app_name"
    fi

    cp -R "$app" /Applications/
    hdiutil detach "$mount_point" -quiet 2>/dev/null || true

    ok "Installed to /Applications/$app_name"
}

install_linux() {
    # Look for .AppImage in script dir or parent dir
    local appimage
    appimage=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name '*.AppImage' -iname '*cc*desktop*' 2>/dev/null | head -n1)

    if [ -z "$appimage" ]; then
        warn "No CC Desktop .AppImage found in the current directory."
        echo "  Please download it from the releases page and install manually."
        return
    fi

    ok "Found: $(basename "$appimage")"
    step "Installing CC Desktop to ~/Applications..."

    mkdir -p "$HOME/Applications"
    local dest="$HOME/Applications/$(basename "$appimage")"
    cp "$appimage" "$dest"
    chmod +x "$dest"

    ok "Installed to $dest"
    echo "  You can run it with: $dest"
}

case "$PLATFORM" in
    macos) install_macos ;;
    linux) install_linux ;;
    *)
        err "Unsupported platform: $(uname -s)"
        echo "  This script supports macOS and Linux only."
        exit 1
        ;;
esac

echo ""
printf '\033[36mDone.\033[0m\n'
