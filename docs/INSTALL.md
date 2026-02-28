# CC Desktop 安装指南

[← 返回 README](../README.md)

## 一、环境依赖安装

### Windows

#### 1. 安装 Node.js

从 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

或通过命令行安装：

```powershell
winget install OpenJS.NodeJS.LTS
```

#### 2. 安装 Git Bash

从 [Git 官网](https://git-scm.com/download/windows) 下载并安装。

安装后将 Git Bash 目录添加到系统 PATH 环境变量（通常是 `C:\Program Files\Git\bin`）。Claude Code 需要用它执行后台文件操作。

#### 3. 安装 Claude Code CLI

**推荐方式**（官方安装脚本）：

以管理员身份运行 PowerShell，执行：

```powershell
irm https://claude.ai/install.ps1 | iex
```

> **注意**：首次运行 PowerShell 脚本可能遇到执行策略限制。如果报错，先以管理员身份运行：
> ```powershell
> Set-ExecutionPolicy RemoteSigned
> ```

**备选方式**（npm 安装）：

```powershell
npm install -g @anthropic-ai/claude-code
```

#### 4. 验证安装

```powershell
node --version
claude --version
```

### macOS

#### 1. 安装 Node.js

使用 Homebrew 安装：

```bash
brew install node
```

或从 [Node.js 官网](https://nodejs.org/) 下载安装包。

#### 2. 安装 Claude Code CLI

**推荐方式**（官方安装脚本）：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

> 官方安装脚本会自动处理环境变量配置，推荐使用。

**备选方式**（npm 安装）：

```bash
npm install -g @anthropic-ai/claude-code
```

#### 3. 验证安装

```bash
node --version
claude --version
```

## 二、安装 CC Desktop

### 方式 A：Release 版本安装（推荐）

从 [最新版本 Release](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) 下载对应平台安装包。

#### Windows

1. 下载 `cc-desktop-*-windows.zip`，解压
2. 右键 PowerShell「以管理员身份运行」，进入解压目录
3. 执行一键安装脚本：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

#### macOS

1. 下载 `cc-desktop-*-macos.tar.gz`，解压
2. 在终端进入解压目录，执行一键安装脚本：
   ```bash
   bash install.sh
   ```

**一键安装脚本功能**：
- 可选配置代理（国内用户推荐，默认 `http://127.0.0.1:15236`）
- 自动检测 Claude Code CLI，未安装时自动安装
- 安装失败时提供详细的手动安装指引
- 自动安装 CC Desktop

#### macOS 安全提示

首次打开时，macOS 可能提示"无法打开，因为无法验证开发者"。解决方法：

```bash
xattr -cr /Applications/CC\ Desktop.app
```

或者打开 **系统设置 → 隐私与安全性**，找到被阻止的提示，点击「仍要打开」。

#### 手动安装

如果不使用安装脚本，可直接下载对应安装包双击安装（需提前完成第一节的环境依赖安装）：

- **Windows**：`CC Desktop Setup *.exe`
- **macOS (Apple Silicon)**：`*-darwin-arm64.dmg`
- **macOS (Intel)**：`*-darwin-x64.dmg`

### 方式 B：源码编译安装（开发者）

```bash
# 下载源码
git clone https://github.com/hydroCoderClaud/cc-desktop.git
cd cc-desktop

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 打包
npm run build:win    # Windows（完整构建，用于 CI）
npm run build:mac    # macOS（完整构建，用于 CI）
npm run build:win:local    # Windows 本地构建（EXE + 安装包）
npm run build:mac:local    # macOS 本地构建（DMG + 安装包）
```

打包后的安装文件在 `dist` 目录中。
