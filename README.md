# Hydro Desktop

[English](#english) | [中文](#中文) | [DingTalk Guide](docs/user-guide/DINGTALK-GUIDE.zh.md) | [Feishu Guide](docs/user-guide/FEISHU-GUIDE.zh.md) | [Enterprise Weixin Guide](docs/user-guide/ENTERPRISE-WEIXIN-GUIDE.zh.md)

---

<a id="english"></a>

## English

**Hydro Desktop** — An Electron-based desktop Agent workspace with a bundled runtime. Manage project-based Agent conversations, Notebook workspaces, capability settings, and IM bridges with a native desktop app.

Repository / package identifier: `cc-desktop`.

### Features

- **Agent + Notebook Workspace** — Project-based Agent chat with image recognition and streaming output, plus a Notebook workspace for source curation and achievement generation
- **MCP / Skills / Plugins / Agents / Hooks** — Extensible capability system with visual management, capability settings workbench, and a built-in marketplace
- **Built-in Plugin Runtime** — Plugin marketplace add/remove/refresh and plugin install/uninstall/update run in the desktop main process
- **API Profile Management** — Configure independent model profiles with a name, endpoint, credentials, model ID list, default model, timeout, and proxy settings
- **Multi-IM Bridge** — Bridge the desktop Agent to DingTalk, Feishu, and Enterprise Weixin for remote AI-assisted development, plus keep Weixin notification/chat support
- **Cross-Platform** — Windows & macOS, 6 color themes, light/dark mode, bilingual UI (English & Chinese)

### Quick Start

1. **Download** — Get the version from [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) and follow the installation guide
2. **Run** — Launch Hydro Desktop, configure a model profile, and start coding

> For detailed installation steps (Node.js, Git Bash, package install), see the full [Installation Guide](docs/INSTALL_EN.md).

### Usage

1. **Configure Model Profile** — Settings → Model Configuration → add or edit a model profile
2. **Set Credentials** — Enter the endpoint, authentication, and model IDs in the profile
3. **Connect** — Select a project folder → Connect → start chatting with the Agent

### FAQ

**Q: Garbled text in Windows terminal?**
Ensure Git Bash is installed and added to PATH.

**Q: Right panel empty after build?**
Run `npm install` to ensure `js-yaml` is installed, then rebuild.

### License

Custom license — personal use, learning, and development permitted; commercial sale and redistribution prohibited. See [LICENSE](./LICENSE).

---

<a id="中文"></a>

## 中文

**Hydro Desktop** — 基于 Electron 的桌面 Agent 工作台，提供项目化对话、Notebook 工作台、能力设置和 IM 桥接能力。

仓库 / 包名仍为 `cc-desktop`。

### 功能特性

- **Agent + Notebook 工作台** — 项目化 Agent 对话（图片识别、流式输出），以及 Notebook 资料整理与成果生成工作台
- **MCP / Skills / Plugins / Agents / Hooks** — 可扩展能力体系，可视化管理，内置组件市场与能力设置工作台
- **内建插件运行时** — 插件市场增删改查与插件安装、卸载、启停、更新已由桌面端主进程直接处理
- **模型配置管理** — 每个模型配置独立维护名称、图标、接口地址、密钥、模型 ID 列表、默认模型 ID、超时和代理参数
- **多 IM 桥接** — 将桌面 Agent 桥接到钉钉、飞书、企业微信，并保留微信通知 / 聊天能力
- **跨平台** — Windows & macOS，6 套配色方案，深色/浅色模式，中英文界面

### 快速开始

1. **下载** — 从 [Releases](https://github.com/hydroCoderClaud/cc-desktop/releases/latest) 页面获取版本按照指南安装
2. **运行** — 启动 Hydro Desktop，完成模型配置，开始编码

> 详细安装步骤（Node.js、Git Bash、安装包使用）请参阅完整 [安装指南](docs/INSTALL.md)。

### 使用入门

1. **配置模型** — 设置 → 模型配置 → 添加或编辑模型配置
2. **添加 API Key** — 在模型配置中填写密钥并测试连接
3. **连接项目** — 选择项目文件夹 → 连接 → 开始与 Agent 对话

### 常见问题

**Q: Windows 终端显示乱码？**
确保已安装 Git Bash 并添加到 PATH。

**Q: 打包后右侧面板无内容？**
运行 `npm install` 确保 `js-yaml` 已安装，然后重新打包。

### 许可证

自定义许可证 — 允许个人使用、学习和开发；禁止商业销售和再分发。详见 [LICENSE](./LICENSE)。
