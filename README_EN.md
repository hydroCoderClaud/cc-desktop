# CC Desktop

English | [中文](README.md)

A desktop launcher for Claude Code CLI + local desktop AI assistant.

## 1. Overview

CC Desktop is a graphical desktop terminal for Claude Code CLI, offering two working modes:

- **Developer Mode**: Full CLI terminal interface with multi-session management and background running
- **Agent Mode**: Chat-based conversational interface with multimodal support (image recognition) and streaming output

Core features:

- Multiple API configuration management (official / proxy providers)
- Custom model mapping
- Visual management for Skills / Agents / Hooks / MCP / Plugins
- Light/dark theme with 6 color schemes
- English and Chinese UI

## 2. Prerequisites

### Windows

#### 1. Install Node.js

Download and install the LTS version from [nodejs.org](https://nodejs.org/).

Or install via command line:

```powershell
winget install OpenJS.NodeJS.LTS
```

#### 2. Install Git Bash

Download and install from [git-scm.com](https://git-scm.com/download/windows).

After installation, add the Git Bash directory to your system PATH (usually `C:\Program Files\Git\bin`). Claude Code needs it for background file operations.

#### 3. Install Claude Code CLI

**Recommended** (official installer):

Run PowerShell as Administrator and execute:

```powershell
irm https://claude.ai/install.ps1 | iex
```

> **Note**: If you encounter execution policy errors, run as Administrator first:
> ```powershell
> Set-ExecutionPolicy RemoteSigned
> ```

**Alternative** (npm):

```powershell
npm install -g @anthropic-ai/claude-code
```

#### 4. Verify Installation

```powershell
node --version
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

> The official installer automatically handles environment variable configuration.

**Alternative** (npm):

```bash
npm install -g @anthropic-ai/claude-code
```

#### 3. Verify Installation

```bash
node --version
claude --version
```

## 3. Install CC Desktop

### Option A: Release Download (Recommended)

Download the installer for your platform from [latest Release](https://github.com/hydroCoderClaud/cc-desktop/releases/latest).

#### Windows

1. Download `cc-desktop-*-windows.zip` and extract
2. Right-click PowerShell, select "Run as Administrator", navigate to the extracted directory
3. Run the one-click installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

#### macOS

1. Download `cc-desktop-*-macos.tar.gz` and extract
2. In Terminal, navigate to the extracted directory and run:
   ```bash
   bash install.sh
   ```

**What the installer script does**:
- Optionally configures a proxy (recommended for users in China, default: `http://127.0.0.1:15236`)
- Automatically detects Claude Code CLI; installs if missing
- Provides detailed manual installation guidance on failure
- Installs CC Desktop

#### macOS Security Note

On first launch, macOS may block the app with "cannot be opened because the developer cannot be verified". To fix this:

```bash
xattr -cr /Applications/CC\ Desktop.app
```

Or go to **System Settings → Privacy & Security**, find the blocked app message, and click "Open Anyway".

#### Manual Install

To install without the script, download the installer directly (ensure prerequisites from Section 2 are installed):

- **Windows**: `CC Desktop Setup *.exe`
- **macOS (Apple Silicon)**: `*-darwin-arm64.dmg`
- **macOS (Intel)**: `*-darwin-x64.dmg`

### Option B: Build from Source (Developers)

```bash
# Clone the repository
git clone https://github.com/hydroCoderClaud/cc-desktop.git
cd cc-desktop

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build:win    # Windows (full build, for CI)
npm run build:mac    # macOS (full build, for CI)
npm run build:win:local    # Windows local build (EXE + installer package)
npm run build:mac:local    # macOS local build (DMG + installer package)
```

Build output is in the `dist/` directory.

## 4. Getting Started

### Step 1: Configure a Provider

Before first use, configure an API provider:

1. Click the **Settings icon** (bottom-left) → **Provider Management**
2. Available presets:
   - **Official API** — Anthropic official endpoint
   - **Zhipu AI / MiniMax / Qwen** — Compatible providers (China)
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

> **Why is a Token needed?**
> Claude Code CLI requires a Token for authentication. The official API handles this automatically, but proxy services need manual configuration.

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
4. **Project Switching**: Disconnect the current session before switching projects.
5. **Config file location**:
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

## License

This project uses a custom license.

**Permitted**:
- Personal use, learning, and research
- Using this tool for software development (including commercial projects)

**Prohibited**:
- Commercial sale of this software
- Resale or commercial distribution

See [LICENSE](./LICENSE) for details.
