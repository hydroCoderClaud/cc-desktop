# 渲染进程与 UI 设计

> Hydro Desktop v1.7.69+ | [← 架构总览](../ARCHITECTURE.md) | [代码索引 →](../code-index/renderer.md)

技术栈：Vue 3 (Composition API) + Naive UI

---

## 页面架构

当前渲染进程共有 **15 个 BrowserWindow 页面入口**，均采用独立的 `index.html` → `main.js` 入口链；其中传统桌面页面、管理/设置页面与内嵌 app 页面分层管理。所有页面共享 composables、主题系统和国际化资源（通过 Vite alias 引用）。

### 主窗口

| 页面 | 用途 |
|------|------|
| **main** | 主窗口，承载 Agent 工作台核心交互 |

### 13 个传统桌面与管理页面

| 页面类型 | 数量 | 说明 |
|------|------|------|
| 主窗口 | 1 | `main`，承载 Agent 工作台核心交互 |
| 独立管理窗口 | 12 | notebook、各类 settings/manager 页面，主进程单例管理 |

### 12 个独立管理窗口

| 页面 | 用途 | 打开方式 |
|------|------|---------|
| notebook | 独立 Notebook 工作台（三栏：资料源 / 成果 / 对话） | 主窗口菜单 / Notebook 入口 |
| channel-settings | IM 渠道总览与配置入口 | 主窗口菜单 |
| dingtalk-settings | 钉钉机器人配置（AppKey/Secret/RobotCode） | 主窗口菜单 |
| feishu-settings | 飞书机器人配置 | 主窗口菜单 |
| enterprise-weixin-settings | 企业微信机器人配置 | 主窗口菜单 |
| model-settings | 模型设置 | 主窗口菜单 |
| provider-manager | 服务商 CRUD | 设置 / Profile 表单 |
| profile-manager | API Profile 管理（默认切换，内联维护模型 ID） | 左侧面板 Profile 选择器 |
| global-settings | 全局设置（语言、路径等基础配置） | 主窗口菜单 |
| appearance-settings | 外观设置（主题/配色方案选择） | 主窗口菜单 |
| settings-workbench | 能力设置工作台（目录上下文来源整理 / 定时任务管理 / 微信通知） | 主窗口与 Notebook 工具入口 |
| update-manager | 更新管理（下载进度/安装控制） | 发现新版本时自动打开 |

窗口通过 `window.electronAPI.openXxxManager()` → IPC `window:openXxxManager` 打开，主进程保证单例（同一窗口不重复创建）。独立窗口间通过 **设置广播机制** 同步状态（详见 [跨窗口广播](#跨窗口广播机制)）。

### 2 个内嵌 App 页面

| 页面 | 用途 | 打开方式 |
|------|------|---------|
| embedded-app-demo | 内嵌 app 示例页面 | `embedded-app:list` / `embedded-app:open` |
| hydrology-workbench | 水文站工作台，内嵌右侧 Agent 与工作目录 | `embedded-app:list` / `embedded-app:open` |

内嵌 app 也运行在独立 `BrowserWindow` 中，但与 notebook、settings 这一类管理窗口不同，它们遵循统一的内嵌 app 注册表、运行态桥接和 Agent 能力注入约定。详细标准见 [内嵌 App 设计与实现标准](./embedded-app/embedded-app-development-standard.md)。

> 完整组件列表与行数统计见 → [code-index/renderer.md](../code-index/renderer.md)

---

## 主窗口三栏布局

```
┌──────────┬─────────────────────┬──────────────┐
│          │      TabBar         │              │
│  Left    ├─────────────────────┤    Right     │
│  Panel   │                     │    Panel     │
│          │   Center Content    │              │
│          │    (Agent Chat)     │              │
│          │                     │              │
└──────────┴─────────────────────┴──────────────┘
```

**MainContent.vue** (1292 行) 是布局容器，管理三栏的显隐与拖拽：

| 区域 | 组件 | 职责 |
|------|------|------|
| 左栏 | `LeftPanel` + `AgentLeftContent` | 项目化 Agent 对话列表 |
| 中栏 | `TabBar` + 内容区 | Tab 切换 + Agent 对话渲染 |
| 右栏 | `AgentRightPanel` | 当前会话工作目录文件浏览器 |

三栏均可折叠：左/右栏折叠后显示窄条（collapsed strip），点击展开。右栏宽度支持鼠标拖拽调整（`startResize` mousedown）。双面板一键折叠/展开按钮（`toggleBothPanels`）。

### 工作台隔离

MainContent 当前以 **Agent 工作台** 为主。Notebook 作为独立工作台窗口保留，能力设置通过 settings-workbench 独立窗口承载。Agent 区域继续使用 **`v-show`（非 `v-if`）** 避免会话切换时 remount。

**设计原因**：`v-if` 会销毁组件，导致：
1. Agent 的 IPC 流式事件监听器断开
2. 对话滚动位置、输入状态无法保留
3. 文件树和预览状态在会话切换时丢失

---

## Agent 模式 UI

### 对话列表

`AgentLeftContent` (483 行) 管理 Agent 对话的创建与切换：

- **新建对话**：触发 `AgentNewConversationModal` (265 行)，支持选择项目目录、API Profile
- **对话列表**：分"活跃/历史"两组，显示标题和时间，支持重命名/关闭/删除

由 `useAgentPanel` composable 管理对话列表状态，通过模块级 `closedSessionIds` Set 跟踪已关闭会话（防止队列误消费）。

### 聊天界面

`AgentChatTab` (774 行) 是对话主视图：

```
┌─────────────────────────┐
│     消息列表（滚动）      │
│  ┌───────────────────┐  │
│  │  MessageBubble    │  │  ← 用户/助手消息
│  │  ToolCallCard     │  │  ← 工具调用卡片
│  │  StreamingIndicator│  │  ← 流式输出动画
│  └───────────────────┘  │
│  [外部 IM 观察模式提示条]  │  ← dingtalk / weixin 类型
├─────────────────────────┤
│     ChatInput            │  ← 输入框
└─────────────────────────┘
```

**消息渲染流程**：

1. `useAgentChat` 监听 IPC `agent:stream` 事件，按 content block 类型分发
2. `text` delta → 追加到当前助手消息；`tool_use` → 创建工具调用卡片
3. `messages` ref 数组驱动 `v-for`，按 `msg.role` 分派到不同组件
4. 历史会话恢复后显示分隔线（`isRestored` 标记）

#### MessageBubble (388 行)

- **用户消息**：文本 + 附带图片缩略图
- **助手消息**：Markdown 渲染（代码高亮、表格、链接），操作按钮（复制/重试/删除）
- 图片/链接点击 → 事件冒泡 → `AgentRightPanel` 文件预览

#### ToolCallCard (208 行)

- 工具名称 + 参数折叠展示
- 文件路径可点击（`preview-path` 事件 → 右侧文件预览）
- 结果文本截断，点击展开完整内容

#### ChatInput (870 行)

最大的单组件，职责：

- 多行文本输入，高度自适应
- `Ctrl+Enter` / `Shift+Enter` 发送
- 图片粘贴 / 文件拖放 → base64 预览缩略图
- `/` 触发 capability 快捷列表（skill/agent/plugin 调用）
- API 配置与模型切换 — 工具栏上以图标按钮形式显示 API 配置和当前模型，hover 显示当前值，点击弹出选择列表。候选项来自当前服务商 `defaultModels` 与 Profile 的 `selectedModelId`，实时通过 `setAgentModel` IPC 同步。切换逻辑统一在 `ChatInputToolbar.vue` 中
- 工具栏支持快捷创建定时任务草案，以及向已绑定微信目标直接发送消息
- Token 计数显示、历史消息上下翻

### 外部 IM 会话表现

当前 Agent 聊天界面已同时承载普通桌面对话，以及通过 `sessionImChannel` 标记的外部 IM 观察/绑定会话：

- `isExternalImChannel(sessionImChannel)` 为真时显示对应 IM 观察提示条
- 桌面端已激活的 IM 绑定会话保持 slash command 可用；`enableSlashCommands` 只受 `hasActiveSession` 控制
- 来自外部 IM 的用户消息会带来源标记；微信消息与图片也会实时注入聊天区

### Notebook 对话面板

Notebook 的 `ChatPanel` 已复用 Agent 聊天核心能力：

- 继续使用 `useAgentChat` 处理流式消息与历史恢复
- 已接入微信监听，能在 Notebook 内显示微信回流消息
- 继续复用 `ChatInput`，因此同样具备微信快捷发送入口
- Notebook 当前只补齐微信显示与发送，不改变其资料整理、成果生成主流程

### 内嵌 App 右侧 Agent 宿主

`EmbeddedAgentPanel.vue` 是内嵌 app 复用主聊天能力的标准宿主组件，当前已在 `hydrology-workbench` 中落地。它不是主窗口 `AgentRightPanel` 的复制品，而是针对 embedded client 单独封装的一层宿主。

当前固定结构：

- 顶部平行 tab：`工作台助手` / `工作目录`
- 助手页复用 `AgentChatTab`
- 工作目录页复用 `WorkspaceFilePanel`
- 通过 `useEmbeddedAgentFiles()` 把 embedded 文件 API 适配成共享文件面板数据模型
- 通过图标按钮承载上下文 tip、会话能力面板、新建会话

当前约束：

- `工作台助手` 与 `工作目录` 是同级 tab，不再把工作目录开关嵌在助手内部
- `AgentChatTab` 继续复用聊天输入、工具栏、微信通知、模型切换、交互请求处理
- `WorkspaceFilePanel` 继续复用文件树、预览、保存、插入路径等能力
- 内嵌 app 只负责提供 `contextProvider` 与 `commandHandler`，不重写共享聊天 UI
- embedded 面板负责把“当前会话”持续同步回主进程；这个 current 指针不是只在首次创建时写一次
- `/clear` 在 embedded 语义里不是“清空消息列表”，而是“清空并重建会话”，因此后续 current 绑定定时任务会自动跟到新会话
- 顶部 `+` 按钮与 `AgentChatTab` 内部 clear/recreate 路径都属于“切到新的当前会话”

### 水文工作台内嵌实现

当前水文工作台右侧面板接入方式：

1. `hydrology-workbench/index.html` 预留 `hydrologyAgentPanel` 挂载点
2. `agent-panel.js` 调用 `mountHydrologyAgentPanel()`
3. `main.js` 内的 `notifyAgentContextChanged(force)` 在站点、功能页、审核任务等状态变化后同步上下文
4. `createEmbeddedAppRuntimeBridge(window.hydroAgent, { appId, getContext, commandHandler })` 负责：
   - 把当前业务上下文同步到主进程
   - 接收 Agent 发起的受控命令并回调页面逻辑
5. `EmbeddedAgentPanel.vue` 负责：
   - 复用最近 session 或创建新 session
   - 在 `create/reopen/clear/new session` 后调用 `setCurrentAgentSession`
   - 把该 app 的当前 session 指针持续同步给主进程运行态

这套结构是后续内嵌 app 的推荐基线，不再建议为单个 app 单独复制聊天组件或文件树组件。

#### StreamingIndicator (131 行)

流式输出时显示动画点 + 已用时间，由 `isStreaming` 状态控制。

### 文件浏览器

`AgentRightPanel` (584 行) 显示当前会话工作目录的文件树：

```
┌──────────────────────┐
│  FileTreeHeader      │  ← 目录路径 + 刷新/隐藏文件/资源管理器
├──────────────────────┤
│  FileTree            │  ← 递归 FileTreeNode 渲染
│  ├── src/            │
│  │   ├── main/       │
│  │   └── ...         │
├──────────────────────┤
│  FilePreview         │  ← 代码/图片/文本预览（可最大化）
└──────────────────────┘
```

| 组件 | 行数 | 职责 |
|------|------|------|
| FileTreeHeader | 127 | 目录头部：路径、刷新、隐藏文件切换、打开资源管理器 |
| FileTree | 69 | 容器组件，接收 entries 数据 |
| FileTreeNode | 185 | 递归渲染目录/文件节点，展开/折叠/选中 |
| FileTreeContextMenu | 144 | 右键菜单（复制路径/打开/插入路径到输入框） |
| FilePreview | 767 | 代码高亮/图片/文本预览，支持最大化模式 |

文件操作由 `useAgentFiles` (260 行) composable 管理，通过 IPC 调用主进程读取文件系统。详见 → [design/main-process.md](./main-process.md) Agent 文件操作部分。

### Notebook 工具市场交互

Notebook 工作室右上角的创作工具市场入口由 `StudioPanel` 触发，市场弹窗负责远端工具列表的搜索、标签筛选、安装与卸载交互。

当前稳定的前端行为约定：
- **长列表可滚动浏览**：当市场工具数量增加时，用户可以在弹窗内继续滚动查看后续卡片，而不是只看到首屏内容。
- **安装超时兜底**：创作工具安装在长时间无响应时会结束加载态并提示超时，避免界面长期停留在“安装中”。
- **红点提醒语义**：市场入口红点表示“远端存在本地未安装的新工具，或本地已安装工具存在更高版本”，不再只表示更新。

这些约定属于 Notebook 市场的用户可见行为，应在后续重构中保持一致。

---

## Tab 管理双数组模式

`useTabManagement` 使用**双数组架构**保持 Agent 对话组件状态：

```javascript
const tabs = ref([])      // TabBar 显示的 tabs（用户可见）
const allTabs = ref([])   // 所有组件实例（包括后台的）
```

### 设计原因

关闭 Agent 对话 Tab 不应立即销毁组件；保留在 `allTabs` 中可避免重新打开时重复初始化对话状态和历史消息。

### 操作流程

| 操作 | tabs[] | allTabs[] | 组件状态 |
|------|--------|-----------|---------|
| 打开会话 | push | push | 创建 + 挂载 |
| **关闭 Tab**（`closeAgentTab`） | splice 移除 | **保留** | v-show 隐藏，对话状态保留 |
| **重新打开** (`ensureAgentTab`) | push 回来 | 已存在 | v-show 显示，内容恢复 |
| **关闭会话** (`closeAgentTabFully`) | splice 移除 | splice 移除 | **组件销毁** |

### 关闭 Tab vs 关闭会话

- **关闭 Tab**：仅从 `tabs` 移除（UI 隐藏），组件保留在 `allTabs`，后台会话继续运行
- **关闭会话**：同时从 `tabs` 和 `allTabs` 移除，组件销毁。重新打开时重建组件并触发历史消息分隔线

### 模式切换时的 Tab 隔离

切换模式时记录当前模式的 `activeTabId`，恢复目标模式上次的 `activeTabId`。`ensureActiveTabInCurrentMode()` 确保 `activeTabId` 始终指向当前模式的 Tab，防止跨模式误操作。

---

## Composables 架构

### 全局单例模式

部分 composable 将状态定义在**模块作用域**（函数外部），实现跨组件共享：

```javascript
// useAppMode.js — 模块级状态
const appMode = ref(AppMode.DEVELOPER)  // 函数外部，全局唯一

export function useAppMode() {
  // 任何组件 import 后共享同一个 ref
  return { appMode: readonly(appMode), ... }
}
```

采用此模式的 composable：`useAppMode`、`useTheme`（isDark/colorScheme）、`useLocale`（currentLocale）、`useAgentPanel`（closedSessionIds）。

**设计原因**：这些状态需要在不同组件树层级间同步（如 LeftPanel 切换模式 → MainContent 响应）。Vue 的 provide/inject 要求共同祖先，而模块级 ref 天然单例，无需 Pinia/Vuex。

### 按职责分组

**应用级状态**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useAppMode` | 86 | 固定 Agent 工作台模式并兼容旧配置 |
| `useTheme` | 444 | 深浅模式 + 6 套配色，CSS 变量注入 |
| `useLocale` | 151 | i18n 翻译函数 `t()`，zh-CN / en-US |

**对话与会话**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useAgentChat` | 660 | 单个 Agent 对话的消息/流式/模型切换 |
| `useAgentPanel` | 225 | Agent 对话列表 + 会话关闭标记 |
| `useSessionUtils` | 134 | 会话状态枚举、Tab 创建辅助 |

**Tab 与文件**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useTabManagement` | 415 | 双数组 Tab 管理 |
| `useAgentFiles` | 260 | Agent 文件树操作 |

**数据管理**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useProjects` | 332 | 项目 CRUD + 选择 |
| `useProfiles` | 144 | API Profile 管理 |
| `useProviders` | 111 | 服务商管理 |
| `usePrompts` | 327 | 提示词 CRUD + 标签 |

**基础设施**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useIPC` | 112 | IPC 调用封装（invoke/silentInvoke/mock/retry） |
| `useValidation` | 107 | 数据校验工具函数 |
| `useFormatters` | 62 | 日期/时间/时长格式化 |
| `useEscapeParser` | 37 | ANSI 转义序列解析 |
| `useClickOutside` | 17 | 点击外部关闭指令 |
| `constants` | 47 | 标签颜色/Agent 颜色常量 |

---

## 主题系统

### 6 套配色方案

| 方案 | 主色（Light） | 主色（Dark） | 风格 |
|------|-------------|-------------|------|
| Claude | `#DA7756` | `#E08B6D` | 官方赤陶/珊瑚 |
| Ember | `#FF6B35` | `#FF6B35` | 橙色 |
| Ocean | `#0369A1` | `#0284C7` | 蓝色 |
| Forest | `#10B981` | `#34D399` | 绿色 |
| Violet | `#8B5CF6` | `#A78BFA` | 紫色 |
| Graphite | `#6B7280` | `#9CA3AF` | 灰色 |

每套方案定义 4 个值：`primary`、`primaryHover`、`ghost`（半透明背景）、`ghostHover`。

### CSS 变量注入机制

`useTheme` 通过 `buildCSSVars()` 构建 ~20 个 CSS 变量（背景、文字、边框、主色、语义色等）：

**双重注入**：CSS 变量同时注入到 `.app-container`（`:style` 绑定）和 `:root`（`syncCSSVarsToRoot()`）。

**原因**：Naive UI 的 `n-modal`、`n-dialog` 等组件通过 teleport 挂载到 `<body>`，无法访问 `.app-container` 的 CSS 变量，必须同步到 `:root`。

### Naive UI 主题覆盖

`themeOverrides` computed 将配色方案主色注入到 Naive UI 组件级配置（Button/Input/Switch/Dialog/Message/Notification），通过 `<n-config-provider :theme-overrides>` 全局生效。

### 切换流程

```
用户点击 → toggleTheme() / setColorScheme()
  → isDark / colorScheme ref 更新
  → watch → syncDOMTheme() + syncCSSVarsToRoot()
  → saveTheme() → IPC 持久化到配置
  → broadcastSettings() → 广播到所有窗口
  → 其他窗口 onSettingsChanged() → 同步更新
```

### 防闪白

preload 注入 `data-theme` 属性 → `getInitialTheme()` 同步读取 DOM → 页面加载时已有正确主题。`initTheme()` 异步从配置读取并校正。

---

## 设计模式与陷阱

### Vue Proxy 对象无法通过 IPC 传输

**问题**：Vue 3 的 `reactive()` / `ref()` 返回 Proxy，Electron IPC structured clone 报 `An object could not be cloned`。

**解决**：`JSON.parse(JSON.stringify(reactiveObject))` 深拷贝后发送。

### Naive UI Dialog 回调属性名

Dialog 确认/取消回调是 `onPositiveClick` / `onNegativeClick`，**不是** `onPositive` / `onNegative`。

### macOS BrowserWindow 生命周期

macOS 关闭窗口不退出应用，重新激活时 `mainWindow` 已销毁。`activate` 事件中重建窗口并更新 Manager 引用，IPC 发送使用 `_safeSend()` 防御性检查。详见 → [design/main-process.md](./main-process.md)

### 跨窗口广播机制

主窗口修改设置（主题/语言/配色）后同步到所有独立窗口：

```
主窗口 → broadcastSettings(settings) → IPC send 'settings:broadcast'
  → 主进程遍历所有 BrowserWindow → webContents.send('settings:changed')
  → 各窗口 onSettingsChanged(callback) → 更新本地主题/语言状态
```

每个独立窗口的 `useTheme` 初始化时自动 `listenForChanges()` 注册监听。

### IPC 调用封装

`useIPC` 提供统一的 IPC 调用层：

- **invoke(method, ...args)**：自动管理 `loading` / `error` ref 状态
- **silentInvoke**：不触发 loading 状态，适用于后台轮询
- **Mock 回退**：非 Electron 环境（浏览器开发）提供 mock 数据
- **useIPCWithRetry**：指数退避自动重试（最多 3 次）

### v-show vs v-if 策略

| 场景 | 选择 | 原因 |
|------|------|------|
| Agent 会话内容切换 | `v-show` | 保持 IPC 监听与输入状态 |
| AgentLeftContent | `v-show` | 避免模式切换时 remount |
| Modal 弹窗 | `v-model:show` | Naive UI 自带过渡动画 |

### 图标系统

101 个 SVG 图标统一定义在 `components/icons/index.js`，通过 `<Icon name="xxx" :size="20" />` 使用。基于 20x20 viewBox、stroke-based 设计，保证视觉一致性。
