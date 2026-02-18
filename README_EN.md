# CC Desktop

English | [中文](README.md)

A desktop launcher for Claude Code CLI + local desktop AI assistant.

## Features

- Multi-terminal session management with background running support
- Multiple API configuration management (official / proxy providers)
- Custom model mapping
- Visual management for Skills / Agents / Hooks / MCP
- Light/dark theme with 6 color schemes
- English and Chinese UI

## Quick Install

### Download from Release (Recommended)

**Windows**:
1. Download the [latest Windows installer package](https://github.com/hydroCoderClaud/cc-desktop/releases/latest)
2. Extract, then right-click PowerShell and select "Run as Administrator"
3. Run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

**macOS**:
1. Download the [latest macOS installer package](https://github.com/hydroCoderClaud/cc-desktop/releases/latest)
2. Extract, then run in Terminal:
   ```bash
   bash install.sh
   ```

**What the one-click installer does**:
- Optionally configures a proxy (recommended for users in China, default: http://127.0.0.1:15236)
- Automatically installs Claude Code CLI (official script first, npm as fallback)
- Provides detailed manual installation guidance on failure
- Automatically installs CC Desktop

### Manual Download

To install without the script, download the installer for your platform directly:

- **Windows**: `CC-Desktop-{version}-win32-x64.exe`
- **macOS (Apple Silicon)**: `CC-Desktop-{version}-darwin-arm64.dmg`
- **macOS (Intel)**: `CC-Desktop-{version}-darwin-x64.dmg`

You will still need to install Claude Code CLI manually (see "Prerequisites" below).

## Prerequisites

> **Note**: The one-click installer script automatically detects and installs all dependencies.

### ⚠️ Required Dependencies

**Node.js** (recommended):

| Mode | Required |
|------|----------|
| Terminal mode | ❌ Not required |
| Agent mode | ✅ **Required** (Agent SDK needs system Node.js) |

> **Note**: Even if you installed Claude CLI via the official binary, Agent mode still requires system Node.js.
>
> The one-click installer will detect Node.js and prompt you to install it if missing.

**Install Node.js**:
- **macOS**: `brew install node` or download from [https://nodejs.org/](https://nodejs.org/)
- **Windows**: `winget install OpenJS.NodeJS.LTS` or download from [https://nodejs.org/](https://nodejs.org/)

---

### Windows

#### 1. Install Node.js

Download and install the LTS version from [nodejs.org](https://nodejs.org/).

#### 2. Install Git Bash

Download and install from [git-scm.com](https://git-scm.com/download/windows).

After installation, add the Git Bash directory to your system PATH (usually `C:\Program Files\Git\bin`). Claude Code needs it for background file operations.

#### 3. Install Claude Code CLI

**Recommended** (official installer):

Run PowerShell as Administrator and execute:

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Alternative** (npm):

```powershell
npm install -g @anthropic-ai/claude-code
```

**Note**: If you encounter execution policy errors, run as Administrator:

```powershell
Set-ExecutionPolicy RemoteSigned
```

#### 4. Verify Installation

```powershell
claude --version
```

### macOS

#### 1. Install Node.js

Using Homebrew:

```bash
brew install node
```

Or download from [nodejs.org](https://nodejs.org/).

#### 2. Install Claude Code CLI

**Recommended** (official installer):

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Alternative** (npm):

```bash
npm install -g @anthropic-ai/claude-code
```

#### 3. Verify Installation

```bash
claude --version
```

## Install from Source (Developers)

```bash
git clone https://github.com/hydroCoderClaud/cc-desktop.git
cd cc-desktop
npm install
npm run dev
```

### Build

```bash
npm run build:win      # Windows
npm run build:mac      # macOS (full, for CI)
npm run build:mac:local  # macOS local (DMG only + installer package)
npm run build:win:local  # Windows local (EXE only + installer package)
```

Build output is in the `dist/` directory.

## Getting Started

### Step 1: Configure a Provider

Before first use, configure an API provider:

1. Click the **Settings icon** (bottom-left) → **Provider Management**
2. Available presets:
   - **Official API** — Anthropic official endpoint
   - **Zhipu AI / MiniMax / Qwen** — Compatible providers
   - **Proxy / Other** — Custom endpoints
3. Edit existing providers or add new ones

### Step 2: Create an API Configuration

1. Click **Settings** → **API Configuration**
2. Click **Add Configuration**
3. Fill in:
   - **Name**: A label for this config (e.g., "My Official API")
   - **Provider**: Select from Step 1
   - **API Key**: Your API key

#### Non-official Providers

When using a proxy or compatible API, select **"API Key + Token"** mode:

- **API URL**: The proxy endpoint (e.g., `https://your-proxy.com/v1`)
- **API Key**: Key used for actual API calls
- **Token**: Token for CLI authentication (usually the same as API Key)

#### Model Mapping (required for some providers)

1. Find the **Model Mapping** section at the bottom of the API config page
2. Map Claude model names (e.g., `claude-sonnet-4-20250514`) to the provider's actual model names

### Step 3: Connect to a Project

1. Click **Select Project** or drag a folder into the window
2. Click **Connect** to start a Claude Code session
3. Start chatting with Claude!

### Common Operations

| Action | Description |
|--------|-------------|
| `F12` | Toggle DevTools |
| Right-click tab | Close / manage session |
| Settings → Appearance | Switch theme and color scheme |
| Right panel | Manage Skills / Agents / Hooks / MCP |

### Notes

1. **API Key Security**: Keys are stored locally. Do not share your config file.
2. **Terminal Font**: Adjust font size in Settings.
3. **Multi-session**: Multiple terminal sessions can run simultaneously. Closing a tab keeps the session running in the background.
4. **Config file location**:
   - Windows: `%APPDATA%/cc-desktop/config.json`
   - macOS: `~/.config/cc-desktop/config.json`

## FAQ

### Q: Right panel tabs show no content after build?

A: Make sure `js-yaml` is installed correctly. Run `npm install` and rebuild.

### Q: Connection fails with "Claude Code CLI not found"?

A: Install Claude Code CLI first:

**Windows (Admin PowerShell)**:
```powershell
irm https://claude.ai/install.ps1 | iex
```

**macOS / Linux**:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Or via npm:
```bash
npm install -g @anthropic-ai/claude-code
```

### Q: Garbled characters in Windows terminal?

A: Ensure Git Bash is installed and added to PATH.

## Development

```bash
npm run dev          # Development mode
npm run build:win    # Windows build
npm run build:mac    # macOS build
npm test             # Run tests
```

## License

This project uses a custom license.

**Permitted**:
- Personal use, learning, and research
- Using this tool for software development (including commercial projects)

**Prohibited**:
- Commercial sale of this software
- Resale or commercial distribution

See [LICENSE](./LICENSE) for details.
