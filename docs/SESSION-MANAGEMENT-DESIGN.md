# Session Management Design Document

## Overview

This document describes the design for the session management feature in Claude Code Desktop. Based on our investigation, Claude Code stores conversation history in `~/.claude/projects/<project-path>/` directory as JSONL files.

## Data Source

### Claude Code Data Structure

```
~/.claude/
├── history.jsonl              # Global input history
├── projects/
│   └── <path-encoded>/        # e.g., C--workspace-develop-xxx
│       ├── <uuid>.jsonl       # Session transcript files
│       └── <uuid>/            # Session-related folders
│           └── subagents/
├── transcripts/               # Legacy transcript storage
├── todos/                     # Task lists
└── plans/                     # Plan files
```

### Message Types in Session JSONL

| Type | Description | Key Fields |
|------|-------------|------------|
| `user` | User messages | message.content, timestamp, cwd, gitBranch |
| `assistant` | AI responses | message.content[], message.model, message.usage |
| `system` | System messages | subtype, level, error |
| `summary` | Session summary | summary, leafUuid |
| `file-history-snapshot` | File changes | snapshot |

### Sample Message Structures

**User Message:**
```json
{
  "type": "user",
  "uuid": "bdfb0f58-...",
  "parentUuid": null,
  "sessionId": "28dcbab6-...",
  "timestamp": "2026-01-12T11:45:48.535Z",
  "cwd": "C:\\workspace\\develop\\HydroCoder\\cc-desktop",
  "gitBranch": "master",
  "version": "2.1.5",
  "message": {
    "role": "user",
    "content": "hi"
  }
}
```

**Assistant Message:**
```json
{
  "type": "assistant",
  "uuid": "d205edcf-...",
  "parentUuid": "48a8ff97-...",
  "sessionId": "28dcbab6-...",
  "timestamp": "2026-01-12T11:45:54.496Z",
  "message": {
    "id": "05b411ec...",
    "type": "message",
    "role": "assistant",
    "content": [
      {"type": "text", "text": "Hello! How can I help you today?"}
    ],
    "model": "MiniMax-M2",
    "usage": {
      "input_tokens": 372,
      "output_tokens": 151
    }
  }
}
```

## Architecture

### Hybrid Mode Design

We adopt a **hybrid mode** approach:
- **Terminal Sessions**: Managed by our application (start/stop PTY)
- **Conversation History**: Read-only from Claude's data files

```
┌─────────────────────────────────────────────────────────┐
│                    CC Desktop App                        │
├─────────────────────────────────────────────────────────┤
│  Terminal Session Manager    │  Session History Reader   │
│  (Our Control)               │  (Read-Only)              │
│  - Start/Stop PTY            │  - Read ~/.claude/        │
│  - Project switching         │  - Parse JSONL files      │
│  - API key injection         │  - Display conversations  │
└─────────────────────────────────────────────────────────┘
```

### Components

#### 1. SessionHistoryService (Main Process)

```javascript
// src/main/session-history-service.js
class SessionHistoryService {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.projectsDir = path.join(this.claudeDir, 'projects')
  }

  // Get all projects with session data
  async getProjects() {}

  // Get sessions for a specific project
  async getProjectSessions(projectPath) {}

  // Get session messages
  async getSessionMessages(projectPath, sessionId) {}

  // Search across sessions
  async searchSessions(query, projectPath?) {}

  // Export session to markdown/JSON
  async exportSession(sessionId, format) {}
}
```

#### 2. Data Models

```typescript
// Types for session data

interface ClaudeProject {
  path: string           // Original project path
  encodedPath: string    // Path-encoded directory name
  lastModified: Date
  sessionCount: number
}

interface ClaudeSession {
  id: string             // UUID
  projectPath: string
  startTime: Date
  lastMessageTime: Date
  messageCount: number
  summary?: string
  model?: string
}

interface SessionMessage {
  type: 'user' | 'assistant' | 'system' | 'summary'
  uuid: string
  parentUuid?: string
  timestamp: Date
  content: string | MessageContent[]
  model?: string
  usage?: TokenUsage
}

interface MessageContent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  text?: string
  thinking?: string
}

interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}
```

#### 3. IPC Handlers

```javascript
// New IPC handlers for session management
ipcMain.handle('session:getProjects', () => sessionHistoryService.getProjects())
ipcMain.handle('session:getProjectSessions', (_, projectPath) =>
  sessionHistoryService.getProjectSessions(projectPath))
ipcMain.handle('session:getMessages', (_, projectPath, sessionId) =>
  sessionHistoryService.getSessionMessages(projectPath, sessionId))
ipcMain.handle('session:search', (_, query, projectPath) =>
  sessionHistoryService.searchSessions(query, projectPath))
ipcMain.handle('session:export', (_, sessionId, format) =>
  sessionHistoryService.exportSession(sessionId, format))
```

#### 4. Vue Components

```
src/renderer/pages/session-manager/
├── App.vue                    # Root component with providers
├── main.js                    # Entry point
├── index.html                 # HTML template
└── components/
    ├── SessionManagerContent.vue   # Main layout
    ├── ProjectList.vue             # Project sidebar
    ├── SessionList.vue             # Session list
    ├── SessionViewer.vue           # Message viewer
    ├── SearchBar.vue               # Search functionality
    └── ExportDialog.vue            # Export options
```

## UI Design

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Session History                               [Search] [Export] │
├──────────────┬─────────────────────────────────────────────────┤
│ Projects     │ Sessions                                         │
│              │                                                  │
│ □ cc-desktop │ ┌─────────────────────────────────────────────┐ │
│ □ hydro-sim  │ │ 2026-01-13 21:00                           │ │
│ □ trader-v2  │ │ Vue migration and i18n                      │ │
│              │ │ 156 messages • claude-opus-4                │ │
│              │ └─────────────────────────────────────────────┘ │
│              │ ┌─────────────────────────────────────────────┐ │
│              │ │ 2026-01-12 19:45                           │ │
│              │ │ Service provider backend                    │ │
│              │ │ 42 messages • claude-sonnet-4               │ │
│              │ └─────────────────────────────────────────────┘ │
├──────────────┴─────────────────────────────────────────────────┤
│ Conversation View                                              │
│                                                                │
│ [User] hi                                                      │
│                                                                │
│ [Assistant] Hello! How can I help you today?                   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Features

1. **Project List**
   - Show all projects with Claude session data
   - Sort by last modified
   - Show session count

2. **Session List**
   - List sessions for selected project
   - Show timestamp, summary, message count
   - Sort by date (newest first)

3. **Session Viewer**
   - Display conversation with proper formatting
   - Distinguish user/assistant messages
   - Show model info and token usage
   - Collapse/expand thinking blocks

4. **Search**
   - Full-text search across conversations
   - Filter by project, date range
   - Highlight search matches

5. **Export**
   - Export to Markdown
   - Export to JSON
   - Copy conversation to clipboard

## Implementation Plan

### Phase 1: Core Service (Backend)
1. Implement `SessionHistoryService` class
2. Add path encoding/decoding utilities
3. Create JSONL parser for session files
4. Register IPC handlers

### Phase 2: Basic UI
1. Create session-manager page structure
2. Implement `ProjectList` component
3. Implement `SessionList` component
4. Implement basic `SessionViewer`

### Phase 3: Enhanced Features
1. Add search functionality
2. Implement export features
3. Add token usage display
4. Support thinking block toggle

### Phase 4: Integration
1. Add session history access from main app
2. Quick access to recent sessions
3. Link project selection to session history

## Security Considerations

1. **Read-Only Access**: Never modify Claude's data files
2. **Path Validation**: Validate encoded paths to prevent traversal
3. **Error Handling**: Graceful handling of corrupted/invalid files

## Performance Considerations

1. **Lazy Loading**: Load session list first, messages on demand
2. **Virtual Scrolling**: For sessions with many messages
3. **Caching**: Cache parsed session data in memory
4. **File Watching**: Optional - watch for new sessions (debounced)

## Future Enhancements

1. **Statistics Dashboard**: Token usage, session duration charts
2. **Tagging System**: Add custom tags to sessions
3. **Bookmarks**: Bookmark important sessions
4. **Comparison View**: Compare two sessions side by side
