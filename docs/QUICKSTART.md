# 快速入门指南

## 5分钟上手 Hydro Desktop

### 步骤 1：安装依赖

```bash
cd C:\workspace\develop\HydroCoder\cc-desktop
npm install
```

### 步骤 2：启动开发模式

```bash
npm run dev
```

应用窗口会自动打开，并显示 `Hydro Desktop` 主界面。

### 步骤 3：添加或选择一个项目

1. 在左侧项目面板中选择已有项目，或按界面提示添加一个项目目录。
2. 确认项目路径有效后，再创建会话或打开终端。

### 步骤 4：启动会话

1. 选中项目后点击 **连接** / **Connect**。
2. 桌面端会创建 Claude 会话，并在终端中自动启动 `claude`。
3. 如果只想打开纯终端而不启动 Claude，会话列表旁可使用单独的终端入口。

### 步骤 5：开始使用

- **Developer 模式**：在终端中直接执行命令。
- **Agent 模式**：切换到 Agent，对话发送需求。
- **Notebook 模式**：在 Notebook 工作台整理资料、对话和产出。
- **能力管理**：打开 `settings-workbench`，可管理目录上下文来源、桌面端定时任务和微信通知。

如果机器上还没有 `claude` 命令，请先完成 [INSTALL.md](./INSTALL.md) 中的 CLI 安装步骤。

---

## 常见操作

### 配置 API

1. 点击右上角的 API 配置入口，打开 **API 配置管理** 窗口。
2. 新增或编辑 Profile，填写 API Key、服务商、模型 ID 和代理等信息。
3. 点击 **测试连接** 确认配置可用。

**配置文件位置**：
- Windows：`%APPDATA%\cc-desktop\config.json`
- macOS：`~/Library/Application Support/cc-desktop/config.json`
- Linux：`~/.config/cc-desktop/config.json`

### 切换主题

点击左下角的主题按钮即可在浅色和深色方案之间切换。

### 切换项目或会话

1. 在左侧切换项目。
2. 对目标项目点击 **连接**，或恢复历史会话。
3. 运行中的 Claude 会话会自动绑定到对应项目目录。

### 使用桌面端定时任务

1. 在 Agent 会话中直接描述你的定时任务需求，模型会优先调用 Hydro Desktop 内置定时任务 MCP。
2. 或打开 **能力管理** → **定时任务**，手动创建、编辑、立即执行和查看运行记录。
3. 定时任务执行时会复用 Agent 会话能力，并把运行历史写入本地数据库。
4. 如果是在内嵌 app 当前会话里创建且选择“当前会话”绑定，后续任务会跟随该 app 的当前会话；当该 app 当前没有会话时，本次执行会跳过，不会默默回落成普通后台会话。

### 使用微信通知

1. 打开 **能力管理** → **微信通知**。
2. 让接收通知的微信用户扫码授权，然后发送第一条消息完成目标捕获。
3. 捕获完成后，可以：
   - 在该页面发送测试通知
   - 在 Agent / Notebook 聊天工具栏里直接发微信
   - 在定时任务中通过内置微信通知 MCP 主动推送结果

### 使用飞书、钉钉与企业微信

1. 飞书：配置飞书应用后，可在飞书中直接发起对话，也可从桌面端主动发送给联系人或群聊。
2. 钉钉：配置钉钉应用、机器人能力、通讯录权限和 `robotCode` 后，可在钉钉中直接发起对话，也可从桌面端主动发送给成员。
3. 企业微信：配置智能机器人后，可在企业微信中直接发起对话；如需桌面端主动发送成员，还需完成 `wecom-cli` 初始化。
4. 三端当前支持文本、图片，以及文档附件（`pdf/doc/docx/xls/xlsx/ppt/pptx`）的入站和出站。
5. 从 IM 发来的文档会保存到对应会话工作目录的 `im_attachments/` 下；在右侧文件预览中，PDF 可直接预览，Office 文档复用 Notebook 预览能力。
6. 从桌面端主动发送文档时，可在会话工具栏选择 IM 目标并附加文件；也可以在会话内要求 Agent 使用内置 MCP `im_send` 的 `filePaths` 发送本地绝对路径文件。
7. 三条 IM 通道的统一手工回归可参考 [IM-REGRESSION-CHECKLIST.zh.md](./user-guide/IM-REGRESSION-CHECKLIST.zh.md)。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `F12` | 切换开发者工具 |
| `Ctrl + C` | 在终端中发送 SIGINT |
| `Ctrl + V` | 在终端中粘贴 |

---

## 故障排除

### 问题：终端无法启动

可能是 `node-pty` 安装失败。可尝试：

```bash
npm install node-pty --force
npm rebuild node-pty
```

### 问题：找不到 `claude` 命令

1. 按 [INSTALL.md](./INSTALL.md) 安装 Claude Code CLI。
2. 确认 `claude --version` 可以在系统终端中正常执行。

### 问题：API 配置修改后没有影响现有会话

运行中的会话不会热切换 API 配置。请新建会话，或重新连接对应会话后再验证新配置。

### 问题：手动配置文件后不生效

1. 检查配置文件路径是否是 `cc-desktop`，而不是旧的 `claude-code-desktop`。
2. 检查 JSON 结构是否使用 `apiProfiles` 和 `defaultProfileId`。
3. 修改后重新启动应用。

---

## 下一步

- 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解整体架构
- 阅读 [BUILD.md](./BUILD.md) 查看构建与打包流程
- 阅读 [API-CONFIG-GUIDE.zh.md](./user-guide/API-CONFIG-GUIDE.zh.md) 了解 API Profile 结构
- 阅读 [WEIXIN-GUIDE.zh.md](./user-guide/WEIXIN-GUIDE.zh.md) 了解微信通知与双向聊天能力
- 阅读 [FEISHU-GUIDE.zh.md](./user-guide/FEISHU-GUIDE.zh.md) 了解飞书桥接能力
- 阅读 [DINGTALK-GUIDE.zh.md](./user-guide/DINGTALK-GUIDE.zh.md) 了解钉钉桥接能力
- 阅读 [ENTERPRISE-WEIXIN-GUIDE.zh.md](./user-guide/ENTERPRISE-WEIXIN-GUIDE.zh.md) 了解企业微信桥接能力
- 阅读 [IM-REGRESSION-CHECKLIST.zh.md](./user-guide/IM-REGRESSION-CHECKLIST.zh.md) 执行三通统一回归测试
