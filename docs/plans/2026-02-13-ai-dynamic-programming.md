# AI 动态编程能力 — 需求规划

> 状态：**规划中** | 优先级：**高** | 提出日期：2026-02-13

---

## 1. 需求概述

为 cc-desktop 增加 **AI 自主动态编程** 能力：AI（Agent 模式下运行的 Claude）能够在运行时动态 **创建、修改、删除** 应用模块，并使变更 **即时生效**，无需手动重启。

**核心目标**：让 AI 不仅是代码生成器，而是具备"自我进化"能力的智能体 — 能根据用户需求，实时扩展和调整应用的功能模块。

---

## 2. 能力范围定义

### 2.1 可动态操作的模块类型

| 模块类型 | 创建 | 修改 | 删除 | 热加载 | 说明 |
|----------|------|------|------|--------|------|
| **Skills** | ✅ | ✅ | ✅ | ✅ | Markdown 定义，最易动态化 |
| **Agents** | ✅ | ✅ | ✅ | ✅ | Markdown 定义，同 Skills |
| **Hooks** | ✅ | ✅ | ✅ | ✅ | JSON 配置，需校验格式 |
| **MCP Servers** | ✅ | ✅ | ✅ | ⚠️ | 涉及进程管理，需安全重启 |
| **IPC Handlers** | ⚠️ | ⚠️ | ❌ | ⚠️ | 核心模块，需严格沙箱 |
| **Vue 组件** | ⚠️ | ⚠️ | ❌ | ❌ | 渲染进程，需构建流程 |
| **Main 进程模块** | ❌ | ❌ | ❌ | ❌ | 安全红线，禁止动态修改 |

### 2.2 操作粒度

```
Level 1（配置级）：Skills / Agents / Hooks / Prompts — 文件级 CRUD，即时生效
Level 2（扩展级）：MCP Servers / Plugins — 需进程管理，可控重载
Level 3（代码级）：IPC Handlers / Vue 组件 — 需沙箱 + 审批机制
Level 4（禁止区）：Main 进程核心 / 安全模块 — 不可触碰
```

---

## 3. 架构设计思路

### 3.1 总体架构

```
Agent 模式对话
  ↓ AI 决定需要新模块
DynamicProgrammingEngine（主进程新模块）
  ├── ModuleGenerator    — 代码/配置生成
  ├── SafetyValidator    — 安全校验（沙箱、白名单、规则）
  ├── ModuleInstaller    — 文件写入 + 注册
  ├── HotReloader        — 热加载 / 进程重启
  └── RollbackManager    — 版本快照 + 回滚
```

### 3.2 核心流程

```
1. AI 识别需求 → 判断需要创建/修改/删除哪个模块
2. 生成模块内容（代码/配置/Markdown）
3. SafetyValidator 校验
   ├── 白名单检查（是否在允许的模块类型范围内）
   ├── 内容安全扫描（禁止危险操作：rm -rf, eval, exec 等）
   ├── 格式校验（YAML/JSON/Markdown 合法性）
   └── 依赖检查（引用的模块是否存在）
4. 用户确认（可配置：自动/提示/审批）
   ├── auto   — Level 1 模块自动执行
   ├── prompt — Level 2 模块弹窗确认
   └── review — Level 3 模块需用户逐行审批
5. ModuleInstaller 执行安装
   ├── 创建版本快照（用于回滚）
   ├── 写入文件
   └── 更新注册表（installed_plugins.json / settings.json 等）
6. HotReloader 使变更生效
   ├── Skills/Agents — 重新扫描目录
   ├── Hooks — 重载 hooks 配置
   ├── MCP — 重启对应 MCP Server 进程
   └── 通知前端刷新 UI
7. AI 验证模块是否正常工作
```

### 3.3 安全分层模型

```
┌─────────────────────────────────────┐
│  Level 4: 禁止区 (FORBIDDEN)        │  Main 进程核心、安全模块
│  ─ 任何情况下都不允许 AI 修改       │
├─────────────────────────────────────┤
│  Level 3: 审批区 (REVIEW)           │  IPC Handlers、Vue 组件
│  ─ 需要用户逐行审核确认             │
├─────────────────────────────────────┤
│  Level 2: 确认区 (CONFIRM)          │  MCP Servers、Plugins
│  ─ 弹窗提示，用户一键确认/拒绝      │
├─────────────────────────────────────┤
│  Level 1: 自由区 (AUTO)             │  Skills、Agents、Hooks、Prompts
│  ─ 自动执行，事后可回滚             │
└─────────────────────────────────────┘
```

---

## 4. 关键技术点

### 4.1 热加载机制

- **Skills/Agents**：文件系统监听 (fs.watch) + SkillsManager.reload()
- **Hooks**：重新读取 ~/.claude/settings.json 中 hooks 配置
- **MCP**：graceful shutdown 现有进程 → spawn 新进程
- **前端通知**：IPC 事件 `module:changed` → 前端响应式更新

### 4.2 版本管理 & 回滚

```
~/.claude/dynamic-programming/
├── snapshots/                    # 版本快照
│   ├── 2026-02-13T10-30-00/
│   │   ├── manifest.json         # 操作记录
│   │   └── backup/               # 修改前的文件备份
│   └── ...
├── history.json                  # 操作历史日志
└── policy.json                   # 安全策略配置
```

### 4.3 AI 工具定义（Agent 模式新增 Tools）

AI 在 Agent 模式下可调用的新工具：

| Tool | 说明 |
|------|------|
| `module:create` | 创建新模块（指定类型、ID、内容） |
| `module:update` | 修改现有模块 |
| `module:delete` | 删除模块（带回滚快照） |
| `module:list` | 列出已安装模块 |
| `module:inspect` | 查看模块详情 |
| `module:rollback` | 回滚到指定快照 |
| `module:test` | 验证模块是否正常工作 |

---

## 5. 实现路径（分阶段）

### Phase 1 — 配置级动态编程（Level 1）

**范围**：Skills / Agents / Hooks / Prompts

**工作内容**：
- [ ] DynamicProgrammingEngine 基础框架
- [ ] SafetyValidator 白名单 + 内容扫描
- [ ] ModuleInstaller（文件 CRUD + 注册表更新）
- [ ] Skills/Agents 热加载（复用已有 SkillsManager）
- [ ] Hooks 热加载
- [ ] 版本快照 + 回滚基础
- [ ] Agent 模式新增 module:* Tools
- [ ] 前端 UI：模块变更通知 + 回滚操作

### Phase 2 — 扩展级动态编程（Level 2）

**范围**：MCP Servers / Plugins

**工作内容**：
- [ ] MCP Server 动态注册与进程管理
- [ ] Plugin 动态安装（复用已有 plugin-cli.js）
- [ ] 用户确认弹窗流程
- [ ] 依赖关系检查
- [ ] 更完善的回滚机制

### Phase 3 — 代码级动态编程（Level 3，远期）

**范围**：IPC Handlers / Vue 组件（实验性）

**工作内容**：
- [ ] 沙箱执行环境（vm2 或 isolated-vm）
- [ ] 代码审批工作流
- [ ] 增量构建与热更新
- [ ] 完整测试覆盖

---

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| AI 生成恶意代码 | 应用被破坏 | SafetyValidator 内容扫描 + 白名单 |
| 模块冲突 | 功能异常 | ID 唯一性检查 + 依赖分析 |
| 热加载失败 | 应用不稳定 | 自动回滚 + 错误隔离 |
| 用户误操作 | 数据丢失 | 版本快照 + 确认流程 |
| 无限递归 | 资源耗尽 | 操作频率限制 + 深度限制 |

---

## 7. 与现有架构的关系

- **复用 CapabilityManager**：能力注册/卸载流程
- **复用 SkillsManager / HooksManager**：文件操作和格式校验
- **复用 plugin-cli.js**：插件安装卸载
- **扩展 AgentSessionManager**：新增 module:* 工具调用处理
- **扩展 preload.js**：暴露动态编程相关 IPC API
- **新增 IPC Handlers**：`dynamic-programming-handlers.js`

---

## 8. 成功标准

- [ ] AI 能通过对话自主创建一个新 Skill 并立即可用
- [ ] AI 能修改已有 Hook 配置并立即生效
- [ ] 所有动态操作可一键回滚
- [ ] Level 4 模块在任何情况下不可被 AI 修改
- [ ] 操作历史完整可审计
