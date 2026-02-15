# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Claude Code Desktop 是独立的 Electron 桌面终端应用，作为 Claude Code CLI 的启动器。

**当前版本**：1.6.40

**版本号管理规范**：
- 格式：`主版本.次版本.修订号`（如 1.6.38）
- **升级规则**：每次发布只递进后两位（修订号），如 1.6.38 → 1.6.39
- 不随意升级主版本号或次版本号，除非有重大架构变更或破坏性更新
- 版本号需同步更新：`package.json`、`CLAUDE.md`、`docs/CHANGELOG.md`

**核心理念**：Desktop = Claude Code CLI Launcher + Terminal Emulator

**双模式架构**：Terminal 模式（PTY 直连 CLI）+ Agent 模式（Streaming HTTP API 对话）

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（自动打开 DevTools）
npm run build:win    # Windows 构建
npm run build:mac    # macOS 构建
npm run build:linux  # Linux 构建

# 测试
npm test             # 运行测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# 原生模块重建（better-sqlite3、node-pty 编译问题时使用）
npm run rebuild:sqlite
```

**开发提示**：
- F12 切换 DevTools
- 配置文件：`%APPDATA%/cc-desktop/config.json` (Windows) 或 `~/.config/cc-desktop/config.json` (Linux/macOS)
- 测试文件位于 `tests/` 目录，使用 Vitest 框架

## 架构

### 进程模型

```
Electron 应用
├── Main Process (Node.js)
│   ├── index.js                  # 入口，创建窗口
│   ├── config-manager.js         # 配置管理
│   ├── terminal-manager.js       # PTY 进程（Terminal 模式）
│   ├── agent-session-manager.js  # Agent 会话管理（Agent 模式）
│   ├── active-session-manager.js # 活动会话管理
│   ├── plugin-manager.js         # 插件管理
│   ├── component-scanner.js      # 组件扫描基础类
│   ├── database/                 # SQLite 数据库模块
│   ├── managers/                 # 功能管理器
│   │   ├── agent-file-manager.js # Agent 文件操作（文件树、CRUD）
│   │   ├── agent-query-manager.js # Agent Query 控制（模型、命令、账户）
│   │   ├── capability-manager.js # Agent 能力管理（v1.1 一能力一组件）
│   │   ├── skills-manager.js     # Skills 管理
│   │   ├── plugin-cli.js         # 插件 CLI 操作
│   │   ├── hooks-manager.js      # Hooks 管理
│   │   ├── mcp-manager.js        # MCP 管理
│   │   └── settings-manager.js   # Settings 管理
│   ├── utils/                    # 工具模块
│   │   ├── agent-constants.js    # Agent 常量定义（状态、类型、文件过滤）
│   │   └── ...                   # 其他工具
│   └── ipc-handlers/             # IPC 处理器
│
├── Preload (Security Bridge)
│   └── preload.js                # contextBridge API
│
└── Renderer (Browser)
    ├── pages/main/               # 主页面 (Vue 3)
    └── composables/              # 可复用逻辑（20+ 模块）
```

### 设计原则

1. **单用户无认证** - 无 JWT、无用户管理
2. **多会话并发** - 支持同时运行多个终端会话，可后台运行
3. **简单项目管理** - 最近项目列表存储在单个 JSON
4. **直接 IPC 通信** - 无 WebSocket
5. **纯本地** - 所有数据存储在本地 AppData

### 数据流

**Terminal 模式**：
```
用户点击项目 → selectProject() → connectToProject()
IPC: terminal:start → TerminalManager.start()
  ├── kill() 旧进程
  ├── spawn() 新 shell (cwd: projectPath)
  └── 注入 ANTHROPIC_API_KEY
PTY.onData → IPC:terminal:data → xterm.write()
```

**Agent 模式**：
```
用户发送消息 → agent:sendMessage → AgentSessionManager.sendMessage()
  └── Streaming HTTP → Claude Code CLI API
响应流 → agent:stream → 前端逐块渲染

图片识别（多模态）：
用户粘贴/上传图片 → ChatInput 处理 → base64 编码
  → { text, images: [{ base64, mediaType, ... }] }
  → AgentSessionManager 转换为 Claude API Vision 格式
  → content: [{ type: 'text' }, { type: 'image', source: {...} }]
```

## 模块化设计原则

### 新功能开发规范

遵循"刚好够用"的模块化原则，避免过度设计和过晚拆分。

#### 📏 文件大小规则

| 文件行数 | 处理方式 | 说明 |
|---------|---------|------|
| **< 200 行** | 单文件 | 不拆分，保持简单 |
| **200-500 行** | 适度拆分 | 2-3 个模块（核心 + 常量 + 数据层） |
| **500-1000 行** | 必须拆分 | 3-5 个模块（按职责明确划分） |
| **> 1000 行** | 立即重构 | 参考 agent-session-manager 重构方案 |

#### 🎯 模块拆分模板

**小功能（< 200 行）**：
```javascript
src/main/
└── feature-name.js           // 单文件即可
```

**中等功能（200-500 行）**：
```javascript
src/main/feature-name/
├── index.js                  // 核心逻辑（150-300行）
└── constants.js              // 配置常量（50-100行）

// 如果涉及数据持久化
├── index.js                  // 核心逻辑
├── storage.js                // 数据层
└── constants.js              // 常量配置
```

**大功能（> 500 行）**：
```javascript
src/main/feature-name/
├── manager.js                // 核心管理器（200-400行）
├── handler.js                // 业务处理（200-300行）
├── storage.js                // 数据持久化（100-200行）
├── utils.js                  // 工具函数（< 150行）
└── constants.js              // 常量配置（< 100行）
```

#### ⚖️ 决策矩阵

| 场景 | 预先模块化 | 先做大再拆 |
|------|-----------|----------|
| 需求明确 | ✅ | - |
| 需求不确定 | - | ✅ |
| 多人协作 | ✅ | - |
| 单人开发 | - | ✅ |
| 核心功能 | ✅ | - |
| 实验性功能 | - | ✅ |
| 代码复用需求 | ✅ | - |
| 一次性代码 | - | ✅ |

#### ❌ 反模式示例

**过度设计**（避免）：
```javascript
// 一个简单的配置管理，拆成了 8 个文件
config/
├── core/
│   ├── config-manager.js
│   ├── config-loader.js
│   └── config-validator.js
├── adapters/
│   ├── json-adapter.js
│   └── yaml-adapter.js
├── strategies/
│   └── merge-strategy.js
└── types/
    └── config-types.js

// ❌ 问题：过度抽象，维护成本高
```

**合理设计**（推荐）：
```javascript
// Agent 会话管理（实际重构方案 - Phase 1-3）
src/main/
├── agent-session-manager.js         // 核心管理器（1274行，重构前1651行）
├── managers/
│   ├── agent-file-manager.js        // 文件操作（355行）
│   └── agent-query-manager.js       // Query 控制（105行）
└── utils/
    └── agent-constants.js           // 常量定义（102行）

// ✅ 优点：4 个文件，职责清晰，减少 22.8% 代码量，无过度拆分
// ✅ 重构效果：1651 → 1274 行（-377行）
```

#### 🔑 关键原则

1. **职责单一**：一个文件只做一件事
2. **边界清晰**：模块间依赖最小化
3. **刚好够用**：不过度设计，不过晚拆分
4. **测试友好**：独立模块易于单元测试
5. **避免循环依赖**：使用依赖注入或事件总线

#### 📝 实施检查清单

新功能开发前检查：
- [ ] 预估代码量（< 200 / 200-500 / > 500）
- [ ] 确定模块边界（核心 / 数据 / 工具）
- [ ] 规划文件结构
- [ ] 设计接口（IPC / 模块间通信）

代码审查时检查：
- [ ] 单文件是否超过 500 行？
- [ ] 职责是否单一明确？
- [ ] 是否存在过度设计？
- [ ] 模块依赖是否合理？

### 📚 实战案例：agent-session-manager 模块化重构

**背景**：`agent-session-manager.js` 原有 **1651 行**代码，职责混杂，维护困难

**重构目标**：遵循"刚好够用"原则，提取独立模块，保持核心逻辑清晰

#### 三阶段渐进式重构

| 阶段 | 提取内容 | 行数 | 原因 |
|------|---------|------|------|
| **Phase 1** | 常量定义 | 61 行 | 数据定义与逻辑分离 |
| **Phase 2** | 文件操作 | 277 行 | 文件系统操作是独立领域 |
| **Phase 3** | Query 控制 | 39 行 | Generator 控制是独立功能 |
| **总计** | — | **-377 行 (-22.8%)** | 核心文件从 1651 → 1274 行 |

#### 新增模块架构

**1. 常量模块** (`utils/agent-constants.js`, 102 行)
```javascript
// 职责：集中管理 Agent 模块的常量定义
module.exports = {
  AgentStatus,      // 会话状态枚举
  AgentType,        // 会话类型枚举
  HIDDEN_DIRS,      // 文件树过滤规则
  TEXT_EXTS,        // 支持的文本文件扩展名
  IMAGE_EXTS,       // 支持的图片文件扩展名
  LANG_MAP,         // 语言映射（语法高亮）
  MAX_TEXT_SIZE,    // 文件预览大小限制
  MAX_IMG_SIZE,
  MIME_MAP
}
```

**2. 文件操作模块** (`managers/agent-file-manager.js`, 355 行)
```javascript
// 职责：Agent 模式下的文件系统操作
class AgentFileManager {
  constructor(sessionManager) { /* 依赖注入 */ }

  _resolveCwd(sessionId)           // 获取工作目录
  _safePath(cwd, relativePath)     // 路径安全校验
  listDir(sessionId, path)         // 列出目录
  readFile(sessionId, path)        // 读取文件
  saveFile(sessionId, path, content) // 保存文件
  createFile(sessionId, parent, name, isDir) // 创建文件/文件夹
  renameFile(sessionId, oldPath, newName)    // 重命名
  deleteFile(sessionId, path)      // 删除
}
```

**3. Query 控制模块** (`managers/agent-query-manager.js`, 105 行)
```javascript
// 职责：Agent Query Generator 控制
class AgentQueryManager {
  constructor(sessionManager) { /* 依赖注入 */ }

  _getGenerator(sessionId)         // 获取 generator 实例
  setModel(sessionId, model)       // 切换模型
  getSupportedModels(sessionId)    // 获取模型列表
  getSupportedCommands(sessionId)  // 获取命令列表
  getAccountInfo(sessionId)        // 获取账户信息
  getMcpServerStatus(sessionId)    // 获取 MCP 状态
  getInitResult(sessionId)         // 获取初始化结果（含缓存）
}
```

#### 核心设计模式

**依赖注入 + 委托模式**：
```javascript
// agent-session-manager.js
class AgentSessionManager {
  constructor(mainWindow, configManager) {
    // 注入依赖
    this.fileManager = new AgentFileManager(this)
    this.queryManager = new AgentQueryManager(this)
  }

  // 委托方法（保持公共 API 不变）
  async listDir(sessionId, path) {
    return this.fileManager.listDir(sessionId, path)
  }

  async setModel(sessionId, model) {
    return this.queryManager.setModel(sessionId, model)
  }
}
```

#### 重构收益

✅ **可维护性**：主文件减少 22.8%，职责更清晰
✅ **可测试性**：独立模块可单独测试，Mock 更容易
✅ **可扩展性**：新增功能创建独立 Manager 即可
✅ **协作友好**：模块边界清晰，减少合并冲突

#### 关键经验

1. **渐进式重构**：分阶段提取，每阶段完成后立即测试和提交
2. **保持 API 稳定**：使用委托模式，IPC 处理器无需修改
3. **合理粒度**：不过度拆分（如单独拆 pause/resume 方法）
4. **依赖注入**：避免循环依赖，便于单元测试

---

## 核心模式

### IPC 通信

```javascript
// 渲染进程调用
const projects = await window.electronAPI.listProjects();
window.electronAPI.writeTerminal(data);
window.electronAPI.onTerminalData((data) => terminal.write(data));
```

- `ipcRenderer.invoke()` - 请求-响应
- `ipcRenderer.send()` - 单向发送
- `ipcRenderer.on()` - 监听事件

### 添加新 IPC Handler

1. 在 `src/main/ipc-handlers/` 目录下对应模块中定义
2. 在 `src/preload/preload.js` 通过 contextBridge 暴露
3. 渲染进程通过 `window.electronAPI.*` 调用

### 添加配置字段

1. 更新 `src/main/config-manager.js` 的 `defaultConfig`
2. ConfigManager 自动合并现有配置
3. 通过 `configManager.getConfig()` 或 `config:get` IPC 访问

### Tab 管理双数组模式

为了在关闭 Tab 时保持终端缓冲区（xterm.js buffer），使用双数组架构：

```javascript
const tabs = ref([])      // TabBar UI 显示的 tabs
const allTabs = ref([])   // 所有 TerminalTab 组件（包括后台的）
```

**关键点**：
- `tabs`：控制 TabBar 中显示哪些 Tab（用户可见的 UI 状态）
- `allTabs`：保持所有 TerminalTab 组件实例（即使 Tab 关闭，组件不销毁）
- 关闭 Tab：从 `tabs` 移除，但保留在 `allTabs` → xterm buffer 不丢失
- 重新打开 Tab：从 `allTabs` 找到现有组件，添加回 `tabs` → 终端内容恢复

**实现模式**：
```javascript
// MainContent.vue: 渲染所有终端组件
<TerminalTab
  v-for="tab in allTabs"  // 使用 allTabs，不是 tabs
  :key="tab.id"
  :visible="activeTabId === tab.id"
/>

// useTabManagement.js: 关闭 Tab
const closeTab = async (tab) => {
  // 1. 断开连接（后台运行）
  await invoke('disconnectActiveSession', tab.sessionId)

  // 2. 从 tabs 移除（UI 隐藏）
  const index = tabs.value.findIndex(t => t.id === tab.id)
  if (index !== -1) {
    tabs.value.splice(index, 1)
  }
  // 3. 保留在 allTabs 中（组件不销毁）
}

// useTabManagement.js: 重新打开 Tab
const ensureSessionTab = (session) => {
  // 1. 先在 allTabs 中查找（保持缓冲区）
  const existingTab = findTabBySessionId(allTabs.value, session.id)
  if (existingTab) {
    // 2. 添加回 tabs（UI 显示）
    if (!tabs.value.find(t => t.id === existingTab.id)) {
      tabs.value.push(existingTab)
    }
    return existingTab
  }

  // 3. 不存在则创建新 Tab，同时添加到两个数组
  const newTab = { /* ... */ }
  tabs.value.push(newTab)
  allTabs.value.push(newTab)
}
```

### Agent 模式图片识别

**功能概述**：Agent 模式支持多模态消息，用户可发送图片给 AI 进行分析（基于 Claude API Vision）。

**输入方式**：
- 截屏后粘贴（Ctrl+V / Cmd+V）
- 复制图片后粘贴
- 点击上传按钮选择文件

**消息类型**：
- 纯文字：`'这是文本'` → 字符串格式
- 纯图片：`{ text: '', images: [...] }` → 对象格式
- 图片+文字：`{ text: '这是什么', images: [...] }` → 对象格式

**数据流**：
```javascript
// 前端：ChatInput.vue
用户粘贴图片 → FileReader 读取 → base64 编码
  → attachedImages.value.push({ base64, mediaType, sizeBytes, ... })
  → 用户按回车 → emit('send', { text, images })

// 消息管理：useAgentChat.js
addUserMessage(text, images) → messages.value.push({ content, images, ... })
sendMessage(text) → 类型检测 → 提取 textContent 和 hasImages
  → 验证: (!textContent.trim() && !hasImages) || isStreaming
  → window.electronAPI.sendAgentMessage({ message: originalMessage })

// 后端：agent-session-manager.js
sendMessage(sessionId, userMessage) →
  if (typeof userMessage === 'object' && userMessage.images) {
    messageContent = [
      { type: 'text', text: userMessage.text },
      { type: 'image', source: { type: 'base64', media_type, data } }
    ]
  }
  → Claude API Vision 请求

// 显示：MessageBubble.vue
<div class="bubble-images">
  <img :src="`data:${img.mediaType};base64,${img.base64}`" />
</div>
```

**限制和提示**：
- 最多 4 张图片/消息
- 5MB 大小限制（Claude API 限制）
- **队列不支持图片**：流式输出时发送图片会提示等待
- 用户可通过队列控制按钮（暂停/清空）灵活处理

**核心文件**：
- `src/renderer/utils/image-utils.js` - 图片处理工具
- `src/renderer/pages/main/components/agent/ChatInput.vue` - 输入和预览
- `src/renderer/pages/main/components/agent/MessageBubble.vue` - 气泡显示
- `src/renderer/composables/useAgentChat.js` - 消息管理
- `src/main/agent-session-manager.js` - 后端处理

**详细文档**：`docs/IMAGE-RECOGNITION-FEATURE.md`

### Agent 能力管理（Capability Manager）

**数据模型 v1.1**：一能力一组件 — 每个 capability 直接对应一个 skill/agent/plugin

```json
{
  "version": "1.1",
  "capabilities": [
    {
      "id": "my-code-review",
      "name": "代码审查",
      "description": "AI 驱动的代码审查",
      "type": "skill",
      "componentId": "my-code-review",
      "category": "code-review"
    }
  ]
}
```

**清单来源**：`{registryUrl}/agent-capabilities.json`（远程拉取）

**安装状态检测**：
- **skill**：`~/.claude/skills/{id}/SKILL.md` 存在 → installed；`.disabled` 后缀 → disabled
- **agent**：`~/.claude/agents/{id}.md` 存在 → installed；`.disabled` 后缀 → disabled
- **plugin**：`installed_plugins.json` 有记录 → installed；`settings.json` 的 `enabledPlugins[id] === false` → disabled

**UI 操作**：下载安装 / 更新（重新下载） / 卸载 / 启用-禁用开关

**能力快捷调用**（ChatInput ⚡ 下拉）：
- 位于聊天输入框工具栏，点击 ⚡ 图标弹出已启用能力列表
- skill 类型 → 发送 `/{componentId}`；agent 类型 → 发送 `@{componentId}`
- plugin 类型自动展开为其内部 skill/agent 子组件（通过 `getPluginDetails` API）
- 颜色区分：蓝色 = skill，紫色 = agent；带 i18n 类型标签
- 首次打开时懒加载，与模型选择下拉互斥

**核心文件**：`src/main/managers/capability-manager.js`

### Plugin/Skills 加载机制

**唯一数据源**：`~/.claude/plugins/installed_plugins.json`

```
~/.claude/plugins/
├── installed_plugins.json   # 已安装插件注册表（唯一入口）
├── cache/                   # 插件安装目录
└── repos/                   # 本地开发插件
```

**插件 ID 格式**：`{plugin-name}@{marketplace}`

**加载流程**：
```
installed_plugins.json → 读取 installPath → 扫描 skills/ 目录
```

**关键点**：
- 没注册到 `installed_plugins.json` = 不会被加载
- 启用/禁用状态存储在 `~/.claude/settings.json` 的 `enabledPlugins` 字段
- YAML 解析使用 `js-yaml` 库

### 主题系统

**6 套配色方案**（每套支持 light/dark 模式）：

| 方案 | 主色 | 说明 |
|------|------|------|
| Claude | #DA7756 | 官方品牌色（赤陶/珊瑚色），**默认** |
| Ember | #FF6B35 | 橙色 |
| Ocean | #0EA5E9 | 蓝色 |
| Forest | #10B981 | 绿色 |
| Violet | #8B5CF6 | 紫色 |
| Graphite | #6B7280 | 灰色 |

**配置位置**：`src/renderer/composables/useTheme.js`

**使用方式**：
```javascript
import { useTheme } from '@composables/useTheme'

const { isDark, colorScheme, currentColors, toggleTheme, setColorScheme } = useTheme()

// 切换深浅模式
await toggleTheme()

// 切换配色方案
await setColorScheme('ocean')
```

**Naive UI 主题覆盖**（所有图标颜色跟随主题）：
- Button、Input、Switch、Spin
- Dialog（iconColorWarning）
- Message（success/warning/error/info/loading 图标）
- Notification（success/warning/error/info 图标）

### 统一图标系统

**位置**：`src/renderer/components/icons/`

**设计规范**：
- 基于 20x20 viewBox
- stroke-based 设计（stroke-width: 1.5）
- 90+ 个图标，覆盖操作、导航、文件、状态、功能等类别

**使用方式**：
```vue
<Icon name="refresh" :size="20" />
<Icon name="settings" :size="16" class="custom-class" />
```

**图标分类**：
- 操作类：refresh, search, add, close, edit, delete, copy
- 导航类：chevronDown/Up/Left/Right, externalLink
- 文件类：folder, file, fileText
- 终端类：terminal, play, stop, pause
- 状态类：check, warning, info, error
- 功能类：plugin, skill, hook, agent, mcp, prompt
- 字母图标：letterS, letterM, letterA, letterH（用于 Tab 标识）

### 服务商管理

**设计原则**：所有服务商均可编辑/删除，无"内置"概念

**预设服务商**（用户可自由修改）：
| ID | 名称 | 默认 API URL |
|----|------|-------------|
| official | 官方 API | https://api.anthropic.com |
| zhipu | 智谱AI | https://open.bigmodel.cn/api/paas/v4 |
| minimax | MiniMax | https://api.minimax.chat/v1 |
| qwen | 阿里千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| proxy | 代理服务 | （用户填写） |
| other | 其他 | （用户填写） |

**配置位置**：
- 后端：`src/main/config/provider-config.js`
- 常量：`src/main/utils/constants.js`（SERVICE_PROVIDERS）

## 文件结构

```
src/
├── main/
│   ├── index.js                  # 应用入口
│   ├── config-manager.js         # 配置管理
│   ├── terminal-manager.js       # PTY 管理（Terminal 模式）
│   ├── agent-session-manager.js  # Agent 会话管理（Agent 模式）
│   ├── active-session-manager.js # 活动会话管理
│   ├── plugin-manager.js         # 插件管理
│   ├── component-scanner.js      # 组件扫描基础类（skills/agents/plugins）
│   ├── database/                 # SQLite 数据库模块
│   │   ├── agent-db.js           # Agent 会话/消息存储
│   │   ├── session-db.js         # Terminal 会话存储
│   │   ├── project-db.js         # 项目存储
│   │   └── ...                   # favorite/prompt/tag/queue 等
│   ├── ipc-handlers/             # 模块化 IPC
│   │   ├── agent-handlers.js     # Agent 模式 IPC
│   │   ├── capability-handlers.js # 能力管理 IPC
│   │   ├── plugin-handlers.js
│   │   ├── ai-handlers.js
│   │   └── ...
│   ├── managers/
│   │   ├── agent-file-manager.js # Agent 文件操作（355行）
│   │   ├── agent-query-manager.js # Agent Query 控制（105行）
│   │   ├── capability-manager.js # Agent 能力管理（v1.1 一能力一组件）
│   │   ├── skills-manager.js     # Skills 管理
│   │   ├── skills/               # Skills 管理 mixin
│   │   ├── agents/               # Agents 管理 mixin
│   │   ├── plugin-cli.js         # 插件 CLI 操作（install/uninstall）
│   │   ├── hooks-manager.js      # Hooks 管理
│   │   ├── mcp-manager.js        # MCP 管理
│   │   └── settings-manager.js   # Settings 管理
│   ├── config/                   # ConfigManager mixins
│   └── utils/
│       ├── agent-constants.js    # Agent 常量定义（102行）
│       └── ...                   # 其他工具
│
├── preload/
│   └── preload.js                # contextBridge API
│
└── renderer/
    ├── pages/main/components/
    │   ├── agent/                # Agent 模式 UI 组件
    │   │   ├── AgentLeftContent.vue    # 对话列表（左侧面板）
    │   │   ├── AgentNewConversationModal.vue # 新建对话弹窗（含目录存在性校验）
    │   │   ├── CapabilityModal.vue     # 能力管理弹窗
    │   │   ├── ChatInput.vue          # 聊天输入框（含能力快捷调用 ⚡）
    │   │   ├── MessageBubble.vue      # 消息气泡
    │   │   ├── ToolCallCard.vue       # 工具调用卡片
    │   │   └── StreamingIndicator.vue # 流式输出指示器
    │   ├── AgentChatTab.vue      # Agent 对话 Tab
    │   ├── RightPanel/           # Developer 模式右侧面板
    │   │   └── tabs/             # 9 个标签页（Skills/Agents/Hooks/MCP/Plugins/Settings/AI/Prompts/Commands）
    │   └── AgentRightPanel/      # Agent 模式右侧面板
    │       ├── FileTree.vue      # 文件树
    │       ├── FileTreeNode.vue  # 文件树节点（递归）
    │       ├── FilePreview.vue   # 文件预览
    │       └── FileTreeHeader.vue
    ├── composables/              # 可复用逻辑（21 个模块）
    ├── utils/                    # 工具函数
    │   └── image-utils.js        # 图片处理（图片识别功能）
    └── locales/                  # 国际化（zh-CN / en-US）
```

## 安全模型

- **Context Isolation**: 启用，渲染进程无法访问 Node API
- **Node Integration**: 禁用
- **CSP**: 限制资源来源为 self + CDN
- **contextBridge**: 仅暴露 preload.js 中定义的 API

## 常见陷阱

### 1. Vue Proxy 对象无法通过 IPC 传输

**错误信息**：`An object could not be cloned`

**原因**：Vue 3 的响应式对象是 Proxy，无法被 Electron IPC 的结构化克隆算法处理。

**解决方案**：在通过 IPC 发送前，使用深拷贝转换为普通对象：
```javascript
// ❌ 错误
await window.electronAPI.someApi(props.reactiveObject)

// ✅ 正确
const plainObject = JSON.parse(JSON.stringify(props.reactiveObject))
await window.electronAPI.someApi(plainObject)
```

### 2. Naive UI Dialog 回调属性名

**错误**：使用 `onPositive` / `onNegative` 无效

**正确属性名**：
```javascript
dialog.warning({
  title: '确认',
  content: '确定删除？',
  positiveText: '删除',
  negativeText: '取消',
  onPositiveClick: async () => { /* ... */ },  // ✅ 不是 onPositive
  onNegativeClick: () => { /* ... */ }         // ✅ 不是 onNegative
})
```

### 3. macOS BrowserWindow 生命周期

**问题**：macOS 上关闭窗口不会退出应用，重新激活时出现 "Object has been destroyed" 错误。

**原因**：
- macOS 窗口关闭时 `mainWindow` 被销毁，但 app 不退出
- Manager 类持有的 `mainWindow` 引用变成已销毁对象
- 重新激活时调用 `mainWindow.webContents.send()` 报错

**解决方案**：

1. **更新 activate 事件处理**：
```javascript
// src/main/index.js
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();

    // 更新 manager 引用，避免使用已销毁的 mainWindow
    if (terminalManager) {
      terminalManager.mainWindow = mainWindow;
    }
    if (activeSessionManager) {
      activeSessionManager.mainWindow = mainWindow;
    }
  }
});
```

2. **防御性 IPC 发送**：
```javascript
// 在所有 Manager 类中添加 _safeSend 方法
_safeSend(channel, data) {
  try {
    if (this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        this.mainWindow.webContents &&
        !this.mainWindow.webContents.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
      return true
    }
    console.warn(`Cannot send to ${channel}: window destroyed`)
    return false
  } catch (error) {
    console.error(`Failed to send to ${channel}:`, error)
    return false
  }
}

// 替换所有 webContents.send() 调用
this._safeSend('session:data', { sessionId, data })
```

**注意**：Windows/Linux 关闭窗口会退出应用，所以这是 macOS 特定问题。

---

## 注意事项

- 修改组件市场相关规范（Skills/Prompts/Agents 的文件格式、目录结构、index.json Schema、下载路径等）时，**必须同步更新** `C:\workspace\develop\HydroCoder\hydroSkills\CLAUDE.md` 中的对应描述，保持文档与代码一致。

---

## 待办计划

### 测试 Mock 说明（better-sqlite3）

- **文件**：`tests/main/session-database-prompts.test.js` 中的 MockDatabase/MockStatement（约 370 行）
- **原因**：`postinstall` 的 `electron-rebuild` 将 better-sqlite3 编译为 Electron Node ABI（MODULE_VERSION 143），而 vitest 运行在系统 Node.js（MODULE_VERSION 127），ABI 不兼容导致原生模块无法加载
- **现状**：这是 Electron 原生模块测试的结构性问题，与 Electron 版本无关。除非改用 `electron-vitest`（在 Electron 内跑测试）或添加 `sql.js`（WebAssembly SQLite）作为 devDep，否则 Mock 仍是必要的
- **结论**：保持现有 Mock 方案，49 个测试用例正常通过

### ~~零依赖安装改造~~ — 已取消

Phase 1（Electron 28 → 40 升级）已完成并保留。Phase 2-5 经实测验证后决定取消并回撤，原因如下：

**实测发现的技术障碍**：

1. **Electron TTY 缺陷**：`ELECTRON_RUN_AS_NODE=1` 模式下 `process.stdin.isTTY` 始终返回 `undefined`，导致 SDK 的 cli.js 误入 `--print` 非交互模式后立即退出。交互式终端必须使用系统 `node` 而非 Electron 来执行 cli.js。
2. **MCP 服务器依赖系统 claude 二进制**：即使通过 `node cli.js` 成功启动终端，MCP 服务器（如 Serena）在初始化时需要 spawn 系统 `claude` 命令。PATH 中无 claude 时 MCP 启动失败，导致 SDK 兜底方案在实际使用中不可行。

**结论**：SDK 内嵌 cli.js 兜底方案的适用范围过窄（仅基础 CLI 交互可用，MCP 等核心功能不可用），不具备实际生产价值。

**环境依赖**：

| 依赖 | 开发模式 | 生产模式 | 说明 |
|------|---------|---------|------|
| **Node.js** | **需要** | 不需要 | 开发：npm/Vite/测试等工具链必需；生产：Electron 自带 Node.js 运行时 |
| **Claude Code CLI** | **需要** | **需要** | Terminal 模式直接调用 `claude` 命令，MCP 服务器也依赖它 |
| cc-desktop 源码 | 需要 | 不需要 | `npm install && npm run dev` |
| cc-desktop 安装包 | 不需要 | 需要 | 内含 Electron + SDK + 全部前端资源 |

**双模式启动方式**：

| 模式 | 启动方式 | 入口 |
|------|---------|------|
| Terminal 模式 | PTY spawn shell → 执行 `claude` / `claude --resume <id>` | `active-session-manager.js` |
| Agent 模式 | `import('@anthropic-ai/claude-agent-sdk')` → `sdk.query()` → SDK 内部 spawn CLI | `agent-session-manager.js` |

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `docs/CHANGELOG.md` | 版本更新日志 |
| `docs/DEV-HISTORY.md` | 详细开发历史 |
| `docs/ARCHITECTURE.md` | 架构设计 |
| `docs/QUICKSTART.md` | 快速开始 |
| `docs/CUSTOM-UI-GUIDE.md` | 自定义 UI 模式 |
| `docs/IMAGE-RECOGNITION-FEATURE.md` | 图片识别功能实现文档 |
