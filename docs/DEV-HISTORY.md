# 开发历史

---

## 2026-01-24: v1.3.0 - Skills/Hooks/MCP 完整管理

**统一架构模式**：Manager → IPC → Preload → Vue 组件

| 模块 | 后端 | 前端组件 |
|------|------|----------|
| Skills | `managers/skills/` | `skills/*.vue` |
| Hooks | `managers/hooks-manager.js` | `hooks/*.vue` |
| MCP | `managers/mcp-manager.js` | `mcp/*.vue` |

**常见陷阱记录**：
- Vue Proxy 对象无法 IPC 传输 → `JSON.parse(JSON.stringify())`
- Naive UI Dialog 回调 → `onPositiveClick` 非 `onPositive`

---

## 2026-01-22~23: v1.2.x - Plugin 管理 & AI 增强

- Plugin 管理：展示/启用/禁用/卸载
- AI 助手：多格式 API、手动压缩、XSS 防护
- Hooks/Agents 独立标签页
- 中英文切换

---

## 2026-01-15~21: v1.1.x - 会话管理 & CI/CD

- 会话历史：SQLite + FTS5
- 活动会话：标题、限流
- GitHub Actions：多平台构建
- macOS 兼容性修复

---

## 2026-01-12~14: v1.0.x - 首次发布

**独立架构**：Desktop = CLI Launcher + Terminal Emulator

- Electron + node-pty + xterm.js
- Vue 3 + Naive UI
- 项目管理 + 会话历史
