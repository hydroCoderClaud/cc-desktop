# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Desktop is an independent Electron-based desktop terminal application that serves as a launcher for Claude Code CLI. The core concept is: **Desktop = Claude Code CLI Launcher + Terminal Emulator**.

This is a complete rewrite independent from the Web version, with 60% less code (~1,200 lines vs ~3,000 lines), simplified architecture, and no Web dependencies.

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Start in development mode (opens DevTools automatically)
npm run dev

# Build for specific platforms
npm run build:win    # Windows (NSIS installer)
npm run build:mac    # macOS (DMG)
npm run build:linux  # Linux (AppImage)
```

### Development Notes
- Press F12 to toggle DevTools in development or production
- The app will auto-open DevTools when `NODE_ENV=development`
- Config file location: `%APPDATA%/claude-code-desktop/config.json` (Windows) or `~/.config/claude-code-desktop/config.json` (Linux/macOS)

## Architecture

### Process Model
The application follows Electron's multi-process architecture:

**Main Process** (Node.js):
- `src/main/index.js` - Entry point, creates BrowserWindow
- `src/main/config-manager.js` - Manages config.json (recent projects, settings, API keys)
- `src/main/terminal-manager.js` - Manages single PTY process lifecycle
- `src/main/ipc-handlers.js` - IPC handlers for renderer-main communication

**Preload Script** (Security Bridge):
- `src/preload/preload.js` - Exposes safe API to renderer via contextBridge

**Renderer Process** (Browser):
- `src/renderer/index.html` - Main UI with Claude-style design
- `src/renderer/js/app.js` - Application logic, xterm.js integration

### Key Design Principles

1. **Single-user, no authentication** - No JWT, no user management, no session timeouts
2. **One active terminal at a time** - Switching projects kills the old PTY and creates a new one
3. **Simple project management** - Recent projects list (max 10) stored in single JSON file
4. **Direct IPC communication** - No WebSocket complexity
5. **Local-only** - All data stored in local AppData directory

### Data Flow: Project Connection

```
User clicks project → app.js:selectProject()
User clicks Connect → app.js:connectToProject()
IPC: terminal:start(project.path)
TerminalManager.start() kills old PTY, spawns new shell with:
  - cwd: project.path
  - env: ANTHROPIC_API_KEY from config
PTY.onData → IPC:terminal:data → xterm.write() → Display
```

### Data Flow: User Input

```
User types in terminal → xterm.onData()
IPC: terminal:write(data)
TerminalManager.write() → pty.write()
Shell processes input → PTY.onData
IPC: terminal:data → xterm.write() → Display
```

## Important Patterns

### IPC Communication
All renderer-main communication uses the API exposed in `preload.js`:
- Use `ipcRenderer.invoke()` for request-response (Handle)
- Use `ipcRenderer.send()` for fire-and-forget (On)
- Use `ipcRenderer.on()` for listening to events from main

Example:
```javascript
// In renderer (app.js)
const projects = await window.electronAPI.listProjects();
window.electronAPI.writeTerminal(data);
window.electronAPI.onTerminalData((data) => terminal.write(data));
```

### Terminal Management
- Only one terminal runs at a time (single PTY instance in TerminalManager)
- Before starting new terminal, old one is killed via `kill()`
- API Key is automatically injected as `ANTHROPIC_API_KEY` environment variable
- Shell selection: PowerShell on Windows, Bash on Linux/macOS

### Configuration Management
- ConfigManager automatically merges with defaults on load
- Projects are auto-sorted: pinned first, then by lastOpened timestamp
- Maximum 10 recent projects (configurable via settings.maxRecentProjects)
- Configuration changes are immediately persisted to disk

## File Structure Context

```
src/
├── main/                     # Main process (Node.js)
│   ├── index.js              # App lifecycle, window creation
│   ├── config-manager.js     # Config file I/O and project list
│   ├── terminal-manager.js   # PTY spawn/kill/write/resize
│   ├── ipc-handlers.js       # IPC channel definitions
│   ├── session-manager.js    # SQLite database operations for session history
│   ├── session-handlers.js   # Session-related IPC handlers
│   └── utils/
│       ├── constants.js      # Shared constants
│       └── path-utils.js     # Path resolution utilities
│
├── preload/
│   └── preload.js            # contextBridge API (security)
│
└── renderer/                 # Renderer process (Browser)
    ├── index.html            # UI with xterm.js from CDN
    ├── js/
    │   └── app.js            # Main app logic, xterm integration
    └── pages/
        └── session-manager/  # Session history Vue page
            ├── SessionManager.vue
            └── components/
                ├── SessionManagerContent.vue
                ├── ProjectList.vue
                ├── SessionList.vue
                ├── MessageViewer.vue
                └── TagManager.vue
```

## Security Model

- **Context Isolation**: enabled, renderer cannot access Node APIs
- **Node Integration**: disabled
- **CSP**: Restricts resources to self + CDN (xterm.js, fonts)
- **contextBridge**: Only exposes explicit APIs defined in preload.js

## Common Development Patterns

### Adding New IPC Handlers
1. Define handler in `src/main/ipc-handlers.js`
2. Expose in `src/preload/preload.js` via contextBridge
3. Call from renderer using `window.electronAPI.*`

### Adding Configuration Fields
1. Update `defaultConfig` in `src/main/config-manager.js`
2. ConfigManager auto-merges with existing configs
3. Access via `configManager.getConfig()` or `config:get` IPC

### Testing Configuration Changes
Edit config file directly while app is closed:
- Windows: `%APPDATA%\claude-code-desktop\config.json`
- Linux/macOS: `~/.config/claude-code-desktop/config.json`

## Dependencies

**Production:**
- `node-pty` - PTY process management (spawning shells)
- `uuid` - Unique project IDs

**Development:**
- `electron` - Desktop framework
- `electron-builder` - Application packaging
- `cross-env` - Cross-platform environment variables

**CDN (via renderer):**
- `xterm.js` 5.3.0 - Terminal UI rendering
- `xterm-addon-fit` - Auto-resize terminal to container

## Differences from Web Version

This desktop application explicitly **removed**:
- Multi-user authentication system
- JWT token management
- Session timeout/cleanup logic
- WebSocket communication
- Template/Prompt three-tier management
- Complex session pool management
- Dependency on `cc-web-terminal` codebase

Key simplifications:
- Config: Multiple JSON files → Single `config.json`
- Projects: Registration API → Simple recent list
- Terminals: Session pool → Single PTY instance
- Auth: JWT + timeouts → None (single local user)

## Advanced Architecture: Custom UI Mode

The current implementation uses **Terminal Mode** (xterm.js displaying PTY output). However, Claude Code CLI supports a **JSON API mode** that enables custom UI:

```bash
claude code --print --output-format=stream-json --input-format=stream-json
```

### Two Architecture Patterns

**Terminal Mode (Current):**
```
User → xterm.js → PTY → Shell → claude code (interactive)
```
- Simple, works out of the box
- Full terminal experience
- Limited UI customization

**API Mode (Available):**
```
User → Custom UI → ClaudeAPIManager → claude code (JSON mode)
```
- Full UI control (React/Vue/native)
- Structured data (JSON)
- Markdown rendering, code highlighting
- Conversation history, search, export
- Token usage display

See `docs/CUSTOM-UI-GUIDE.md` for implementation details and `docs/ARCHITECTURE-COMPARISON.md` for comparison.

### Key Benefits of API Mode

1. **Structured Data**: Every message is a JSON object with type, content, metadata
2. **Rich UI**: Markdown rendering, syntax highlighting, custom themes
3. **Conversation Management**: History, search, export (JSON/Markdown)
4. **Analytics**: Real-time token usage, cost tracking
5. **Advanced Features**: Edit history, branch conversations, file attachments

The codebase includes `src/main/claude-api-manager.js` demonstrating API mode integration. You can implement either mode or support both with a toggle.

---

## Recent Development History

### 2026-01-22: AI 助手增强 & Agents 标签页 & UI 统一 (v1.2.0)

**Overview:**
AI 助手多格式 API 兼容、手动压缩功能；新增独立 Agents 标签页；右侧面板 UI 统一优化；消息队列模块重构。

**AI Assistant Enhancements:**

1. **多格式 API 兼容**
   - 支持 Anthropic 和 OpenAI 兼容格式响应解析
   - MiniMax thinking 模式兼容（content 数组中 type: "thinking" 和 "text"）
   - authType 支持：`api_key` 使用 `x-api-key`，`auth_token` 使用 `Authorization: Bearer`
   - 添加 120 秒请求超时 (AbortController)

2. **手动压缩功能**
   - 压缩按钮 (⧉) 可手动触发上下文压缩
   - 可配置 `contextMaxTokens` (默认 200K)
   - 可配置 `compactThreshold` 压缩阈值百分比

3. **安全增强**
   - XSS 防护：sanitizeHtml 处理 markdown 渲染
   - 移除 script/iframe/object 等危险标签
   - 过滤 onclick 等事件属性和 javascript: 协议

4. **UI 优化**
   - 按钮重排：压缩 → 清空 → 设置
   - 压缩按钮橙色 (⧉)，清空按钮红色 (✕)
   - 设置按钮字号增大 (18px)

**New Features:**

1. **独立 Agents 标签页**
   - 新增 `AgentsTab.vue` (位于 MCP 和 AI 之间)
   - 图标 🧩 使用深色样式
   - 搜索功能、空状态提示
   - 点击 agent 插入 `@agent_name` 到输入框
   - 预留 Claude Code CLI 集成接口

2. **左侧面板中英文切换**
   - 左下角添加语言切换按钮 (EN/中)
   - 一键切换界面语言

**UI Improvements:**

1. **右侧面板标题栏统一**
   - 所有标签页标题高度统一为 40px
   - 统一 padding: `0 12px`
   - 消息队列标题下横线拉满宽度

2. **右侧面板图标优化**
   - 📜 队列、🔧 插件、🌐 MCP、🧩 Agents、🤖 AI
   - 搜索图标统一为 ⌕

3. **快捷命令增强**
   - 支持转义序列 (`\xNN` 发送控制字符)
   - 两行显示 + 溢出上拉菜单

4. **分隔线优化**
   - AI 助手与快捷命令区域添加 2px 分隔线

**Code Refactoring:**

1. **消息队列 Composable 提取**
   - 新增 `src/renderer/composables/useMessageQueue.js`
   - MessageQueue.vue 代码量减少 62%

2. **转义序列解析工具**
   - 新增 `src/renderer/composables/useEscapeParser.js`

**Files Changed:**
- `src/renderer/pages/main/components/RightPanel/tabs/AgentsTab.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/tabs/AITab.vue` - AI 增强
- `src/main/ipc-handlers/ai-handlers.js` - 多格式兼容
- `src/main/config-manager.js` - 压缩配置
- `src/renderer/pages/main/components/RightPanel/*.vue` - UI 统一
- `src/renderer/pages/main/components/LeftPanel.vue` - 语言切换
- `src/renderer/locales/*.js` - 新增翻译

**Tab Order (Right Panel):**
```
💬 提示词 | 📜 队列 | 🔧 插件 | ⚡ 技能 | 🌐 MCP | 🧩 Agents | 🤖 AI
```

---

### 2026-01-21: Quick Commands & Database Lock Fix (v1.1.9)

**Overview:**
添加快捷命令功能，优化数据库锁处理。语音输入功能开发中遇到问题暂停。

**New Features:**

1. **快捷命令 (Quick Commands)**
   - 右侧面板添加快捷命令区域
   - 支持添加/编辑/删除命令
   - 支持颜色标记 (8种预设颜色)
   - 点击快捷发送到终端
   - 数据持久化到 config.json

2. **数据库锁优化**
   - 添加 `busy_timeout = 5000` pragma
   - 解决多实例或异常退出后的数据库锁定问题
   - 位置: `src/main/session-database.js:79`

**Files Changed:**
- `src/main/config-manager.js` - 添加 quickCommands 配置和方法
- `src/main/ipc-handlers/config-handlers.js` - 快捷命令 IPC 处理器
- `src/preload/preload.js` - 暴露快捷命令 API
- `src/renderer/pages/main/components/RightPanel/QuickCommands.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/QuickInput.vue` - 添加快捷命令区域
- `src/renderer/locales/zh-CN.js`, `en-US.js` - 添加翻译
- `src/main/session-database.js` - 添加 busy_timeout

**Attempted but Reverted:**

1. **百度语音识别功能** (已撤销)
   - 计划在右侧快捷输入添加麦克风按钮
   - 使用百度短语音识别 API (60秒免费)
   - 遇到问题：点击麦克风按钮后页面被重新加载
   - 原因未明：所有代码执行正常，但页面在 `isRecording.value = true` 后重载
   - 相关文件已通过 git 撤销
   - 待后续排查 Vite HMR 或 Electron 媒体权限机制

---

### 2026-01-19: Appearance Settings & Session File Watcher

**Overview:**
将外观设置从全局设置中拆分为独立页面，新增会话文件监听功能。

**New Features:**

1. **独立外观设置页面 (appearance-settings)**
   - 从 GlobalSettingsContent.vue 拆分出外观相关设置
   - 包含：主题切换、语言选择、终端字体配置
   - 新文件：`src/renderer/pages/appearance-settings/`
   - 关注点分离，提高代码可维护性

2. **会话文件监听器 (session-file-watcher.js)**
   - 监控 `~/.claude/projects/{encodedPath}/` 目录
   - 检测 .jsonl 会话文件变化
   - 支持目录不存在时的等待机制
   - 1秒防抖，避免频繁刷新
   - 自动通知前端刷新会话列表

**Files Changed:**
- `src/renderer/pages/appearance-settings/` (新增)
- `src/main/session-file-watcher.js` (新增)
- `src/main/ipc-handlers.js` - 添加 `window:openAppearanceSettings`
- `src/renderer/pages/global-settings/components/GlobalSettingsContent.vue` - 移除外观设置 (-127行)
- `src/preload/preload.js` - 暴露新 API
- `vite.config.js` - 新增入口点

**Code Metrics:**
- GlobalSettingsContent.vue: 333 → 206 行 (-38%)
- 新增 AppearanceSettingsContent.vue: 236 行
- 关注点分离，全局设置聚焦于模型和会话配置

---

### 2026-01-17 ~ 2026-01-18: CI/CD & macOS Compatibility

**Overview:**
完善 GitHub Actions 自动构建配置，修复 macOS 平台兼容性问题。

**CI/CD Improvements:**

1. **GitHub Actions 配置** (commit d5a6395)
   - 添加自动构建工作流
   - 支持 Windows、macOS、Linux 多平台
   - 推送 tag 自动触发发布

2. **构建优化** (commits 171bdca, 5869dfd, b5861cc)
   - 添加 CI 环境变量和超时设置
   - 添加并发控制防止构建冲突
   - 简化构建配置

3. **发布流程** (commit dd1e563)
   - 禁用 electron-builder 自动发布
   - 使用独立 release job 管理发布

**macOS Fixes:**

1. **子窗口和 Dialog 问题** (commits 530b66c, ccb9065)
   - 修复 macOS 上子窗口无法正常显示
   - 修复文件选择对话框问题
   - 添加调试日志辅助排查

2. **模块加载诊断** (commit 2078cab)
   - 添加模块加载诊断日志
   - 帮助定位跨平台兼容问题

**Terminal Font Optimization** (commit 9419b8b):
- 优化终端字体配置
- 支持多字体回退链
- 改进中文字体显示

---

### 2026-01-16: Phase 3 Code Refactoring & CSS Variable Migration

**Overview:**
Large-scale code refactoring to improve maintainability and establish correct CSS architecture. This includes extracting composables, modularizing ConfigManager with mixins, and migrating all hardcoded colors to CSS variables.

**Phase 1-2: Composables Extraction**

1. **New Composables Created:**
   ```
   src/renderer/composables/
   ├── useProjects.js       # Project management logic (292 lines)
   ├── useTabManagement.js  # Tab lifecycle management (246 lines)
   └── useSessionPanel.js   # Session panel state & actions (426 lines)
   ```

2. **useProjects.js Functions:**
   - `loadProjects()` - Load and sort projects
   - `selectProject()` - Select with validation callbacks
   - `openProject()` - Open folder dialog and create project
   - `openFolder()` - Open in system explorer
   - `togglePin()` - Toggle pinned state
   - `hideProject()` - Hide from list
   - `openEditModal()` / `closeEditModal()` / `saveProject()` - Edit flow

3. **useTabManagement.js Functions:**
   - `addSessionTab()` - Create new tab from session
   - `ensureSessionTab()` - Create or focus existing
   - `selectTab()` - Select with project switch callback
   - `closeTab()` - Close and cleanup
   - `handleSessionCreated/Selected/Closed()` - Event handlers
   - `updateTabStatus()` / `updateTabTitle()` - State updates
   - `findTabBySessionId()` - Lookup helper

4. **useSessionPanel.js Functions:**
   - `loadActiveSessions()` / `loadHistorySessions()` - Data loading
   - `checkCanCreateSession()` - Limit validation
   - `createSession()` / `closeSession()` - Lifecycle
   - `resumeHistorySession()` / `deleteHistorySession()` - History ops
   - `formatSessionName()` / `formatDate()` - Display helpers

**Phase 3: Backend Modularization**

1. **ConfigManager Mixin Extraction:**
   ```
   src/main/config/
   ├── provider-config.js   # Service provider methods (existing)
   ├── project-config.js    # Project management methods (existing)
   └── api-config.js        # API profile methods (NEW - 266 lines)
   ```

2. **api-config.js Methods:**
   - `getAPIProfiles()` / `getAPIProfile()` - Read operations
   - `addAPIProfile()` / `updateAPIProfile()` / `deleteAPIProfile()` - CRUD
   - `setDefaultProfile()` / `getDefaultProfile()` / `getDefaultProfileId()` - Default management
   - `addCustomModel()` / `deleteCustomModel()` / `updateCustomModel()` - Model CRUD

3. **IPC Optimization:**
   - Created merged `getSessionLimits` handler (returns runningCount + maxSessions)
   - Reduces 2 IPC calls to 1 (50% reduction for session limit checks)

**Phase 4: CSS Variable Migration**

1. **Extended useTheme.js CSS Variables:**
   ```javascript
   // New variables added
   '--border-color-light'  // Secondary border color
   '--scrollbar-thumb'     // Scrollbar thumb color
   '--warning-bg'          // Warning box background
   '--warning-text'        // Warning box text
   '--hover-bg'            // Hover state background
   ```

2. **Migrated Components (9 files):**
   | Component | Before | After | Reduction |
   |-----------|--------|-------|-----------|
   | MainContent.vue | 164 lines | 130 lines | -21% |
   | LeftPanel.vue | 411 lines | 348 lines | -15% |
   | TabBar.vue | 159 lines | 132 lines | -17% |
   | SessionPanel/index.vue | 27 lines | 22 lines | -19% |
   | SessionToolbar.vue | 62 lines | 53 lines | -15% |
   | ActiveSessionList.vue | 183 lines | 161 lines | -12% |
   | HistorySessionList.vue | 108 lines | 100 lines | -7% |
   | ProjectEditModal.vue | 111 lines | 91 lines | -18% |

3. **Changes Made:**
   - Replaced all `.dark-theme` / `.dark` CSS rules with `var()` references
   - Removed all `:deep(.dark-theme)` selectors
   - Removed unused `isDark` prop from TabBar.vue
   - Removed unused `dark` class bindings from templates

4. **Build Results:**
   - main.css: 13.17 kB → 11.89 kB (**-10% file size**)

**Deleted Files:**
- `src/renderer/pages/main/components/Sidebar.vue` (502 lines, unused legacy)

**Code Metrics:**
- MainContent.vue: 673 → 492 lines (-27%)
- LeftPanel.vue: 1078 → 864 lines (-20%)
- config-manager.js: 972 → 724 lines (-25%)
- Total new composable code: ~964 lines (reusable)
- Net reduction in component code: ~500+ lines

**Architecture Benefits:**
1. Single source of truth for theme colors (useTheme.js)
2. Easy to add new themes (high contrast, custom)
3. Components focus on structure, not theme logic
4. Reduced CSS bundle size
5. Better separation of concerns

---

### 2026-01-15: Active Session Management & Code Refactoring

**Feature Overview:**
Enhanced active session management with improved UI/UX and significant code deduplication.

**New Features:**

1. **Session Title Support**
   - Custom session titles when creating new sessions
   - Title displayed in Tab bar and session list
   - Inline input on welcome page for quick session creation

2. **Session Limit Configuration**
   - `maxActiveSessions` setting in Global Settings
   - Prevents creating more sessions than configured limit
   - Default: 5 concurrent sessions

3. **Welcome Page as Fixed Tab**
   - Welcome page is now a permanent tab (🏠)
   - Can switch back to welcome page after creating sessions
   - Inline session creation form (no modal popup needed)

4. **Session List Reordering**
   - Up/down arrow buttons to reorder sessions
   - Visual distinction for sessions from other projects
   - Show all running sessions across projects

5. **Terminal Startup Optimization**
   - PowerShell `-NoLogo -NoProfile` for cleaner startup
   - `cls; claude` to hide command prompt line
   - Removed verbose environment variable display

**Code Refactoring:**

1. **New Composables Created:**
   ```
   src/renderer/composables/
   ├── useSessionUtils.js    # Session status icons, tab helpers
   └── useFormatters.js      # Added formatTimeShort()
   ```

2. **useSessionUtils.js Functions:**
   - `SessionStatus` - Enum for session states
   - `getSessionStatusIcon(status)` - Get emoji icon for status
   - `createTabFromSession(session, project)` - Create tab object
   - `findTabBySessionId(tabs, sessionId)` - Find tab by session ID
   - `removeTabAndGetNextActive(tabs, tabId, currentActiveId)` - Remove tab and return next active
   - `swapArrayItems(arr, i, j)` - Swap array elements

3. **Code Deduplication Results:**
   - Removed ~80 lines of duplicate Tab creation code
   - Unified status icon mapping (was different in TabBar vs ActiveSessionList)
   - Centralized time formatting
   - Simplified event handlers using helper functions

4. **MainContent.vue Improvements:**
   - `addSessionTab()` - Unified session tab creation
   - `ensureSessionTab()` - Create or focus existing tab
   - Used `createTabFromSession`, `findTabBySessionId`, `removeTabAndGetNextActive`

5. **SessionPanel/index.vue Improvements:**
   - Used `swapArrayItems` for move up/down operations

6. **ActiveSessionList.vue & TabBar.vue:**
   - Import shared `getSessionStatusIcon` instead of duplicate functions
   - Import `formatTimeShort` for time display

**Files Changed:**
- `src/main/active-session-manager.js` - Session title, PowerShell args
- `src/main/config-manager.js` - maxActiveSessions setting
- `src/main/ipc-handlers.js` - New IPC handlers
- `src/renderer/composables/useSessionUtils.js` (NEW)
- `src/renderer/composables/useFormatters.js` - Added formatTimeShort
- `src/renderer/pages/main/components/MainContent.vue`
- `src/renderer/pages/main/components/TabBar.vue`
- `src/renderer/pages/main/components/SessionPanel/index.vue`
- `src/renderer/pages/main/components/SessionPanel/ActiveSessionList.vue`
- `src/renderer/locales/en-US.js`, `zh-CN.js`
- `src/renderer/pages/global-settings/components/GlobalSettingsContent.vue`

**Bug Fixes:**

1. **Auto-select First Project on Startup**
   - App now automatically selects the first project when launched
   - Welcome page shows session creation form immediately
   - No need to manually click a project in sidebar

2. **pathValid Field Missing After Add/Open Project**
   - Backend `createProject`/`openProject` responses didn't include `pathValid`
   - Fixed by fetching project from `loadProjects()` result which includes `pathValid`
   - Welcome page now correctly shows session form after adding new project

**Development Environment:**

1. **Hot Reload Configuration (concurrently)**
   - `npm run dev` - Parallel Vite + Electron with HMR
   - `npm run dev:vite` - Vite dev server only
   - `npm run dev:electron` - Electron only (requires Vite running)
   - Vue component changes trigger instant page refresh
   - Removed complex vite-plugin-electron setup in favor of simpler concurrently approach

**Commits:**
- `b11d44c` feat: 会话管理增强 - 标题、数量限制及跨项目显示
- `07c469e` fix: 优化终端启动体验
- `a8433d6` feat: 改进欢迎页面和会话列表交互
- `a57ffa7` refactor: 提取会话管理公共函数，减少代码重复
- `c2b3a13` fix: 修复应用启动时项目未自动选中的问题
- `795d837` refactor: 简化热重载配置，使用 concurrently 方案
- `576cac0` fix: 修复添加/打开工程后欢迎页不显示新建会话表单

---

### 2026-01-14: Session History Management (v1.1.0-alpha)

**Feature Overview:**
Complete session history management system allowing users to browse, search, tag, and export their Claude Code conversation history synced from `~/.claude` directory.

**Core Features Implemented:**

1. **SQLite Database Storage**
   - Using `better-sqlite3` for synchronous, performant database operations
   - Tables: `projects`, `sessions`, `messages`, `tags`, `session_tags`, `message_tags`
   - FTS5 full-text search for message content
   - Automatic schema migrations with version tracking
   - ON DELETE CASCADE for tag cleanup

2. **Data Synchronization**
   - Sync from `~/.claude/projects/` directory structure
   - Parses JSONL conversation files
   - Incremental sync (tracks last sync time)
   - Displays sync status with new message count

3. **Two-Level Tag System**
   - Session tags: Tag entire conversations
   - Message tags: Tag individual messages
   - Flow layout tag UI (click to show dropdown)
   - Quick add tag feature (inline input + plus button)
   - Tag management modal with color picker
   - Tag filtering for both sessions and messages

4. **Favorites System**
   - Star sessions as favorites
   - Filter to show favorites only (⭐ button)
   - Favorite notes support

5. **Export & Copy Features**
   - Export to Markdown or JSON
   - Export all or selected messages
   - Ctrl+C copy (prioritizes text selection over message selection)
   - Copy all/selected in Markdown or JSON format

6. **Navigation Features**
   - Go to oldest/newest message buttons
   - Auto-scroll to latest message on load
   - Keyboard shortcut hints

**Code Refactoring:**

1. **Path Utils Extraction** (commit a5d139c)
   - Created `src/main/utils/path-utils.js`
   - Centralized path resolution functions
   - Reused in session-handlers.js and config-manager.js

2. **Vue Component Split** (commit 9df7ffc)
   - Split `SessionManagerContent.vue` (1553 → 780 lines)
   - Extracted: `ProjectList.vue`, `SessionList.vue`, `MessageViewer.vue`, `TagManager.vue`
   - Improved maintainability and reusability

3. **IPC Handlers Extraction** (commit ed4b194)
   - Created `src/main/session-handlers.js`
   - Separated session-related IPC handlers from main ipc-handlers.js
   - Cleaner code organization

**UI Improvements:**

- Tag filter changed from vertical list to flow layout (commit 1427cd3)
- Tag filter trigger changed from hover to click (commit 3b0df42)
- Add tag dropdown also uses flow layout (commit 6b229ee)
- Quick add tag input in dropdowns (commit 3cc06b7)
- Tag manager modal beautification - unified heights (commit 54861af)
- Favorites filter button in session list (commit fb8ee7f)
- Ctrl+C prioritizes text selection (commit 06fd14b)

**File Structure:**
```
src/
├── main/
│   ├── session-manager.js      # SQLite database operations
│   ├── session-handlers.js     # Session-related IPC handlers
│   └── utils/
│       └── path-utils.js       # Path resolution utilities
│
└── renderer/
    └── pages/
        └── session-manager/
            ├── SessionManager.vue           # Page wrapper
            └── components/
                ├── SessionManagerContent.vue # Main container
                ├── ProjectList.vue           # Project list panel
                ├── SessionList.vue           # Session list panel
                ├── MessageViewer.vue         # Message display panel
                └── TagManager.vue            # Tag management modal
```

**Key Technical Decisions:**

- **Click vs Hover for dropdowns**: Hover caused UX issues (dropdown hiding when moving mouse), switched to click trigger with `v-click-outside` directive
- **Text selection priority**: `window.getSelection()` check before intercepting Ctrl+C
- **Tag deletion cascade**: SQLite foreign keys with ON DELETE CASCADE automatically clean up tag associations
- **Flow layout for tags**: CSS flex-wrap for better space utilization

---

### 2026-01-13: Service Provider & Custom Model Management (v1.0.1)

**Problem Identified:**
After the service provider architecture refactoring (commit ba5a676), the Provider Manager UI depended on backend methods that were not yet implemented, causing critical errors when users tried to access the page.

**Issues Fixed:**

1. **Service Provider Management Backend** (commit a052286)
   - Implemented missing `getServiceProviderDefinitions()` method
   - Implemented `getServiceProviderDefinition(id)` for single provider lookup
   - Implemented `addServiceProviderDefinition()` for custom provider creation
   - Implemented `updateServiceProviderDefinition()` for editing providers
   - Implemented `deleteServiceProviderDefinition()` with usage validation
   - Fixed duplicate provider listings (built-in providers were loaded twice)
   - Unified field naming: `isBuiltIn` instead of `builtin` across the codebase
   - Added protection: built-in providers cannot be edited or deleted
   - Added validation: prevents deletion of providers currently in use by profiles

2. **Custom Model Management IPC Handlers** (commit ababd13)
   - Implemented `api:getCustomModels` IPC handler
   - Implemented `api:updateCustomModels` IPC handler
   - Implemented `api:addCustomModel` IPC handler
   - Implemented `api:deleteCustomModel` IPC handler
   - Implemented `api:updateCustomModel` IPC handler
   - Connected all handlers to existing ConfigManager methods
   - Added proper error handling for missing profiles

**Configuration Changes:**

New field added to `config.json`:
```javascript
{
  // Service provider definitions (built-in + custom)
  serviceProviderDefinitions: [
    {
      id: 'official',
      name: '官方 API',
      needsMapping: false,
      baseUrl: 'https://api.anthropic.com',
      defaultModelMapping: null,
      isBuiltIn: true
    }
    // ... custom providers
  ]
}
```

**Code Locations:**
- Service provider methods: `src/main/config-manager.js` (lines 169-300)
- Custom model IPC handlers: `src/main/ipc-handlers.js` (lines 130-163)
- Service provider constants: `src/main/utils/constants.js` (lines 26-33)

**Testing:**
- Provider Manager UI now loads without errors
- Service providers display correctly without duplicates
- Built-in providers show as protected (delete button disabled)
- Custom providers can be added, edited, and deleted
- All custom model management features are functional

**Impact:**
- Provider Manager is now fully functional
- Users can manage custom service providers
- Custom model management is complete
- No breaking changes to existing configurations

### 2026-01-13: Code Refactoring - Shared Modules (v1.0.2)

**Objective:**
Eliminate code duplication across profile-manager and provider-manager modules by extracting shared constants and utility functions.

**Refactoring Work:**

1. **Created Shared Modules** (commit f72694f)
   - `src/renderer/js/shared-constants.js` - Centralized constants (MODEL_TIERS, OFFICIAL_PROVIDERS, DEFAULT_MODELS)
   - `src/renderer/js/shared-utils.js` - Common utility functions (capitalize, isOfficialProvider)

2. **Code Deduplication**
   - Removed ~70 lines of duplicate code from profile-manager.js:
     - Removed duplicate constants (MODEL_TIERS, OFFICIAL_PROVIDERS, DEFAULT_MODELS)
     - Removed duplicate utility functions (capitalize, isOfficialProvider)
     - Removed duplicate UI functions (escapeHtml, showAlert, showModalAlert, formatDate, togglePasswordVisibility) - now using ui-utils.js
   - Removed ~25 lines of duplicate code from provider-manager.js:
     - Removed duplicate constants and utility functions
     - Now references shared modules and ui-utils.js

3. **Additional Optimizations**
   - Unified IPC error handling with `createIPCHandler()` wrapper
   - Centralized form data collection with `collectFormData()` function
   - Improved model mapping field operations with reusable functions

4. **HTML Updates**
   - profile-manager.html: Added script references for shared-constants.js, shared-utils.js, ui-utils.js
   - provider-manager.html: Added script references for shared-constants.js, shared-utils.js, ui-utils.js
   - Ensured correct loading order (constants → utils → ui-utils → main module)

**Code Quality Improvements:**
- Net reduction: ~70 lines of code (approximately 7.5% decrease)
- Maintainability: Constants and utilities now maintained in single location
- Consistency: Shared logic ensures uniform behavior across modules
- Reusability: New modules can easily import shared constants and utilities

**File Structure After Refactoring:**
```
src/renderer/js/
├── shared-constants.js       # NEW: Shared constants for all modules
├── shared-utils.js            # NEW: Shared utility functions
├── utils/
│   ├── constants.js           # UI-specific constants
│   └── ui-utils.js            # UI helper functions (existing, now reused)
├── profile-manager.js         # Refactored: uses shared modules
├── provider-manager.js        # Refactored: uses shared modules
├── global-settings.js         # Independent module
└── app.js                     # Main app module
```

**Testing:**
- All service provider management features tested and working
- All API profile management features tested and working
- Connection testing functional
- Form interactions verified
- No console errors or runtime issues

**Impact:**
- Improved code maintainability and consistency
- Easier to add new features that use shared constants
- Reduced risk of bugs from inconsistent implementations
- Foundation for future refactoring efforts

---

## 📋 Current Status & Next Steps

### ✅ Current Version: v1.2.0 (2026-01-22)

**Status**: 🟢 MVP 已发布，持续迭代中

**发布信息：**
- GitHub: https://github.com/hydroCoderClaud/cc-desktop
- Releases: https://github.com/hydroCoderClaud/cc-desktop/releases
- 支持平台: Windows (x64), macOS (x64, arm64)

**已完成功能：**
- ✅ 服务商管理 (添加/编辑/删除自定义服务商)
- ✅ API 配置文件 (多配置支持)
- ✅ 自定义模型管理
- ✅ 连接测试 (支持代理)
- ✅ 全局设置 (模型、超时、最大会话数)
- ✅ 外观设置 (主题、语言、终端字体)
- ✅ AI 助手面板 - **v1.2.0 增强**
  - 多格式 API 兼容 (Anthropic/OpenAI/MiniMax)
  - 手动压缩 (⧉)，可配置阈值
  - XSS 防护，请求超时
  - 按钮重排，样式优化
- ✅ Agents 标签页 - **v1.2.0 新增**
  - 独立标签页 (🧩)
  - 搜索、空状态
  - 预留 CLI 集成接口
- ✅ 快捷命令 - **v1.2.0 增强**
  - 右侧面板，支持颜色标记
  - 支持转义序列 (\xNN 发送控制字符)
  - 两行显示 + 溢出上拉菜单
- ✅ 消息队列 - **v1.2.0 重构**
  - useMessageQueue composable
  - 拖拽排序、分页
  - 搜索图标优化
- ✅ 快速输入区
  - 发送按钮 (▶)
  - 加入队列 (+)
  - 创建提示词 (💬)
- ✅ 中英文切换 - **v1.2.0 新增**
  - 左下角语言切换按钮 (EN/中)
- ✅ 会话历史管理
  - SQLite 存储 + FTS5 全文搜索
  - 从 ~/.claude 目录同步
  - 两级标签系统 (会话 + 消息标签)
  - 收藏与筛选
  - 导出/复制 (Markdown/JSON)
- ✅ 活动会话管理
  - 会话标题支持
  - 欢迎页固定标签
  - 会话列表排序
  - 跨项目会话显示
- ✅ 代码架构重构
  - Composables: useProjects, useTabManagement, useSessionPanel, useMessageQueue, useEscapeParser 等 15 个
  - ConfigManager 模块化 (api-config, provider-config, project-config)
  - CSS 变量主题系统 (useTheme.js)
- ✅ CI/CD
  - GitHub Actions 自动构建
  - 推送 tag 自动发布
- ✅ 跨平台兼容
  - macOS 子窗口和 dialog 问题修复
  - 终端字体配置优化

### 🎯 Next Steps: v1.3.0 - Agents 集成 & 扩展

**计划功能：**
- [ ] Agents 集成 - 从 Claude Code CLI 加载 agents 列表
- [ ] 语音输入 (百度语音识别) - 待排查页面重载问题
- [ ] 会话信息面板 (Token 用量、元数据)
- [ ] 项目文件浏览器

### 🔧 后期调优 (低优先级)

**P1-1: 数据库方法复用**
- `updateSessionTitleByUuid` 可复用 `updateSessionTitle`，减少重复 SQL
- 风险低，收益小（约 5 行代码）
- 位置: `src/main/database/session-db.js:238-267`

**P2-1: 添加手动同步按钮**
- 在历史会话"查看更多"旁边添加刷新/同步按钮
- 让用户可手动同步命令行创建的会话
- 调用现有的 `session:sync` IPC

**P2-2: 清理调试日志**
- 移除过多的 `console.log` 调试语句
- 可考虑引入日志级别控制（debug/info/warn/error）
- 减少生产环境控制台噪音

**P2-3: 项目级同步防抖**
- 同一项目短时间内（如 30 秒）不重复同步
- 进一步减少启动时的文件扫描开销

### 📍 Quick Reference

**关键文件：**
- 📖 `CLAUDE.md` - 开发历史和架构 (AI 参考)
- 📝 `docs/CHANGELOG.md` - 版本历史
- 📄 `README.md` - 项目介绍
- 📦 `package.json` - 版本号 (1.2.0)

**文档目录：**
```
docs/
├── CHANGELOG.md              # 主变更日志
├── ARCHITECTURE.md           # 架构说明
├── QUICKSTART.md             # 快速开始
├── CUSTOM-UI-GUIDE.md        # 自定义 UI 模式 (预留)
├── SESSION-MANAGEMENT-DESIGN.md  # 会话管理设计
└── ...                       # 其他参考文档
```
