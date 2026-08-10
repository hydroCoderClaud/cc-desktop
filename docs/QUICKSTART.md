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
2. 确认项目路径有效后，再创建 Agent 会话。

### 步骤 4：启动会话

1. 选中项目后创建新对话。
2. 桌面端会为真实项目目录创建 Agent 会话，并使用内置 Agent runtime。
3. 后续继续对话时，会按项目身份恢复对应会话上下文。

### 步骤 5：开始使用

- **Agent 模式**：在项目目录中对话发送需求。
- **Notebook 工作台**：从左下角设置菜单的“内嵌应用”中打开 Notebook，在独立窗口整理资料、对话和产出。
- **能力管理**：打开 `settings-workbench`，可管理目录上下文来源、桌面端定时任务和微信通知。

Agent runtime 随桌面端内置，不需要用户额外安装系统命令。

---

## 常见操作

### 模型配置

1. 点击右上角的模型配置入口，打开 **模型配置** 窗口。
2. 新增或编辑模型配置，填写配置名称、接口地址、默认模型、模型 ID 列表、密钥和代理等信息。
3. 点击 **测试连接** 确认配置可用。
4. 模型列表区域可点击拉取按钮自动获取端点模型 ID；如果端点不支持模型列表接口，也可以手动添加或删除。

**配置文件位置**：
- Windows：`%APPDATA%\cc-desktop\config.json`
- macOS：`~/Library/Application Support/cc-desktop/config.json`
- Linux：`~/.config/cc-desktop/config.json`

**运行配置目录**：

- 默认固定为 `~/.hydrocoder/agent`，用于保存运行时 MCP、Skills、Agents、Plugins、Settings 和会话 JSONL。
- 应用启动时会自动创建该目录，并为本程序启动的 Agent runtime 注入 `CLAUDE_CONFIG_DIR`。
- 老版本升级时会把旧 `~/.claude/projects` 下缺失的会话历史复制到 `~/.hydrocoder/agent/projects`；迁移只复制缺失文件，不修改 `sessions.db`、会话 `cwd` 或项目目录。

### 切换主题

点击左下角的主题按钮即可在浅色和深色方案之间切换。

### 切换项目或会话

1. 在左侧切换项目。
2. 对目标项目点击 **连接**，或恢复历史会话。
3. 运行中的 Agent 会话会自动绑定到对应项目目录。

### 使用 Notebook 工作台

1. 在主窗口左下角打开设置菜单，选择 **内嵌应用** → **Notebook**。该菜单用于集中管理工作台入口，Notebook 本身不是通用 embedded app。
2. Notebook 会在独立工作台窗口中打开；再次选择 Notebook 时会聚焦既有窗口，不会重复创建窗口。
3. 在工作台中创建、选择或管理笔记本，资料源、成果和对话仍属于该 Notebook，不会进入普通 Agent 会话列表。
4. 使用工作台顶部的“返回主窗口”时，会先聚焦主窗口并关闭当前工作台视图；这不会删除笔记本或主动关闭其会话。

若某个 Notebook 已绑定 IM，会话恢复会自动打开或聚焦同一个工作台窗口。相同 IM 会话的重复事件不会产生多个 Notebook 窗口。

> 当前限制：当 Notebook B 正在生成或等待交互时，不要通过 IM 恢复不同的 Notebook A。不同 Notebook 之间的前台切换调度尚未实现；应等待当前工作台空闲后再切换。

### 使用桌面端定时任务

1. 在 Agent 会话中直接描述你的定时任务需求，模型会优先调用 Hydro Desktop 内置定时任务 MCP。
2. 或打开 **能力管理** → **定时任务**，手动创建、编辑、立即执行和查看运行记录。
3. 定时任务执行时会复用 Agent 会话能力，并把运行历史写入本地数据库。
4. 如果是在内嵌 app 当前会话里创建且选择“当前会话”绑定，后续任务会跟随该 app 的当前会话；当该 app 当前没有会话时，本次执行会跳过，不会默默回落成普通后台会话。

### 使用会话应用

1. 在 Agent 会话里点击工具栏的会话应用按钮，或输入 `/session-app`。
2. 桌面会生成一张会话应用配置卡片，你可以补充名称、说明、启动消息、系统提示词和默认工作目录。
3. 确认时可选择：
   - 仅保存到会话应用
   - 立即创建一个新的应用会话
4. 你也可以在 **能力管理** → **会话应用** 中集中管理、复制、删除、查看关联会话并再次启动。
5. 会话应用的默认工作目录会先落在全局 Agent 输出目录下的 `sessionapp` 基础目录；每次真正启动新应用会话时，会再自动创建一个随机子目录，避免不同运行实例互相覆盖。

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

---

## 故障排除

### 问题：Agent runtime 无法启动

桌面端默认使用内置 Agent runtime。请先确认依赖安装和构建产物完整，再查看应用日志中的 runtime 路径、版本与启动错误。

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
- 阅读 [API-CONFIG-GUIDE.zh.md](./user-guide/API-CONFIG-GUIDE.zh.md) 了解模型配置结构
- 阅读 [WEIXIN-GUIDE.zh.md](./user-guide/WEIXIN-GUIDE.zh.md) 了解微信通知与双向聊天能力
- 阅读 [FEISHU-GUIDE.zh.md](./user-guide/FEISHU-GUIDE.zh.md) 了解飞书桥接能力
- 阅读 [DINGTALK-GUIDE.zh.md](./user-guide/DINGTALK-GUIDE.zh.md) 了解钉钉桥接能力
- 阅读 [ENTERPRISE-WEIXIN-GUIDE.zh.md](./user-guide/ENTERPRISE-WEIXIN-GUIDE.zh.md) 了解企业微信桥接能力
- 阅读 [IM-REGRESSION-CHECKLIST.zh.md](./user-guide/IM-REGRESSION-CHECKLIST.zh.md) 执行三通统一回归测试
