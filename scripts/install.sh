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
# 2. Detect Claude Code CLI
# ------------------------------------------------------------------
step "Detecting Claude Code CLI..."

if command -v claude &>/dev/null; then
    ver=$(claude --version 2>/dev/null || echo "unknown")
    ok "Claude CLI found: $ver"
else
    warn "Claude CLI not found. Installing..."

    # ------------------------------------------------------------------
    # 3. Proxy configuration (for official installer)
    # ------------------------------------------------------------------
    echo ""
    echo "  官方安装脚本需要访问 https://claude.ai"
    echo "  如果在国内环境，建议配置代理以提高成功率。"
    echo ""
    printf "  是否配置代理？(y/N): "
    read -r use_proxy

    if [[ "$use_proxy" == "y" || "$use_proxy" == "Y" ]]; then
        printf "  请输入代理地址 [http://127.0.0.1:15236]: "
        read -r proxy_url
        proxy_url=${proxy_url:-http://127.0.0.1:15236}

        export http_proxy="$proxy_url"
        export https_proxy="$proxy_url"
        ok "已设置代理: $proxy_url"
    fi

    # ------------------------------------------------------------------
    # 4. Install Claude Code CLI (official installer)
    # ------------------------------------------------------------------
    step "Installing Claude Code CLI..."

    # Try official installer
    if curl -fsSL https://claude.ai/install.sh | bash 2>/dev/null; then
        ok "Installed via official installer"
        CLI_INSTALLED=true
    else
        warn "Official installer failed."
        CLI_INSTALLED=false

        # Try npm if available
        if command -v npm &>/dev/null; then
            echo ""
            printf "  是否尝试使用 npm 安装？(y/N): "
            read -r use_npm

            if [[ "$use_npm" == "y" || "$use_npm" == "Y" ]]; then
                if npm install -g @anthropic-ai/claude-code; then
                    ok "Installed via npm"
                    CLI_INSTALLED=true
                else
                    warn "npm installation also failed."
                fi
            fi
        fi
    fi

    # Refresh PATH if installed
    if [ "$CLI_INSTALLED" = true ]; then
        # Add common bin paths
        export PATH="/usr/local/bin:$HOME/.local/bin:$HOME/.claude/local/bin:$PATH"

        # Try to verify, but don't fail if not found immediately
        if command -v claude &>/dev/null; then
            ver=$(claude --version 2>/dev/null || echo "unknown")
            ok "Claude CLI installed successfully: $ver"
        else
            warn "Claude CLI installed. If 'claude' command not found, please restart terminal."
        fi
    else
        # CLI installation failed, offer to continue with Desktop only
        echo ""
        warn "Claude CLI 自动安装失败。"
        echo ""
        echo "  可以先安装 CC Desktop，稍后手动安装 Claude CLI："
        echo ""
        echo "  【方式 1】使用代理 + 官方脚本（推荐）"
        echo "    export https_proxy=http://your-proxy:port"
        echo "    curl -fsSL https://claude.ai/install.sh | bash"
        echo ""
        echo "  【方式 2】使用 npm（需要 Node.js）"
        echo "    npm install -g @anthropic-ai/claude-code"
        echo ""
        printf "  是否继续仅安装 CC Desktop？(y/N): "
        read -r continue_desktop

        if [[ "$continue_desktop" != "y" && "$continue_desktop" != "Y" ]]; then
            echo ""
            echo "安装已取消。"
            exit 1
        fi
    fi
fi

# ------------------------------------------------------------------
# 5. Install CC Desktop
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
