# CC Desktop Installation Guide

[← Back to README](../README.md)

## 1. Prerequisites

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

## 2. Install CC Desktop

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

To install without the script, download the installer directly (ensure prerequisites from Section 1 are installed):

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
