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
