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

detect_macos_arch() {
    case "$(uname -m)" in
        arm64|aarch64) echo "arm64" ;;
        x86_64|amd64)  echo "x64" ;;
        *)             echo "" ;;
    esac
}

get_package_arch() {
    for marker in "$SCRIPT_DIR/installer-arch.txt" "$SCRIPT_DIR/../installer-arch.txt"; do
        if [ -f "$marker" ]; then
            tr -d '[:space:]' < "$marker"
            return
        fi
    done
    echo ""
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
# 1. Check Node.js (required for Agent mode)
# ------------------------------------------------------------------
step "Checking Node.js..."

NODE_AVAILABLE=false
if command -v node &>/dev/null; then
    NODE_AVAILABLE=true
    node_ver=$(node --version 2>/dev/null || echo "unknown")
    ok "Node.js found: $node_ver"
else
    warn "Node.js not found"
    echo ""
    echo "  📌 Node.js 依赖说明："
    echo "    • Terminal 模式：不需要（可正常使用）"
    echo "    • Agent 模式：必需（需要系统 Node.js 环境）"
    echo ""
    printf "  是否现在安装 Node.js？(y/N): "
    read -r install_node

    if [[ "$install_node" == "y" || "$install_node" == "Y" ]]; then
        if command -v brew &>/dev/null; then
            step "Installing Node.js via Homebrew..."
            if brew install node; then
                NODE_AVAILABLE=true
                node_ver=$(node --version 2>/dev/null || echo "unknown")
                ok "Node.js installed: $node_ver"
            else
                err "Failed to install Node.js via Homebrew"
            fi
        else
            warn "Homebrew not found"
            echo ""
            echo "  请手动安装 Node.js："
            echo "    下载地址: https://nodejs.org/"
            echo ""
            echo "  安装完成后重新运行此脚本以启用 Agent 模式"
        fi
    fi

    if [[ "$NODE_AVAILABLE" != "true" ]]; then
        warn "继续安装（Agent 模式将不可用）"
        echo ""
    fi
fi

# ------------------------------------------------------------------
# 2. Install CC Desktop
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM=$(detect_platform)

step "Looking for CC Desktop installer (platform: $PLATFORM)..."

install_macos() {
    local arch
    arch=$(detect_macos_arch)
    local package_arch
    package_arch=$(get_package_arch)

    if [ -z "$arch" ]; then
        warn "Unknown architecture: $(uname -m)"
    fi

    if [ -n "$package_arch" ] && [ -n "$arch" ] && [ "$package_arch" != "$arch" ]; then
        err "This installer package is for ${package_arch}, but this Mac is ${arch}."
        echo "  Please download the ${arch} installer package instead."
        return 1
    fi

    # Look for .dmg in script dir or parent dir
    # Priority: 1) package-locked DMG, 2) arch-specific DMG, 3) any CC Desktop DMG
    local dmg
    if [ -n "$package_arch" ]; then
        dmg=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name "*darwin-${package_arch}.dmg" -iname '*cc*desktop*' 2>/dev/null | head -n1)
    elif [ -n "$arch" ]; then
        dmg=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name "*darwin-${arch}.dmg" -iname '*cc*desktop*' 2>/dev/null | head -n1)
    fi

    if [ -z "$dmg" ] && [ -z "$package_arch" ]; then
        dmg=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/.." -maxdepth 1 -name '*.dmg' -iname '*cc*desktop*' 2>/dev/null | head -n1)
    fi

    if [ -z "$dmg" ]; then
        warn "No matching CC Desktop .dmg found in the current directory."
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
        warn "检测到已安装 $app_name"
        echo ""
        printf "  是否覆盖安装？(y/N): "
        read -r replace_app

        if [[ "$replace_app" != "y" && "$replace_app" != "Y" ]]; then
            echo ""
            echo "安装已取消。"
            hdiutil detach "$mount_point" -quiet 2>/dev/null || true
            return
        fi

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
