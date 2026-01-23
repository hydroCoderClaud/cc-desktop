# 开发历史详细记录

本文档记录每个版本的详细开发历史，包括具体实现细节、文件变更和技术决策。

> **精简版变更日志请查看 [CHANGELOG.md](./CHANGELOG.md)**

---

## 2026-01-23: Commands & Hooks 标签页实现 (v1.2.1)

**Overview:**
完善右侧面板功能，新增 Commands 和 Hooks 独立标签页，实现可视化编辑 hooks 配置，优化标签栏布局，修复多个 bug。

**New Features:**

1. **Commands 标签页**
   - 新增 `CommandsTab.vue` 独立标签页
   - 图标 ⌨️，显示所有已安装插件的命令
   - 按分类分组展开/折叠（默认折叠）
   - 搜索功能，支持命令名称和描述
   - 点击命令插入到输入框（格式：`/command-name`）
   - 显示命令来源插件和描述信息

2. **Hooks 标签页**
   - 新增 `HooksTab.vue` 独立标签页
   - 图标 🪝，显示所有 hooks（插件 + 全局设置）
   - 按事件类型分组展开/折叠（PreToolUse、PostToolUse、Stop 等）
   - 搜索功能，支持事件名称和描述
   - **可视化编辑功能**：
     - 点击 hook 打开编辑模态框
     - 使用 Naive UI 组件（NForm、NFormItem、NInput、NSelect、NButton）
     - 可编辑字段：matcher（匹配规则）、type（类型）、command（命令）
     - event 字段只读显示
     - 保存时仅更新选中的 hook，不影响其他配置
     - 支持编辑 hooks.json 和插件 hooks

3. **Tab Bar 布局优化**
   - 问题：9个标签页（280px+）超出320px面板宽度
   - 解决：标签按钮宽度 36px → 28px，图标 16px → 15px
   - 所有标签页均可见，无溢出

**UI Improvements:**

1. **右侧面板标签更新**
   - 新增 Commands (⌨️) 和 Hooks (🪝) 标签
   - 更新标签顺序（9个标签）：
     ```
     💬 提示词 | 📜 队列 | 🔧 插件 | ⌨️ 命令 | ⚡ 技能 | 🪝 Hooks | 🌐 MCP | 🧩 Agents | 🤖 AI
     ```

2. **Hooks 编辑器风格统一**
   - 采用 Naive UI 组件库，与 PromptsTab.vue 保持一致
   - 输入框清晰边框，主题色保存按钮
   - 移除 106 行自定义表单样式，依赖 Naive UI 主题系统

3. **Skills 交互优化**
   - 默认不展开分类，减少视觉干扰
   - 用户需手动点击展开查看具体技能

**Bug Fixes:**

1. **Hooks 面板显示为空**
   - 问题：`hooks-manager.js` 调用不存在的 `getGlobalSettingsPath()` 方法
   - 修复：改用 `this.settingsPath` 属性
   - 问题：缺少必需的 `id` 和 `name` 字段
   - 修复：在 `_parseHooksConfig` 中添加唯一 ID 生成逻辑

2. **Hook 保存失败 - "An object could not be cloned"**
   - 问题：IPC 通信中对象包含不可序列化内容（函数、循环引用）
   - 修复：使用 `JSON.parse(JSON.stringify(fullData))` 深拷贝数据
   - 确保对象完全可序列化，避免 Electron structured clone algorithm 错误

3. **AI 助手 API 配置列表不更新**
   - 问题：添加新 API 配置后下拉列表未刷新
   - 修复：在 `AITab.vue` 添加 watch，打开设置面板时自动重新加载配置列表
   - 位置：`src/renderer/pages/main/components/RightPanel/tabs/AITab.vue`

**Backend Enhancements:**

1. **文件操作 IPC 处理器**
   - 新增 `file:readJson` - 读取 JSON 配置文件
   - 新增 `file:writeJson` - 写入 JSON 配置文件
   - 用于 hooks 编辑功能，支持读取和保存 hooks.json

2. **Hooks Manager 增强**
   - 为所有 hook 对象添加 `filePath` 字段
   - 添加唯一 `id` 字段（格式：`${source}-${event}-${index}`）
   - 添加 `name` 字段用于显示
   - 支持定位和更新单个 hook 配置

**Files Changed:**
- `src/renderer/pages/main/components/RightPanel/tabs/CommandsTab.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/tabs/HooksTab.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/index.vue`
- `src/renderer/pages/main/components/RightPanel/TabBar.vue`
- `src/main/hooks-manager.js`
- `src/main/ipc-handlers/plugin-handlers.js`
- `src/preload/preload.js`
- `src/renderer/pages/main/components/RightPanel/tabs/AITab.vue`
- `src/renderer/pages/main/components/RightPanel/tabs/SkillsTab.vue`
- `src/renderer/locales/zh-CN.js`, `en-US.js`

**Code Statistics:**
- 新增：约 640 行（CommandsTab + HooksTab）
- 移除：约 106 行（自定义表单样式）
- 净增加：约 534 行

---

## 2026-01-22: Plugin 管理 & AI 助手增强 & Agents 标签页 (v1.2.0)

**Overview:**
实现 Plugin 管理功能（展示、启用/禁用、卸载）；AI 助手多格式 API 兼容、手动压缩功能；新增独立 Agents 标签页；右侧面板 UI 统一优化。

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

1. **Plugin 管理功能**
   - 新增 `plugin-manager.js` 读取 `~/.claude/plugins/` 插件
   - 新增 `plugin-handlers.js` IPC 处理器
   - 展示插件列表（名称、描述、版本、来源 marketplace）
   - 点击展开显示组件分类：Commands、Agents、Skills、Hooks、MCP
   - Commands/Agents/Skills 点击插入命令到输入框
   - 启用/禁用开关（写入 `~/.claude/settings.json`）
   - 卸载功能（删除注册表和文件）
   - 路径安全检查防止路径遍历攻击
   - 搜索过滤、刷新、打开插件目录

2. **独立 Agents 标签页**
   - 新增 `AgentsTab.vue` (位于 MCP 和 AI 之间)
   - 图标 🧩 使用深色样式
   - 搜索功能、空状态提示
   - 点击 agent 插入 `@agent_name` 到输入框
   - 预留 Claude Code CLI 集成接口

3. **左侧面板中英文切换**
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
- `src/main/plugin-manager.js` (新增)
- `src/main/ipc-handlers/plugin-handlers.js` (新增)
- `src/renderer/pages/main/components/RightPanel/tabs/PluginsTab.vue`
- `src/renderer/pages/main/components/RightPanel/tabs/AgentsTab.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/tabs/AITab.vue`
- `src/main/ipc-handlers/ai-handlers.js`
- `src/main/ipc-handlers.js`
- `src/preload/preload.js`
- `src/main/config-manager.js`
- `src/renderer/pages/main/components/RightPanel/*.vue`
- `src/renderer/pages/main/components/LeftPanel.vue`
- `src/renderer/locales/*.js`

**Tab Order (Right Panel):**
```
💬 提示词 | 📜 队列 | 🔧 插件 | ⚡ 技能 | 🌐 MCP | 🧩 Agents | 🤖 AI
```

---

## 2026-01-21: Quick Commands & Database Lock Fix (v1.1.9)

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
- `src/main/config-manager.js`
- `src/main/ipc-handlers/config-handlers.js`
- `src/preload/preload.js`
- `src/renderer/pages/main/components/RightPanel/QuickCommands.vue` (新增)
- `src/renderer/pages/main/components/RightPanel/QuickInput.vue`
- `src/renderer/locales/zh-CN.js`, `en-US.js`
- `src/main/session-database.js`

**Attempted but Reverted:**

1. **百度语音识别功能** (已撤销)
   - 计划在右侧快捷输入添加麦克风按钮
   - 使用百度短语音识别 API (60秒免费)
   - 遇到问题：点击麦克风按钮后页面被重新加载
   - 原因未明：所有代码执行正常，但页面在 `isRecording.value = true` 后重载
   - 相关文件已通过 git 撤销
   - 待后续排查 Vite HMR 或 Electron 媒体权限机制

---

## 2026-01-19: Appearance Settings & Session File Watcher (v1.1.6)

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
- `src/main/ipc-handlers.js`
- `src/renderer/pages/global-settings/components/GlobalSettingsContent.vue`
- `src/preload/preload.js`
- `vite.config.js`

**Code Metrics:**
- GlobalSettingsContent.vue: 333 → 206 行 (-38%)
- 新增 AppearanceSettingsContent.vue: 236 行

---

## 2026-01-17 ~ 2026-01-18: CI/CD & macOS Compatibility (v1.1.2 ~ v1.1.5)

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

## 2026-01-16: Phase 3 Code Refactoring & CSS Variable Migration (v1.1.1)

**Overview:**
大规模代码重构，提取 Composables，模块化 ConfigManager，CSS 变量迁移。

**Phase 1-2: Composables Extraction**

1. **New Composables Created:**
   ```
   src/renderer/composables/
   ├── useProjects.js       # Project management logic (292 lines)
   ├── useTabManagement.js  # Tab lifecycle management (246 lines)
   └── useSessionPanel.js   # Session panel state & actions (426 lines)
   ```

2. **useProjects.js Functions:**
   - `loadProjects()`, `selectProject()`, `openProject()`, `openFolder()`
   - `togglePin()`, `hideProject()`, `openEditModal()`, `closeEditModal()`, `saveProject()`

3. **useTabManagement.js Functions:**
   - `addSessionTab()`, `ensureSessionTab()`, `selectTab()`, `closeTab()`
   - `handleSessionCreated/Selected/Closed()`, `updateTabStatus()`, `updateTabTitle()`
   - `findTabBySessionId()`

4. **useSessionPanel.js Functions:**
   - `loadActiveSessions()`, `loadHistorySessions()`, `checkCanCreateSession()`
   - `createSession()`, `closeSession()`, `resumeHistorySession()`, `deleteHistorySession()`
   - `formatSessionName()`, `formatDate()`

**Phase 3: Backend Modularization**

1. **ConfigManager Mixin Extraction:**
   ```
   src/main/config/
   ├── provider-config.js   # Service provider methods
   ├── project-config.js    # Project management methods
   └── api-config.js        # API profile methods (NEW - 266 lines)
   ```

2. **IPC Optimization:**
   - Created merged `getSessionLimits` handler (returns runningCount + maxSessions)
   - Reduces 2 IPC calls to 1 (50% reduction)

**Phase 4: CSS Variable Migration**

1. **Extended useTheme.js CSS Variables:**
   - `--border-color-light`, `--scrollbar-thumb`, `--warning-bg`, `--warning-text`, `--hover-bg`

2. **Migrated Components (9 files):**
   - MainContent.vue (-21%), LeftPanel.vue (-15%), TabBar.vue (-17%)
   - SessionPanel/index.vue (-19%), SessionToolbar.vue (-15%)
   - ActiveSessionList.vue (-12%), HistorySessionList.vue (-7%)
   - ProjectEditModal.vue (-18%)

3. **Build Results:**
   - main.css: 13.17 kB → 11.89 kB (**-10% file size**)

**Code Metrics:**
- MainContent.vue: 673 → 492 lines (-27%)
- LeftPanel.vue: 1078 → 864 lines (-20%)
- config-manager.js: 972 → 724 lines (-25%)
- Total new composable code: ~964 lines (reusable)
- Net reduction: ~500+ lines

---

## 2026-01-15: Active Session Management & Code Refactoring (v1.1.0)

**Feature Overview:**
增强活动会话管理，改进 UI/UX，显著减少代码重复。

**New Features:**

1. **Session Title Support** - 创建会话时可自定义标题
2. **Session Limit Configuration** - `maxActiveSessions` 设置
3. **Welcome Page as Fixed Tab** - 欢迎页作为永久 Tab
4. **Session List Reordering** - 上下移动会话顺序
5. **Terminal Startup Optimization** - PowerShell 清洁启动

**Code Refactoring:**

1. **New Composables:**
   - `useSessionUtils.js` - Session status icons, tab helpers
   - `useFormatters.js` - Added `formatTimeShort()`

2. **Code Deduplication Results:**
   - Removed ~80 lines of duplicate Tab creation code
   - Unified status icon mapping
   - Centralized time formatting

**Bug Fixes:**
- 修复应用启动时项目未自动选中的问题
- 修复添加/打开工程后欢迎页不显示新建会话表单

**Development Environment:**
- 简化热重载配置，使用 concurrently 方案

---

## 2026-01-14: Session History Management (v1.0.4)

**Feature Overview:**
完整的会话历史管理系统，支持浏览、搜索、标签和导出 Claude Code 对话历史。

**Core Features Implemented:**

1. **SQLite Database Storage**
   - Using `better-sqlite3` for synchronous, performant operations
   - Tables: `projects`, `sessions`, `messages`, `tags`, `session_tags`, `message_tags`
   - FTS5 full-text search
   - Automatic schema migrations

2. **Data Synchronization** - 从 `~/.claude/projects/` 增量同步

3. **Two-Level Tag System** - 会话标签和消息标签

4. **Favorites System** - 收藏和筛选

5. **Export & Copy** - Markdown/JSON 导出

**Code Refactoring:**
- 提取 `path-utils.js`
- 拆分 `SessionManagerContent.vue` (1553 → 780 lines)
- 提取 `session-handlers.js`

---

## 2026-01-13: Service Provider & Custom Model Management (v1.0.1 ~ v1.0.2)

**v1.0.1 - 服务商管理功能完善:**
- 实现所有缺失的服务商管理后端方法
- 实现自定义模型管理 IPC 处理器
- 修复服务商列表重复显示问题
- 统一字段命名 `isBuiltIn`

**v1.0.2 - 代码重构共享模块:**
- 创建 `shared-constants.js` 和 `shared-utils.js`
- 消除 profile-manager.js 和 provider-manager.js 重复代码 (~95 行)
- 统一 IPC 错误处理

---

## 2026-01-12: v1.0.0 首次发布

**完全重写** - 从 Web 版独立，采用全新简化架构。

**移除的功能**（Web 版特有）：
- 多用户认证系统
- JWT Token 管理
- WebSocket 通信
- 模板/Prompt 三级管理

**新增的功能**（Desktop 专属）：
- 本地配置管理（ConfigManager）
- 简化的终端管理（TerminalManager）
- IPC 通信架构
- 系统文件夹选择对话框

**代码统计：**
- 总计 ~1,200 行代码
- 相比 Web 版适配方案减少 60%
