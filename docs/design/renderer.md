# 渲染进程与 UI 设计

> CC Desktop v1.6.91 | [← 架构总览](../ARCHITECTURE.md) | [代码索引 →](../code-index/renderer.md)

技术栈：Vue 3 (Composition API) + Naive UI + xterm.js

---

## 页面架构

应用包含 **9 个独立 BrowserWindow 页面**，每个页面有独立的 `index.html` → `main.js` → `App.vue` 入口链。所有页面共享 composables、主题系统和国际化资源（通过 Vite alias 引用）。

### 主窗口

| 页面 | 用途 |
|------|------|
| **main** | 主窗口，承载 Developer 模式（终端）和 Agent 模式（对话）的全部交互 |

### 8 个独立窗口

| 页面 | 用途 | 打开方式 |
|------|------|---------|
| dingtalk-settings | 钉钉机器人配置（AppKey/Secret/RobotCode） | 主窗口菜单 |
| session-manager | 会话管理器（三列：项目/会话/消息，支持搜索/标签） | 主窗口菜单 |
| provider-manager | 服务商 CRUD | 设置 / Profile 表单 |
| profile-manager | API Profile 管理（默认切换） | 左侧面板 Profile 选择器 |
| custom-models | 自定义模型列表管理 | Profile 表单 |
| global-settings | 全局设置（语言/路径/CLI 配置） | 主窗口菜单 |
| appearance-settings | 外观设置（主题/配色方案选择） | 主窗口菜单 |
| update-manager | 更新管理（下载进度/安装控制） | 发现新版本时自动打开 |

窗口通过 `window.electronAPI.openXxxManager()` → IPC `window:openXxxManager` 打开，主进程保证单例（同一窗口不重复创建）。独立窗口间通过 **设置广播机制** 同步状态（详见 [跨窗口广播](#跨窗口广播机制)）。

> 完整组件列表与行数统计见 → [code-index/renderer.md](../code-index/renderer.md)

---

## 主窗口三栏布局

```
┌──────────┬─────────────────────┬──────────────┐
│          │      TabBar         │              │
│  Left    ├─────────────────────┤    Right     │
│  Panel   │                     │    Panel     │
│          │   Center Content    │              │
│          │  (Terminal / Chat)  │              │
│          │                     │              │
└──────────┴─────────────────────┴──────────────┘
```

**MainContent.vue** (1147 行) 是布局容器，管理三栏的显隐与拖拽：

| 区域 | 组件 | 职责 |
|------|------|------|
| 左栏 | `LeftPanel` (1646 行) | Developer: 项目选择 + 会话列表；Agent: 对话列表 |
| 中栏 | `TabBar` + 内容区 | Tab 切换 + 终端/对话渲染 |
| 右栏 | `RightPanel` / `AgentRightPanel` | Developer: 9 Tab 配置面板；Agent: 文件浏览器 |

三栏均可折叠：左/右栏折叠后显示窄条（collapsed strip），点击展开。右栏宽度支持鼠标拖拽调整（`startResize` mousedown）。双面板一键折叠/展开按钮（`toggleBothPanels`）。

### 模式隔离

MainContent 使用 **`v-show`（非 `v-if`）** 切换 Developer/Agent 内容区：

```html
<div v-show="isDeveloperMode" class="mode-content">  <!-- 终端区 -->
<div v-show="!isDeveloperMode" class="mode-content">  <!-- Agent 对话区 -->
```

**设计原因**：`v-if` 会销毁组件，导致：
1. xterm.js 终端 buffer（屏幕内容 + 历史滚动）丢失
2. Agent 模式的 IPC 流式事件监听器断开
3. 两种模式的滚动位置、输入状态无法保留

TabBar 按模式过滤只显示当前模式的 Tab：

```javascript
const currentModeTabs = computed(() =>
  isDeveloperMode.value
    ? tabs.value.filter(t => t.type !== 'agent-chat')
    : tabs.value.filter(t => t.type === 'agent-chat')
)
```

---

## Developer 模式 UI

### 项目列表

左栏顶部（`LeftPanel` Developer 部分）：

1. **下拉选择**：`n-select` 组件，支持搜索过滤，显示所有已添加项目
2. **项目操作菜单**：齿轮按钮触发 `n-dropdown`（编辑/置顶/隐藏/打开文件夹）
3. **新建会话**：项目有效时显示 `+ 新建会话` 按钮 + 打开终端按钮
4. **打开项目**：文件夹图标调用系统文件选择器添加新项目

### 会话列表

项目选择器下方，分两组显示：

- **运行中会话**（`activeSessions`）：绿色状态点，显示 `项目名：标题`，支持重命名/关闭
- **历史会话**（`historySessions`）：按当前项目过滤，限制显示数量（默认 10），可切换显示子代理会话（`showSubagentSessions`）

由 `useSessionPanel` composable 提供状态管理。

### 终端 Tab

`TerminalTab` (431 行) 封装 xterm.js 终端：

- 通过 IPC `terminal:data` 接收 PTY 数据 → `xterm.write()`
- 可配置字体大小、字体族、光标颜色（跟随主题主色）、深色背景
- `v-show="activeTabId === tab.id"` 控制可见性：非激活 Tab 隐藏但不销毁

### 右侧配置面板

`RightPanel` (207 行) 使用 **KeepAlive + 动态组件** 切换 9 个 Tab：

| Tab | 组件 | 职责 |
|-----|------|------|
| Skills | SkillsTab (400 行) | Skill 分组列表/安装/启禁/编辑/导入导出 |
| Agents | AgentsTab (409 行) | Agent 分组列表/安装/启禁/编辑/导入导出 |
| Hooks | HooksTab (569 行) | Hook 分组列表/编辑（含 ANSI 转义解析） |
| MCP | MCPTab (398 行) | MCP 服务器管理（兼容 Claude Desktop 格式） |
| Plugins | PluginsTab (824 行) | 插件管理/市场安装 |
| Settings | SettingsTab (505 行) | CLI 权限/环境变量配置 |
| AI | AITab (964 行) | AI 模型/参数配置（暂时禁用） |
| Prompts | PromptsTab (925 行) | 提示词管理/标签/搜索 |
| Commands | QuickCommands (664 行) | 快捷命令面板 |

面板底部固定 `QuickInput` (203 行)，提供快捷输入 → 发送到终端 / 添加到队列 / 保存为 Prompt。

`MessageQueue` (807 行) 作为特殊 Tab 单独处理（不参与 KeepAlive），管理消息队列的编排与发送。

---

## Agent 模式 UI

### 对话列表

`AgentLeftContent` (483 行) 管理 Agent 对话的创建与切换：

- **新建对话**：触发 `AgentNewConversationModal` (265 行)，支持选择项目目录、API Profile
- **对话列表**：分"活跃/历史"两组，显示标题和时间，支持重命名/关闭/删除
- **能力管理**：`CapabilityModal` (513 行) 按钮，管理 MCP 实时启闭

由 `useAgentPanel` composable 管理对话列表状态，通过模块级 `closedSessionIds` Set 跟踪已关闭会话（防止队列误消费）。

### 聊天界面

`AgentChatTab` (590 行) 是对话主视图：

```
┌─────────────────────────┐
│     消息列表（滚动）      │
│  ┌───────────────────┐  │
│  │  MessageBubble    │  │  ← 用户/助手消息
│  │  ToolCallCard     │  │  ← 工具调用卡片
│  │  StreamingIndicator│  │  ← 流式输出动画
│  └───────────────────┘  │
│  [钉钉观察模式提示条]     │  ← 仅 dingtalk 类型
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

#### ChatInput (1610 行)

最大的单组件，职责：

- 多行文本输入，高度自适应
- `Ctrl+Enter` / `Shift+Enter` 发送
- 图片粘贴 / 文件拖放 → base64 预览缩略图
- `/` 触发 capability 快捷列表（skill/agent/plugin 调用）
- 模型切换下拉（sonnet/opus/haiku），实时通过 `setAgentModel` IPC 同步
- Token 计数显示、历史消息上下翻

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

---

## Tab 管理双数组模式

`useTabManagement` (415 行) 使用**双数组架构**解决终端 buffer 保持问题：

```javascript
const tabs = ref([])      // TabBar 显示的 tabs（用户可见）
const allTabs = ref([])   // 所有组件实例（包括后台的）
```

### 设计原因

xterm.js 终端在被 Vue 销毁后，内部 buffer（屏幕内容、历史滚动）**无法恢复**。若关闭 Tab 就销毁组件，重新打开时只能看到空白终端。Agent 模式的对话组件也受益于此模式——避免重复加载历史消息。

### 操作流程

| 操作 | tabs[] | allTabs[] | 组件状态 |
|------|--------|-----------|---------|
| 打开会话 | push | push | 创建 + 挂载 |
| **关闭 Tab**（`closeTab`/`closeAgentTab`） | splice 移除 | **保留** | v-show 隐藏，buffer 存活 |
| **重新打开** (`ensureSessionTab`/`ensureAgentTab`) | push 回来 | 已存在 | v-show 显示，内容恢复 |
| **关闭会话** (`handleSessionClosed`/`closeAgentTabFully`) | splice 移除 | splice 移除 | **组件销毁** |

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
| `useAppMode` | 86 | Developer/Agent 模式切换，持久化到配置 |
| `useTheme` | 444 | 深浅模式 + 6 套配色，CSS 变量注入 |
| `useLocale` | 151 | i18n 翻译函数 `t()`，zh-CN / en-US |

**对话与会话**：
| Composable | 行数 | 职责 |
|------------|------|------|
| `useAgentChat` | 660 | 单个 Agent 对话的消息/流式/模型切换 |
| `useAgentPanel` | 225 | Agent 对话列表 + 会话关闭标记 |
| `useSessionPanel` | 493 | Developer 活动/历史会话管理 |
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
| `useCustomModels` | 101 | 自定义模型管理 |
| `usePrompts` | 327 | 提示词 CRUD + 标签 |
| `useMessageQueue` | 331 | 消息队列管理 |

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
| Developer/Agent 模式切换 | `v-show` | 保持终端 buffer + IPC 监听 |
| RightPanel Tab 内容 | `KeepAlive` + 动态组件 | 保持表单和滚动状态 |
| AgentLeftContent | `v-show` | 避免模式切换时 remount |
| Modal 弹窗 | `v-model:show` | Naive UI 自带过渡动画 |
| CapabilityModal | `v-if="!isDeveloperMode"` | 仅 Agent 模式需要 |

### 图标系统

101 个 SVG 图标统一定义在 `components/icons/index.js`，通过 `<Icon name="xxx" :size="20" />` 使用。基于 20x20 viewBox、stroke-based 设计，保证视觉一致性。
