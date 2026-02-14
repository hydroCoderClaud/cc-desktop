# 更新日志

---

## v1.6.39 - 2026-02-15

### 新功能 (Features)

**视频预览**
- 右侧面板支持 MP4/WebM/MOV/AVI/MKV/OGG 视频文件播放
- 通过 IPC 读取为 base64 data URL（避免 file:// CSP 限制）
- 自动播放、滚轮调节音量、双击全屏
- 视频信息栏显示分辨率、时长、文件大小
- CSP 策略添加 `media-src 'self' data:`

### 修复 (Bug Fixes)

**能力管理**
- http-client 添加 Cache-Control 头，解决 CDN 缓存导致能力清单不更新
- CapabilityModal 分类名支持多语言（categoryName 按 locale 取值）
- ChatInput ⚡ 能力列表每次打开都刷新，不再一次性缓存

**消息交互**
- MessageBubble 单行代码块中的路径/URL 可点击预览
- 路径正则排除 slash 命令（`/compact` 等不再误识别为路径）

**Agent 文件操作**
- readAbsolutePath 支持相对路径和 `~/` 路径解析
- 修复 `_resolveCwd` 调用路径（fileManager 重构遗留）

**代码质量**
- 视频 MIME 映射和大小限制常量提取到 agent-constants.js，消除 3 处重复定义
- agent-handlers 视频大小限制独立为 50MB（不被通用 10MB 拦截）

---

## v1.6.38 - 2026-02-14

### 重构 (Refactor)

**Agent 会话管理器模块化重构**
- **三阶段渐进式拆分**：将 `agent-session-manager.js` 从 1651 行减少到 1274 行（-377 行，-22.8%）
  - Phase 1: 提取常量模块 `utils/agent-constants.js` (102 行)
  - Phase 2: 提取文件操作模块 `managers/agent-file-manager.js` (355 行)
  - Phase 3: 提取 Query 控制模块 `managers/agent-query-manager.js` (105 行)
- **设计模式**：依赖注入 + 委托模式，保持公共 API 稳定
- **架构优势**：
  - ✅ 职责单一，边界清晰
  - ✅ 独立模块易于单元测试
  - ✅ 便于未来功能扩展

### 修复 (Bug Fixes)

**Agent 文件操作错误处理**
- **修复同名文件创建误报成功问题**：后端返回 `{ error }` 但前端未检查，导致显示"创建成功"
- **国际化错误消息**：添加 3 个 i18n 翻译 key
  - `agent.files.fileAlreadyExists` - 文件或文件夹已存在
  - `agent.files.targetNameExists` - 目标名称已存在
  - `agent.files.fileNotFound` - 文件或文件夹不存在
- **统一错误显示**：使用 `mapErrorMessage()` 映射后端英文错误到本地化文本
- **影响范围**：创建文件、创建文件夹、重命名、删除

### 文档 (Documentation)

**CLAUDE.md 完善**
- 更新架构图：添加 3 个新模块说明
- 新增实战案例章节：完整记录 agent-session-manager 重构过程
  - 三阶段拆分表格
  - 新增模块架构说明
  - 核心设计模式示例
  - 重构收益与关键经验
- 更新合理设计示例：使用实际重构方案和行数

### Git 提交记录

- `0cf2ff6` - refactor: 提取常量模块 — Phase 1
- `8f94b95` - refactor: 提取文件操作模块 — Phase 2
- `3e94d3f` - refactor: 提取 Query 控制模块 — Phase 3
- `22885ff` - fix: Agent 文件操作错误处理
- `e303305` - i18n: 文件操作错误消息国际化
- `f77dc17` - docs: 更新 CLAUDE.md

---

## v1.6.37 - 2026-02-14

### 新增 (Features)

**Agent 模式右侧面板增强（webview 预览方案）**
- **可拖动调整面板宽度**：主内容区域和右侧面板之间添加拖动分隔条
  - 默认比例 2:1（聊天 66.7%，面板 33.3%）
  - 拖动范围限制：20% ~ 50%
  - 宽度配置持久化（保存到 `config.json` 的 `ui.rightPanelWidth`）
  - 鼠标悬停分隔条高亮提示
  - Developer 模式和 Agent 模式共用配置

- **图片预览增强**：
  - 工具栏：放大、缩小、重置缩放、下载
  - 鼠标滚轮缩放支持（步长 0.1，范围 0.25x ~ 5x）
  - 图片信息显示（宽 × 高，文件大小）
  - 图标优化：缩小按钮使用 `-` 图标（语义更准确）

- **HTML 文件预览**：
  - 检测 `.html` / `.htm` 文件并用 iframe 渲染
  - 安全沙箱（sandbox="allow-scripts allow-same-origin"）
  - 刷新按钮支持重新加载

- **聊天消息图片点击预览**：
  - 点击聊天区域的图片 → 右侧面板预览
  - 自动展开右侧面板（如果折叠）
  - 支持缩放、下载等所有图片预览功能

- **超链接点击预览（webview 方案）**：
  - **单击预览 · 双击打开**交互模式
  - URL 链接（http/https）→ **webview 预览网页**（✅ 支持所有网站）
  - 文件路径链接（本地路径）→ 读取并预览文件
  - 支持路径类型：Windows 路径、Unix 路径、相对路径、~ 路径
  - 提示文本：`单击预览 · 双击打开`
  - **技术升级**：使用 Electron webview 标签，绕过 X-Frame-Options 限制

- **预览功能优化**：
  - ESC 键快速关闭预览
  - 加载状态优化（50ms 延迟提供视觉反馈）
  - 预览切换时自动重置缩放状态

### 技术细节 (Technical Details)

**webview 安全配置**：
- 主进程启用 `webviewTag: true`
- webview 安全参数：
  - `nodeintegration="false"` - 禁用 Node.js API
  - `partition="persist:webview-preview"` - 独立会话隔离
  - `disablewebsecurity="false"` - 保持安全策略
  - `allowpopups="false"` - 禁止弹窗
- 优势：可以预览所有网站（百度、Google、GitHub 等）
- 风险控制：进程隔离 + 沙箱配置，安全性等同于 Chrome 浏览器

**事件传递链路**：
```
MessageBubble (@click / @preview-image / @preview-link / @preview-path)
  ↓ emit
AgentChatTab
  ↓ emit
MainContent (handlePreviewImage / handlePreviewLink / handlePreviewPath)
  ↓ 调用方法
AgentRightPanel.previewImage()
  ↓
FilePreview 显示
```

**配置持久化**：
- 右侧面板宽度保存到 `config.json` → `ui.rightPanelWidth`
- 应用启动时自动加载上次保存的宽度

**修改文件**：
- `src/main/index.js` - 启用 webviewTag
- `MainContent.vue` - 添加拖动分隔条 + 事件处理
- `AgentRightPanel/index.vue` - 动态宽度 + previewImage 方法
- `RightPanel/index.vue` - 移除固定宽度
- `FilePreview.vue` - 图片工具栏 + HTML iframe + **webview 预览** + ESC 键监听
- `MessageBubble.vue` - 图片/链接点击事件
- `AgentChatTab.vue` - 事件传递
- `agent-session-manager.js` - HTML 文件类型检测
- `zh-CN.js` / `en-US.js` - 新增 5 个翻译键

### 重要说明 (Important Notes)

**webview 使用说明**：
- webview 是 Electron 特有的标签，用于嵌入外部网页
- 优点：可以预览任何网站，不受 X-Frame-Options 限制
- 安全性：通过正确的沙箱配置，安全性等同于浏览器
- 注意事项：Electron 官方标记为 "legacy"，长期可能需要迁移到 BrowserView
- 当前决策：功能性优先，未来 2-3 年内如需迁移会提供升级方案

---

## v1.6.36 - 2026-02-14

### 新增 (Features)

**Agent 模式图片识别功能**
- 支持多模态消息，可发送图片给 AI 分析（基于 Claude API Vision）
- 三种输入方式：截屏粘贴（Ctrl+V / Cmd+V）、复制粘贴、文件上传
- 三种消息类型：纯文字、纯图片、图片+文字混合
- 图片预览：输入框显示 80x80 缩略图，可删除
- 消息气泡显示：聊天区域显示 200x200 图片缩略图
- 多图支持：最多 4 张图片/消息
- 大小检测：5MB 限制，超过显示警告
- 格式支持：PNG、JPEG、GIF、WebP
- 队列限制：流式输出时发送图片会提示等待（设计决策）

**新增文件**：
- `src/renderer/utils/image-utils.js` - 图片处理工具（7 个函数）
- `docs/IMAGE-RECOGNITION-FEATURE.md` - 功能实现文档

**修改文件**：
- `src/renderer/pages/main/components/agent/ChatInput.vue` - 输入和预览 UI
- `src/renderer/pages/main/components/agent/MessageBubble.vue` - 消息气泡显示图片
- `src/renderer/composables/useAgentChat.js` - 支持多种消息格式
- `src/main/agent-session-manager.js` - 后端多模态支持
- `src/renderer/locales/zh-CN.js` / `en-US.js` - 新增 5 个翻译键
- `src/renderer/components/icons/index.js` - 新增 image 图标

### 技术细节 (Technical Details)

**消息格式兼容**：
- 纯文本消息：保持字符串格式（向后兼容）
- 带图片消息：对象格式 `{ text, images: [{ base64, mediaType, ... }] }`
- `useAgentChat.js` 自动检测类型并处理

**问题修复**：
- 修复消息格式兼容性问题（字符串 vs 对象）
- 修复 `text.trim()` 类型错误
- 修复纯图片消息验证逻辑
- 实现图片在消息气泡中的显示

**Claude API Vision 集成**：
```javascript
content: [
  { type: 'text', text: '这是什么图片？' },
  {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo...'
    }
  }
]
```

### 文档 (Documentation)

- 新增 `docs/IMAGE-RECOGNITION-FEATURE.md` - 完整实现文档
- 更新 `CLAUDE.md` - 添加图片识别功能说明
- 更新文件结构索引

---

## v1.6.35 - 2026-02-14

### 修复 (Bug Fixes)

**代码回退与数据保护**
- 回退失败的应用重命名修改（HydroCoder Desktop → CC Desktop）
- 回退数据迁移逻辑，避免数据丢失风险
- 移除 `page-title.js` 工具文件和相关导入
- 修复子页面 `main.js` 中被破坏的 import 语法

### 改进 (Improvements)

**i18n 优化保留**
- 保留"智能体模式"中文翻译（`agentMode: '智能体模式'`）
- 保留 Agent 模式欢迎界面改进（使用指南、"恢复"历史对话）
- 保留开发者模式欢迎界面标题优化
- 保留 i18n 键冲突修复（`main.developerWelcome` 独立于 `main.welcome`）

### 文档 (Documentation)

- 更新 CLAUDE.md：配置文件路径更正为 `cc-desktop` 目录
- 更新版本号至 v1.6.35
- 数据目录明确保持在 `%APPDATA%/cc-desktop/` 不变

### 重要说明

- **数据目录**：`cc-desktop`（不再迁移）
- **显示名称**：CC Desktop
- **保留改进**：智能体模式翻译、欢迎界面优化等 i18n 改进

---

## v1.6.34 - 2026-02-13

### 新增 (Features)

**Agent 模式消息队列持久化**
- 消息队列自动保存到数据库，关闭应用后队列不丢失
- 重新打开对话时自动恢复未发送的队列消息
- 防抖机制（300ms）避免高频写入数据库
- 支持队列开关的全局配置（`settings.agent.messageQueue`）
- 新增数据库字段：`agent_conversations.queued_messages`
- 新增 IPC 接口：`agent:saveQueue` / `agent:getQueue`
- Vue Proxy 兼容处理（深拷贝避免序列化错误）

### 改进 (Improvements)

- 队列自动消费：流式输出结束后自动发送下一条排队消息
- 队列开关切换时智能消费：从禁用切换到启用时自动处理积压消息
- 窗口焦点事件防抖优化（500ms）：减少频繁切换窗口时的配置读取

---

## v1.6.31 - 2026-02-11

### 新增 (Features)

**跨模式会话占用控制**
- Agent 模式与 Terminal 模式互斥同一 CLI 会话，防止并发写入导致数据丢失
- Peer Manager 模式：`ActiveSessionManager` 与 `AgentSessionManager` 互相持有引用
- 通过 `isCliSessionActive(cliSessionUuid)` 方法检查对端是否正在使用该会话
- Terminal 模式恢复会话前检查 Agent 模式占用状态
- Agent 模式发送消息前检查 Terminal 模式占用状态
- 前端友好错误提示：`SESSION_IN_USE_BY_AGENT` / `SESSION_IN_USE_BY_TERMINAL`

### 改进 (Improvements)

- 恢复会话提示优化：增加"首条消息响应需要耐心等待"提示文案

---

## v1.6.3 - 2026-02-11

### 修复 (Bug Fixes)

**终端环境变量处理优化**
- 修复 terminal-manager.js 环境变量注入问题
- 使用统一的 `buildProcessEnv` 函数，避免环境变量污染
- 解决 `undefined` 被传递为字符串的 bug

**配置系统清理**
- 自动迁移并删除废弃的 API 配置字段
- 新安装不产生废弃字段，配置文件更简洁
- 迁移后自动清理 `settings.api`、`settings.anthropicApiKey` 等旧字段

### 文档 (Documentation)

- 更新 QUICKSTART.md：API Key 配置说明改为 API Profiles
- 更新 ARCHITECTURE.md：配置示例使用新结构
- 更新 MIGRATION.md：迁移脚本和说明更新

### 破坏性变更 (Breaking Changes)

- **不支持降级到 v1.5.x**：API 配置结构已变更
- 旧版本 `settings.anthropicApiKey` 等字段在迁移后会被自动删除

---

## v1.4.0 - 2026-01-25

### Agents 管理模块完成

**Agents 特性**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制、重命名
- 导入/导出功能
- 点击发送到终端

**插件管理增强**
- 插件子组件编辑功能
- Commands 编辑支持
- 移除插件卸载功能，统一模态框属性名

**技术优化**
- 引入 js-yaml 优化 YAML 解析
- 终端 WebGL 渲染（Canvas/DOM 降级）
- IME 输入法定位修复

---

## v1.3.0 - 2026-01-24

### Skills / Hooks / MCP 三大模块完整管理

**统一架构**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制
- 点击发送命令到终端

**Skills 特性**
- 原始内容编辑（YAML frontmatter + Markdown）
- 导入/导出：冲突检测、ZIP/文件夹格式

**Hooks 特性**
- 表单/JSON 双模式编辑
- 打开配置文件功能

**MCP 特性**
- 四级 scope: User/Local/Project/Plugin
- JSON 编辑器带格式化

---

## v1.2.x - 2026-01-22~23

- Hooks 标签页 - 可视化编辑
- Plugin 管理 - 启用/禁用/卸载
- AI 助手增强 - 多格式 API、手动压缩
- Agents 标签页
- 中英文切换

---

## v1.1.x - 2026-01-15~21

- 会话历史管理 - SQLite + FTS5
- 活动会话管理 - 标题、限流
- 快捷命令
- 外观设置独立页面
- GitHub Actions CI/CD

---

## v1.0.x - 2026-01-12~14

**首次发布**
- 独立架构（不依赖 cc-web-terminal）
- 项目管理 + 终端集成
- Vue 3 + Naive UI + Electron
