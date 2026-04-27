# Hydro Desktop

[English](#english) | [中文](#中文) | [DingTalk Guide](docs/user-guide/DINGTALK-GUIDE.zh.md)

---

<a id="english"></a>

## English

**Hydro Desktop** — An Electron-based desktop Agent workspace and terminal emulator for Claude Code CLI. Manage coding sessions with a native desktop app featuring three work modes: Developer mode (PTY direct connection), Agent mode (streaming chat with vision support), and Notebook mode (source/achievement workspace for structured generation).

Repository / package identifier: `cc-desktop`.

### Features

- **Developer + Agent + Notebook** — Full CLI terminal with multi-session management, Agent chat with image recognition and streaming output, plus a Notebook workspace for source curation and achievement generation
- **MCP / Skills / Plugins / Agents / Hooks** — Extensible capability system with visual management, capability settings workbench, and a built-in marketplace
- **Built-in Plugin Runtime** — Plugin marketplace add/remove/refresh and plugin install/uninstall/update now run in the desktop main process instead of shelling out to `claude plugin ...`
- **Multi-Provider API Management** — Configure multiple API providers (Anthropic official, proxies, compatible endpoints) with provider-level default model mapping and per-profile default model IDs
- **DingTalk Bot Integration** — Bridge Claude Code to DingTalk for remote AI-assisted development via mobile
- **Cross-Platform** — Windows & macOS, 6 color themes, light/dark mode, bilingual UI (English & Chinese)

### Quick Start

1. **Download** — Get the version from [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) and follow the installation guide
2. **Run** — Launch Hydro Desktop, configure your API provider, and start coding

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

**Hydro Desktop** — 基于 Electron 的桌面 Agent 工作台与终端模拟器，为 Claude Code CLI 提供图形化界面。三种工作模式：Developer 模式（PTY 直连 CLI）、Agent 模式（流式对话，支持图片识别）、Notebook 模式（资料源/成果工作台）。

仓库 / 包名仍为 `cc-desktop`。

### 功能特性

- **Developer + Agent + Notebook 三模式** — 完整 CLI 终端 + 多会话管理、Agent 对话界面（图片识别、流式输出），以及 Notebook 资料整理与成果生成工作台
- **MCP / Skills / Plugins / Agents / Hooks** — 可扩展能力体系，可视化管理，内置组件市场与能力设置工作台
- **内建插件运行时** — 插件市场增删改查与插件安装、卸载、启停、更新已由桌面端主进程直接处理，不再依赖 `claude plugin ...`
- **多服务商 API 管理** — 支持官方 API、中转服务、兼容端点，按服务商维护默认模型映射，并为 Profile 指定默认模型 ID
- **钉钉机器人集成** — 将 Claude Code 桥接到钉钉，通过手机远程进行 AI 辅助开发
- **跨平台** — Windows & macOS，6 套配色方案，深色/浅色模式，中英文界面

### 快速开始

1. **下载** — 从 [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) 页面获取版本按照指南安装
2. **运行** — 启动 Hydro Desktop，配置 API 服务商，开始编码

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
