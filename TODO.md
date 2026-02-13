# TODO - 项目状态

> 📅 最后更新：2026-02-13
> 📦 当前版本：v1.6.34
> ✅ 状态：Agent 模式消息队列持久化

---

## 🔮 重大规划

### AI 动态编程能力（规划中）

**目标**：AI 在 Agent 模式下可自主创建、修改、删除应用模块，变更即时生效。

**规划文档**：[`docs/plans/2026-02-13-ai-dynamic-programming.md`](docs/plans/2026-02-13-ai-dynamic-programming.md)

**分阶段路径**：
- [ ] **Phase 1** — 配置级（Skills/Agents/Hooks/Prompts 动态 CRUD + 热加载 + 回滚）
- [ ] **Phase 2** — 扩展级（MCP Servers/Plugins 动态管理 + 确认流程）
- [ ] **Phase 3** — 代码级（IPC Handlers/Vue 组件，沙箱 + 审批，远期实验性）

**关键设计**：四级安全分层（自由区 → 确认区 → 审批区 → 禁止区）

---

## ✅ 已完成的核心功能

### v1.6.34 - Agent 模式消息队列持久化
- [x] 消息队列自动保存到数据库（防抖 300ms，避免高频写入）
- [x] 重新打开对话时自动恢复队列
- [x] 队列开关全局配置（`settings.agent.messageQueue`）
- [x] 队列自动消费机制（流式结束后、开关切换时）
- [x] Vue Proxy 兼容处理（深拷贝避免 IPC 传输错误）
- [x] 数据库字段：`agent_conversations.queued_messages TEXT DEFAULT '[]'`
- [x] IPC 接口：`agent:saveQueue` / `agent:getQueue`

### v1.6.31 - 跨模式会话占用控制
- [x] 跨模式会话占用检查（Agent 模式与 Terminal 模式互斥同一 CLI 会话）
- [x] Peer Manager 模式（两个 Manager 互相持有引用，通过 isCliSessionActive() 检查）
- [x] 前后端错误提示（SESSION_IN_USE_BY_AGENT / SESSION_IN_USE_BY_TERMINAL）
- [x] 恢复会话提示优化（首条消息响应需要耐心等待）

### v1.6.3 - 终端环境变量处理优化 & 配置系统清理

### v1.6.2 - 市场代码审查修复 + 文件树增强
- [x] 文件树扩展过滤（Python venv/.venv/.conda、Node.js .npm/.yarn、构建产物 build/target 等）
- [x] 修复删除 Agent 时未清理 market-meta 元数据
- [x] 修复删除 Prompt 时市场元数据残留
- [x] 修复版本对比逻辑（改用 semver 比较，降版本不再误显示为可更新）
- [x] HTTP 客户端安全加固（重定向次数限制、响应大小限制、路径穿越校验）
- [x] 市场安装 ID 格式校验（防御路径穿越）
- [x] 代理配置缓存优化（避免每次请求都读磁盘）
- [x] prompt-handlers 代码重构（提取公共下载逻辑）
- [x] 修复覆盖安装对话框 title/content 重复
- [x] Agent 重命名时同步 market-meta

### v1.6.1 - 统一组件市场
- [x] 统一组件市场（Skills + Prompts + Agents 三合一）
- [x] 共享 HTTP 客户端模块（http-client.js）
- [x] Agents 市场功能（安装、更新、sidecar 元数据）
- [x] Prompts 市场功能（SQLite 存储、market_installed_prompts 表）
- [x] 统一市场 Modal（ComponentMarketModal + MarketList）
- [x] 配置迁移 skillsMarket → market
- [x] 市场徽章（Agents/Prompts 列表中标识市场来源）

### v1.6.0 - Agent 模式重大更新
- [x] 双模式架构（Terminal 模式 + Agent 模式）
- [x] Agent 会话管理（创建、删除、重命名）
- [x] 工作目录文件浏览与预览
- [x] 文件树过滤系统文件
- [x] API Profile 关联与切换提醒
- [x] 双击文件外部打开
- [x] 聊天区链接/路径点击打开

### v1.5.x - 提示词管理
- [x] 提示词 CRUD（创建、编辑、删除）
- [x] 提示词标签系统（分类筛选）
- [x] 提示词收藏与使用计数
- [x] 全局/项目级 scope 支持
- [x] 填入输入框快捷操作

### v1.4.0 - Agents 管理模块
- [x] 三级分类（项目级、全局级、插件级）
- [x] 完整 CRUD（新建、编辑、删除、复制、重命名）
- [x] 导入/导出功能
- [x] 点击发送到终端

### v1.3.0 - Skills/Hooks/MCP 管理
- [x] Skills 管理（原始内容编辑、导入/导出）
- [x] Hooks 管理（表单/JSON 双模式）
- [x] MCP 管理（四级 scope、JSON 编辑器）
- [x] 统一三级分类架构

### v1.2.x - Developer 模式右侧面板
- [x] 8 个标签页（Skills/Agents/Hooks/MCP/Commands/Settings/Plugins/AI）
- [x] 插件管理（启用/禁用、子组件编辑）
- [x] AI 助手增强（多格式 API、手动压缩）
- [x] 中英文切换

### v1.1.x - 会话管理
- [x] SQLite 数据库存储（better-sqlite3）
- [x] FTS5 全文搜索
- [x] 两级标签系统（会话标签 + 消息标签）
- [x] 收藏功能（带筛选）
- [x] 导出功能（Markdown/JSON）
- [x] 活动会话管理（标题、限流）
- [x] 快捷命令

### v1.0.x - 基础架构
- [x] 独立 Electron 应用（Vue 3 + Naive UI）
- [x] 项目管理 + 终端集成
- [x] PTY 进程管理
- [x] 6 套主题（Claude/Ember/Ocean/Forest/Violet/Graphite）
- [x] 90+ 统一图标系统

---

## 📝 开发说明

```bash
# 安装依赖
npm install

# 开发模式（自动打开 DevTools）
npm run dev

# 构建
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# 测试
npm test             # 运行测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告
```

---

## 📚 文档位置速查

| 文档 | 用途 | 路径 |
|------|------|------|
| 📋 **TODO.md** | 项目状态 | `./TODO.md` (本文件) |
| 📖 **CLAUDE.md** | 开发指南和架构说明 | `./CLAUDE.md` |
| 📝 **CHANGELOG.md** | 版本更新日志 | `./docs/CHANGELOG.md` |
| 📐 **ARCHITECTURE.md** | 架构设计 | `./docs/ARCHITECTURE.md` |
| 🚀 **QUICKSTART.md** | 快速开始 | `./docs/QUICKSTART.md` |

---

## 🎯 快速上手

1. **查看 CLAUDE.md** - 了解项目架构和开发规范
2. **启动开发环境**: `npm run dev`
3. **查看 CHANGELOG.md** - 了解版本历史

---

💡 **提示**: 有新的开发计划时，请更新此文件
