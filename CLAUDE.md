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

**Commits:**
- `b11d44c` feat: 会话管理增强 - 标题、数量限制及跨项目显示
- `07c469e` fix: 优化终端启动体验
- `a8433d6` feat: 改进欢迎页面和会话列表交互

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

### ✅ Current Version: v1.1.0-alpha (2026-01-15)

**Status**: 🟢 Active session management enhanced

**What's Working:**
- ✅ Service provider management (add/edit/delete custom providers)
- ✅ API profile configuration (multi-profile support)
- ✅ Custom model management per profile
- ✅ Connection testing with proxy support
- ✅ Global settings (models, timeout, maxActiveSessions)
- ✅ Session history management
  - SQLite storage with FTS5 full-text search
  - Sync from ~/.claude directory
  - Two-level tag system (session + message tags)
  - Favorites with filtering
  - Export/copy (Markdown/JSON)
- ✅ **Active session management (ENHANCED)**
  - Session titles support
  - Welcome page as fixed tab
  - Session list reordering (up/down arrows)
  - Cross-project session display
  - Max sessions limit configuration
- ✅ Code refactored (useSessionUtils, useFormatters, path-utils)

### 🎯 Next Steps (Immediate)

**Priority 1 - Vue 3 + Naive UI Migration** (In Progress)
- [ ] Test all Vue pages in Vite dev mode
- [ ] Verify IPC communication
- [ ] Configure Vite production build
- [ ] Update electron-builder config
- [ ] Remove old HTML/JS files

**Priority 2 - Code Quality**
- [ ] Add unit tests for core ConfigManager methods
- [ ] Improve error messages with user-friendly translations

**Priority 3 - Small Enhancements**
- [ ] Optimize loading indicators
- [ ] Improve form validation feedback

### 🚀 Future Roadmap

See detailed plans in `docs/CHANGELOG.md`:

**v1.2.0** - Advanced Features
- Multiple terminal tabs
- Terminal history search
- Keyboard shortcuts configuration
- Auto-update checker

**v2.0.0** - Long-term Vision
- Plugin system
- AI assistance features
- Cloud config sync
- Team collaboration

### 📍 Quick Reference for Next Session

**⚡ Fast Start - Check these in order:**

1. **📋 TODO.md** - Quick overview of pending tasks and priorities (START HERE!)
2. **📖 CLAUDE.md** (this file) - Read "Recent Development History" section for latest changes
3. **📝 docs/CHANGELOG.md** - Check version updates and detailed feature list
4. **💻 git log --oneline -10** - Review recent commits

**Key Files to Know:**
- 📋 `TODO.md` - **Quick task list and next steps** (CHECK THIS FIRST!)
- 📖 `CLAUDE.md` - Complete development history and architecture (for AI)
- 📝 `docs/CHANGELOG.md` - Version history and future plans (for humans)
- 📄 `README.md` - Project overview and quick start
- 📦 `package.json` - Current version number

**💡 TIP**: If you just want to know "what to do next", go straight to `TODO.md`!
