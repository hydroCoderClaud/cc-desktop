# CC Desktop

[English](README_EN.md) | 中文

Claude Code CLI 的桌面启动器 + 终端模拟器。

## 功能特点

- 多终端会话管理，支持后台运行
- 多 API 配置管理，支持官方/中转服务商
- 自定义模型映射
- Skills / Agents / Hooks / MCP 可视化管理
- 深色/浅色主题，6 套配色方案
- 中英文界面

## 快速安装

### 从 Release 下载（推荐）

**Windows**：
1. 下载 [最新版本 Windows 安装包](https://github.com/hydroCoderClaud/cc-desktop/releases/latest)
2. 解压后，右键 PowerShell "以管理员身份运行"
3. 执行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

**macOS**：
1. 下载 [最新版本 macOS 安装包](https://github.com/hydroCoderClaud/cc-desktop/releases/latest)
2. 解压后，在终端执行：
   ```bash
   bash install.sh
   ```

**一键安装脚本功能**：
- 可选配置代理（国内用户推荐，默认 http://127.0.0.1:15236）
- 自动安装 Claude Code CLI（官方脚本优先，失败则可用 npm）
- 安装失败时提供详细的手动安装指引
- 自动安装 CC Desktop

### 手动下载

如果不使用安装脚本，可以直接下载对应平台的安装包：

- **Windows**：`CC Desktop Setup 1.6.40.exe`
- **macOS (Apple Silicon)**：`CC Desktop-1.6.40-darwin-arm64.dmg`
- **macOS (Intel)**：`CC Desktop-1.6.40-darwin-x64.dmg`

但仍需手动安装 Claude Code CLI（见下方"安装前提"）。

## 安装前提

> **提示**：如果使用上方的"快速安装"中的一键安装脚本，脚本会自动检测并安装依赖。

### ⚠️ 重要依赖说明

**Node.js**（推荐安装）：

- **Terminal 模式**：❌ 不需要
- **Agent 模式**：✅ **必需**（Agent SDK 需要调用系统 Node.js 环境）

> **注意**：即使使用官方二进制方式安装 Claude CLI，Agent 模式仍然需要系统 Node.js。
>
> 一键安装脚本会自动检测 Node.js，如未安装会提示并协助安装。

**安装方式**：
- **macOS**: `brew install node` 或下载 [https://nodejs.org/](https://nodejs.org/)
- **Windows**: `winget install OpenJS.NodeJS.LTS` 或下载 [https://nodejs.org/](https://nodejs.org/)

---

### Windows

#### 1. 安装 Node.js

从 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

#### 2. 安装 Git Bash

从 [Git 官网](https://git-scm.com/download/windows) 下载并安装。

安装后将 Git Bash 目录添加到系统 PATH 环境变量（通常是 `C:\Program Files\Git\bin`）。Claude Code 需要用它执行后台文件操作。

#### 3. 安装 Claude Code CLI

**推荐方式**（官方安装脚本）：

以管理员身份运行 PowerShell，执行：

```powershell
irm https://claude.ai/install.ps1 | iex
```

**替代方式**（npm 安装）：

```powershell
npm install -g @anthropic-ai/claude-code
```

**注意**：首次在 Windows 上运行 PowerShell 脚本可能遇到执行策略限制。如果报错，以管理员身份运行：

```powershell
Set-ExecutionPolicy RemoteSigned
```

#### 4. 验证安装

```powershell
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

**替代方式**（npm 安装）：

```bash
npm install -g @anthropic-ai/claude-code
```

> 官方安装脚本会自动处理环境变量配置，推荐使用。

#### 3. 验证安装

```bash
claude --version
```

## 从源码安装（开发者）

### 下载源码

```bash
git clone https://github.com/hydroCoderClaud/cc-desktop.git
cd cc-desktop
```

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

打包后的安装文件在 `dist` 目录中。

## 使用入门

### 第一步：配置服务商

首次使用前，需要先配置 API 服务商：

1. 点击左下角 **设置图标** → **服务商管理**
2. 预设服务商包括：
   - **官方 API** - Anthropic 官方接口
   - **智谱AI** / **MiniMax** / **阿里千问** - 国内兼容服务商
   - **代理服务** / **其他** - 自定义中转服务
3. 可以编辑现有服务商或添加新的服务商

### 第二步：创建 API 配置

1. 点击左下角 **设置图标** → **API 配置管理**
2. 点击 **添加配置**
3. 填写配置信息：
   - **配置名称**：给配置起个名字（如"我的官方API"）
   - **服务商**：选择第一步配置的服务商
   - **API Key**：填写你的 API 密钥

#### 非官方服务商配置要点

使用中转服务商或兼容 API 时，**请选择「API Key + Token」模式**：

- **API URL**：中转服务的地址（如 `https://your-proxy.com/v1`）
- **API Key**：用于实际 API 调用的密钥
- **Token**：用于 CLI 认证的令牌（通常与 API Key 相同或由服务商提供）

> **为什么需要 Token？**
> Claude Code CLI 的认证机制需要 Token 来验证身份。官方 API 自动处理，但中转服务需要手动配置。

#### 模型映射（中转服务商必填）

如果服务商需要模型映射：

1. 在 API 配置页面底部找到「**模型映射**」区域
2. 将 Claude 模型名（如 `claude-sonnet-4-20250514`）映射到服务商实际模型名

### 第三步：连接项目

1. 点击 **选择项目** 或直接将文件夹拖入窗口
2. 点击 **连接** 按钮启动 Claude Code 会话
3. 开始与 Claude 对话！

### 常用操作

| 操作 | 说明 |
|------|------|
| `F12` | 打开/关闭开发者工具 |
| 右键标签页 | 关闭/管理会话 |
| 设置 → 外观 | 切换主题和配色 |
| 右侧面板 | 管理 Skills / Agents / Hooks / MCP |

### 注意事项

1. **API Key 安全**：密钥存储在本地配置文件中，请勿分享配置文件
2. **终端字体**：可在设置中调整终端字体大小
3. **多会话**：支持同时运行多个终端会话，关闭标签页后会话可在后台继续运行
4. **项目切换**：切换项目前建议先断开当前连接
5. **配置文件位置**：
   - Windows: `%APPDATA%/cc-desktop/config.json`
   - macOS: `~/.config/cc-desktop/config.json`

## 常见问题

### Q: 打包后右侧面板 Tab 无内容显示？

A: 确保 `js-yaml` 依赖已正确安装。运行 `npm install` 后重新打包。

### Q: 连接失败提示 "未找到 Claude Code CLI"？

A: 确保已安装 Claude Code CLI。推荐使用官方安装脚本：

**Windows（管理员权限 PowerShell）**：
```powershell
irm https://claude.ai/install.ps1 | iex
```

**macOS / Linux**：
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

或使用 npm 安装：
```bash
npm install -g @anthropic-ai/claude-code
```

### Q: Windows 上终端显示乱码？

A: 确保系统已安装 Git Bash 并添加到 PATH。

## 开发

```bash
npm run dev          # 开发模式
npm run build:win    # Windows 构建
npm run build:mac    # macOS 构建
npm test             # 运行测试
```

## 许可证

本项目采用自定义许可证。

**允许**：
- 个人使用、学习和研究
- 使用本工具进行编程开发（包括商业项目的开发工作）

**禁止**：
- 将本软件用于商业销售
- 转售或商业分发本软件

详见 [LICENSE](./LICENSE) 文件。
