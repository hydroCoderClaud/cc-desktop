# 渲染进程代码索引

> CC Desktop v1.7.37+ | [← 架构总览](../ARCHITECTURE.md)

## 概览

| 类别 | 文件数 | 总行数 |
|------|--------|--------|
| 页面（Pages） | 90 | ~30,100 |
| 共享组件 | 6 | 728 |
| Composables | 21 | 4,596 |
| 样式 | 3 | 376 |
| 主题 | 1 | 296 |
| 工具函数 | 2 | 185 |
| 国际化 | 3 | 2,798 |
| **合计** | **126** | **~39,100** |

技术栈：Vue 3 (Composition API) + Naive UI + xterm.js

---

## 页面目录

11 个独立 BrowserWindow 页面，各有独立 `index.html` + `main.js` + `App.vue` 入口。

| 页面 | 路径 | 用途 |
|------|------|------|
| main | `pages/main/` | 主窗口（终端 + Agent 对话） |
| notebook | `pages/notebook/` | Notebook 工作台（资料源 / 成果 / 对话） |
| dingtalk-settings | `pages/dingtalk-settings/` | 钉钉机器人配置 |
| session-manager | `pages/session-manager/` | 会话管理器（浏览/搜索/标签） |
| provider-manager | `pages/provider-manager/` | 服务商管理 |
| profile-manager | `pages/profile-manager/` | API Profile 管理 |
| custom-models | `pages/custom-models/` | 自定义模型管理 |
| global-settings | `pages/global-settings/` | 全局设置 |
| appearance-settings | `pages/appearance-settings/` | 外观设置（主题/配色） |
| settings-workbench | `pages/settings-workbench/` | 能力设置工作台（目录上下文来源整理） |
| update-manager | `pages/update-manager/` | 更新管理器 |

---

## 主页组件树

```
App.vue (60行) — NaiveUI Provider + 主题初始化 + 更新监听
└── MainContent.vue (1147行) — 布局容器、Tab/面板/模式切换
    ├── LeftPanel.vue (1646行) — 项目列表 + 会话列表 + 模式切换
    │   └── AgentLeftContent.vue (483行) — Agent 对话列表/历史
    │       └── AgentNewConversationModal.vue (265行) — 新建对话弹窗
    ├── TabBar.vue (279行) — 顶部 Tab 栏
    ├── Center（内容区）
    │   ├── TerminalTab.vue (431行) — xterm.js 终端
    │   └── AgentChatTab.vue (590行) — Agent 对话主视图
    │       ├── ChatInput.vue (1610行) — 聊天输入（能力快捷/图片粘贴/文件拖放）
    │       ├── MessageBubble.vue (388行) — 消息气泡（Markdown/代码块）
    │       ├── ToolCallCard.vue (208行) — 工具调用卡片（可展开/预览）
    │       ├── StreamingIndicator.vue (131行) — 流式输出指示器
    │       └── CapabilityModal.vue (513行) — 能力管理弹窗（MCP 启闭）
    ├── RightPanel/ (207行 index.vue) — Developer 模式右侧面板
    │   ├── TabBar.vue (127行) — 面板 Tab 栏
    │   ├── QuickCommands.vue (664行) — 快捷命令面板
    │   ├── QuickInput.vue (203行) — 快捷输入框
    │   ├── MessageQueue.vue (807行) — 消息队列管理
    │   └── tabs/ — 9 个功能 Tab（见下文）
    ├── AgentRightPanel/ (584行 index.vue) — Agent 模式右侧面板
    │   ├── FileTreeHeader.vue (127行) — 目录头部
    │   ├── FileTree.vue (69行) — 文件树容器
    │   ├── FileTreeNode.vue (185行) — 文件节点（递归）
    │   ├── FileTreeContextMenu.vue (144行) — 右键菜单
    │   └── FilePreview.vue (767行) — 文件预览（代码/图片/文本）
    ├── UpdateModal.vue (268行) — 更新提示弹窗
    └── ProjectEditModal.vue (270行) — 项目编辑弹窗
```

---

## RightPanel 9 个 Tab

| Tab | 文件 | 行数 | 职责 |
|-----|------|------|------|
| Skills | `tabs/SkillsTab.vue` | 400 | Skill 列表/安装/启禁 |
| Agents | `tabs/AgentsTab.vue` | 409 | Agent 列表/安装/启禁 |
| Hooks | `tabs/HooksTab.vue` | 569 | Hooks 编辑/管理 |
| MCP | `tabs/MCPTab.vue` | 398 | MCP 服务器管理 |
| Plugins | `tabs/PluginsTab.vue` | 824 | 插件管理/市场 |
| Settings | `tabs/SettingsTab.vue` | 505 | CLI 设置（权限/环境变量） |
| AI | `tabs/AITab.vue` | 964 | AI 模型/参数配置 |
| Prompts | `tabs/PromptsTab.vue` | 925 | 提示词管理/标签 |
| Commands | — | — | 通过 QuickCommands 实现 |

### Tab 子组件

**Skills 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `skills/SkillGroup.vue` | 241 | Skill 分组列表 |
| `skills/SkillEditModal.vue` | 394 | 编辑弹窗 |
| `skills/SkillImportModal.vue` | 396 | 导入弹窗 |
| `skills/SkillExportModal.vue` | 188 | 导出弹窗 |
| `skills/SkillCopyModal.vue` | 213 | 复制弹窗 |
| `skills/MarketList.vue` | 279 | 市场列表 |
| `skills/ComponentMarketModal.vue` | 616 | 组件市场安装弹窗 |
| `skills/McpEnvConfigModal.vue` | 243 | MCP 环境变量配置 |

**Agents 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `agents/AgentGroup.vue` | 254 | Agent 分组列表 |
| `agents/AgentEditModal.vue` | 488 | 编辑弹窗 |
| `agents/AgentImportModal.vue` | 420 | 导入弹窗 |
| `agents/AgentExportModal.vue` | 206 | 导出弹窗 |
| `agents/AgentCopyModal.vue` | 211 | 复制弹窗 |

**Hooks 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `hooks/HookGroup.vue` | 292 | Hook 分组列表 |
| `hooks/HookEditModal.vue` | 469 | Hook 编辑弹窗 |

**MCP 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `mcp/MCPGroup.vue` | 229 | MCP 服务器分组 |
| `mcp/MCPEditModal.vue` | 213 | 编辑弹窗（兼容 Claude Desktop 格式） |
| `mcp/MCPCopyModal.vue` | 127 | 复制弹窗 |
| `mcp/McpProxyModal.vue` | 215 | 代理配置弹窗 |

**Plugins 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `plugins/PluginMarketModal.vue` | 720 | 插件市场弹窗 |

**Settings 子组件**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `settings/PermissionsGroup.vue` | 225 | 权限分组 |
| `settings/PermissionEditModal.vue` | 152 | 权限编辑弹窗 |
| `settings/EnvGroup.vue` | 228 | 环境变量分组 |
| `settings/EnvEditModal.vue` | 116 | 环境变量编辑弹窗 |
| `settings/RawJsonModal.vue` | 263 | JSON 原始编辑弹窗 |

**Commands 子组件**：`commands/CommandEditModal.vue` (114行) — 命令编辑弹窗

---

## Agent 核心组件

### ChatInput.vue (1610行)

最大的单组件。职责：

- 多行文本输入，自动高度调整
- `Ctrl+Enter` / `Shift+Enter` 发送
- 图片粘贴 / 文件拖放 → base64 预览
- 能力快捷调用（`/` 触发 capability 列表）
- 模型选择、Token 计数显示
- 历史消息上下翻

### MessageBubble.vue (388行)

- 用户/助手/系统消息气泡
- Markdown 渲染（代码高亮、表格、链接）
- 工具调用结果内联展示
- 消息操作（复制、重试、删除）

### CapabilityModal.vue (513行)

- 按类型（skill/agent/plugin/mcp）分组展示
- 安装/卸载操作（插件支持市场自动注册）
- MCP 实时启闭（通过 `queryGenerator.toggleMcpServer`）
- 搜索过滤、分类筛选

### ToolCallCard.vue (208行)

- 工具名称 + 参数折叠展示
- 结果预览（文本截断 + 展开）
- 文件路径点击跳转（AgentRightPanel 文件预览）

### StreamingIndicator.vue (131行)

- 流式输出动画指示
- Token 用量实时显示

---

## 独立页面组件

### session-manager（会话管理器）

| 文件 | 行数 | 职责 |
|------|------|------|
| `SessionManagerContent.vue` | 893 | 主布局（三列：项目/会话/消息） |
| `SessionList.vue` | 325 | 会话列表（过滤/排序/标签） |
| `MessageViewer.vue` | 493 | 消息详情查看器 |
| `ProjectList.vue` | 158 | 项目选择列表 |
| `TagManager.vue` | 122 | 标签管理弹窗 |
| `composables/useSessionManager.js` | 533 | 单例状态管理（项目/会话/消息/标签/同步） |
| `styles/tag-dropdown.css` | 150 | 标签下拉样式 |

### dingtalk-settings（钉钉配置）

`DingTalkSettingsContent.vue` (235行) — Stream 模式配置（AppKey/AppSecret/RobotCode）

### provider-manager（服务商管理）

`ProviderManagerContent.vue` (274行) — 服务商 CRUD

### profile-manager（Profile 管理）

| 文件 | 行数 | 职责 |
|------|------|------|
| `ProfileManagerContent.vue` | 257 | Profile 列表/默认切换 |
| `ProfileFormModal.vue` | 450 | Profile 表单弹窗 |

### custom-models（自定义模型）

`CustomModelsContent.vue` (310行) — 模型列表/添加/编辑

### global-settings（全局设置）

`GlobalSettingsContent.vue` (295行) — 语言/路径/CLI 配置

### appearance-settings（外观设置）

`AppearanceSettingsContent.vue` (298行) — 主题/配色方案选择

### update-manager（更新管理器）

`UpdateManagerContent.vue` (478行) — 下载进度/安装控制/macOS 手动安装

---

## 共享组件

`src/renderer/components/`：

| 文件 | 行数 | 职责 | 使用者 |
|------|------|------|--------|
| `icons/Icon.vue` | 55 | SVG 图标组件 | 全局 |
| `icons/index.js` | 200 | 101 个图标 SVG 路径定义 | Icon.vue |
| `DeleteConfirmModal.vue` | 72 | 通用删除确认弹窗 | 多页面 |
| `ModelForm.vue` | 134 | 模型表单（名称/ID/参数） | custom-models, profile-manager |
| `ProfileCard.vue` | 137 | Profile 卡片展示 | profile-manager |
| `ProviderCard.vue` | 130 | 服务商卡片展示 | provider-manager |

---

## Composables

`src/renderer/composables/` — 21 个组合式函数：

| 文件 | 行数 | 关键导出 | 使用者 |
|------|------|---------|--------|
| `useAgentChat.js` | 660 | `useAgentChat`, `MessageRole` | AgentChatTab |
| `useSessionPanel.js` | 493 | `useSessionPanel` | AgentLeftContent, LeftPanel |
| `useTheme.js` | 444 | `useTheme`, 6 套配色 | App.vue (全局) |
| `useTabManagement.js` | 415 | `useTabManagement`, 双数组模式 | MainContent |
| `useProjects.js` | 332 | `useProjects` | MainContent, LeftPanel |
| `useMessageQueue.js` | 331 | `useMessageQueue` | MessageQueue |
| `usePrompts.js` | 327 | `usePrompts` | PromptsTab |
| `useAgentFiles.js` | 260 | `useAgentFiles`, `formatFileSize` | AgentRightPanel |
| `useAgentPanel.js` | 225 | `useAgentPanel`, `isSessionClosed` | LeftPanel, MainContent |
| `useLocale.js` | 151 | `useLocale` (t 函数) | 全局 |
| `useProfiles.js` | 144 | `useProfiles` | ProfileManager, LeftPanel |
| `useSessionUtils.js` | 134 | `SessionStatus`, `SessionType`, `createTabFromSession` | Tab 管理 |
| `useIPC.js` | 112 | `useIPC` (invoke/silentInvoke) | 几乎所有 composable |
| `useProviders.js` | 111 | `useProviders` | ProviderManager, ProfileForm |
| `useValidation.js` | 107 | `ensureArray`, `isValidProject`, `isValidSession` | 多处 |
| `useCustomModels.js` | 101 | `useCustomModels` | CustomModels |
| `useAppMode.js` | 86 | `useAppMode`, `AppMode` | MainContent, LeftPanel |
| `useFormatters.js` | 62 | `formatDate`, `formatTime`, `formatDuration` | 多处 |
| `constants.js` | 47 | `TAG_COLORS`, `AGENT_COLORS` | 标签/Agent 相关 |
| `useEscapeParser.js` | 37 | `parseEscapeSequences`, `trimControlCodes` | HooksTab |
| `useClickOutside.js` | 17 | `vClickOutside` 指令 | 下拉菜单 |

---

## 共享资源

### 样式 (`src/renderer/styles/`)

| 文件 | 行数 | 用途 |
|------|------|------|
| `common.css` | 140 | 全局基础样式（滚动条、过渡动画） |
| `settings-common.css` | 177 | 设置页面通用样式（表单、卡片） |
| `tag-common.css` | 59 | 标签通用样式 |

### 主题 (`src/renderer/theme/`)

`claude-theme.js` (296行) — Naive UI 主题覆盖（light/dark），含颜色/圆角/间距/组件级定制。

### 工具函数 (`src/renderer/utils/`)

| 文件 | 行数 | 用途 |
|------|------|------|
| `image-utils.js` | 140 | 图片 base64 转换、格式检测、压缩 |
| `mcp-env-utils.js` | 45 | MCP 环境变量占位符检测 |

### 国际化 (`src/renderer/locales/`)

| 文件 | 行数 | 说明 |
|------|------|------|
| `index.js` | 19 | 语言包注册（默认 en-US） |
| `zh-CN.js` | 1,392 | 中文翻译 |
| `en-US.js` | 1,387 | 英文翻译 |

---

## 关键架构模式

### 双数组 Tab 管理

`useTabManagement.js` 使用 `tabs[]` + `allTabs[]` 双数组：关闭 Tab 只从 `tabs` 移除（UI 隐藏），组件保留在 `allTabs` 中（xterm buffer 不丢失），重新打开时恢复终端内容。

### 全局单例 Composable

`useAppMode`、`useLocale`、`useTheme` 使用模块级 `ref`（非函数内），实现跨组件状态共享。`useSessionManager`（session-manager 页面）也采用此模式。

### IPC 调用封装

所有渲染进程 IPC 调用通过 `useIPC().invoke()` 统一封装，自动处理 loading/error 状态。浏览器环境提供 mock 数据用于开发。

### 图标系统

101 个 SVG 图标统一定义在 `icons/index.js`，通过 `<Icon name="xxx" :size="20" />` 组件使用，基于 20x20 viewBox stroke-based 设计。
