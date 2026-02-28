# CC Desktop

[English](#english) | [中文](#中文) | [DingTalk Guide](docs/user-guide/DINGTALK-GUIDE.zh.md)

---

<a id="english"></a>

## English

**CC Desktop** — An Electron-based desktop AI assistant and terminal emulator for Claude Code CLI. Manage AI-powered coding sessions with a native desktop app featuring dual-mode architecture: Terminal mode (PTY direct connection) and Agent mode (streaming chat with vision support).

### Features

- **Terminal + Agent Dual Mode** — Full CLI terminal with multi-session management, plus an AI chat interface with image recognition and streaming output
- **MCP / Skills / Plugins / Agents / Hooks** — Extensible capability system with visual management and a built-in marketplace
- **Multi-Provider API Management** — Configure multiple API providers (Anthropic official, proxies, compatible endpoints) with custom model mapping
- **DingTalk Bot Integration** — Bridge Claude Code to DingTalk for remote AI-assisted development via mobile
- **Cross-Platform** — Windows & macOS, 6 color themes, light/dark mode, bilingual UI (English & Chinese)

### Quick Start

1. **Download** — Get the latest release from [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest)
2. **Install Claude Code CLI** — Required dependency ([Installation Guide](docs/INSTALL_EN.md))
3. **Run** — Launch CC Desktop, configure your API provider, and start coding

> For detailed installation steps (Node.js, Git Bash, CLI setup), see the full [Installation Guide](docs/INSTALL_EN.md).

### Usage

1. **Configure Provider** — Settings → Provider Management → select or add a provider
2. **Add API Key** — Settings → API Configuration → add your key
3. **Connect** — Select a project folder → Connect → start chatting with Claude

### FAQ

**Q: "Claude Code CLI not found"?**
Install the CLI: `irm https://claude.ai/install.ps1 | iex` (Windows) or `curl -fsSL https://claude.ai/install.sh | bash` (macOS)

**Q: Garbled text in Windows terminal?**
Ensure Git Bash is installed and added to PATH.

**Q: Right panel empty after build?**
Run `npm install` to ensure `js-yaml` is installed, then rebuild.

### License

Custom license — personal use, learning, and development permitted; commercial sale and redistribution prohibited. See [LICENSE](./LICENSE).

---

<a id="中文"></a>

## 中文

**CC Desktop** — 基于 Electron 的桌面 AI 助手与终端模拟器，为 Claude Code CLI 提供图形化界面。双模式架构：Terminal 模式（PTY 直连 CLI）+ Agent 模式（流式对话，支持图片识别）。

### 功能特性

- **Terminal + Agent 双模式** — 完整 CLI 终端 + 多会话管理，以及 AI 对话界面（图片识别、流式输出）
- **MCP / Skills / Plugins / Agents / Hooks** — 可扩展能力体系，可视化管理，内置组件市场
- **多服务商 API 管理** — 支持官方 API、中转服务、兼容端点，自定义模型映射
- **钉钉机器人集成** — 将 Claude Code 桥接到钉钉，通过手机远程进行 AI 辅助开发
- **跨平台** — Windows & macOS，6 套配色方案，深色/浅色模式，中英文界面

### 快速开始

1. **下载** — 从 [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) 获取最新版本
2. **安装 Claude Code CLI** — 必需依赖（[安装指南](docs/INSTALL.md)）
3. **运行** — 启动 CC Desktop，配置 API 服务商，开始编码

> 详细安装步骤（Node.js、Git Bash、CLI 配置）请参阅完整 [安装指南](docs/INSTALL.md)。

### 使用入门

1. **配置服务商** — 设置 → 服务商管理 → 选择或添加服务商
2. **添加 API Key** — 设置 → API 配置管理 → 添加密钥
3. **连接项目** — 选择项目文件夹 → 连接 → 开始与 Claude 对话

### 常见问题

**Q: 提示"未找到 Claude Code CLI"？**
安装 CLI：`irm https://claude.ai/install.ps1 | iex`（Windows）或 `curl -fsSL https://claude.ai/install.sh | bash`（macOS）

**Q: Windows 终端显示乱码？**
确保已安装 Git Bash 并添加到 PATH。

**Q: 打包后右侧面板无内容？**
运行 `npm install` 确保 `js-yaml` 已安装，然后重新打包。

### 许可证

自定义许可证 — 允许个人使用、学习和开发；禁止商业销售和再分发。详见 [LICENSE](./LICENSE)。
