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
│   └── ipc-handlers.js       # IPC channel definitions
│
├── preload/
│   └── preload.js            # contextBridge API (security)
│
└── renderer/                 # Renderer process (Browser)
    ├── index.html            # UI with xterm.js from CDN
    └── js/
        └── app.js            # Main app logic, xterm integration
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

### ✅ Current Version: v1.0.2 (2026-01-13)

**Status**: 🟢 Stable and fully functional

**What's Working:**
- ✅ Service provider management (add/edit/delete custom providers)
- ✅ API profile configuration (multi-profile support)
- ✅ Custom model management per profile
- ✅ Connection testing with proxy support
- ✅ Global settings (models, timeout)
- ✅ Code refactored with shared modules
- ✅ All features tested and validated

### 🎯 Next Steps (Immediate)

**Priority 1 - Code Quality**
- [ ] Consider extracting global-settings.js model constants to shared-constants.js (optional)
- [ ] Add unit tests for core ConfigManager methods
- [ ] Improve error messages with user-friendly translations

**Priority 2 - Small Enhancements**
- [ ] Add loading indicators for async operations
- [ ] Implement form validation feedback improvements
- [ ] Optimize re-rendering in profile/provider lists

### 🚀 Future Roadmap

See detailed plans in `docs/CHANGELOG.md` (末尾"未来版本计划"章节):

**v1.1.0** - UI Enhancements
- Settings dialog GUI
- Right-click context menu for projects
- Terminal font/size settings
- Custom project icons

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

**When you return, check these in order:**

1. **CLAUDE.md** (this file) - Read "Recent Development History" section for latest changes
2. **docs/CHANGELOG.md** - Check version updates and detailed feature list
3. **git log --oneline -10** - Review recent commits
4. **This section** - Review "Next Steps" for pending tasks

**Key Files to Know:**
- `CLAUDE.md` - Complete development history and architecture (for AI)
- `docs/CHANGELOG.md` - Version history and future plans (for humans)
- `README.md` - Project overview and quick start
- `package.json` - Current version number
