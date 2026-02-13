# 更新日志

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
