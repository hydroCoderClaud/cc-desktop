# Hydro Agent Platform 技术设计

> 状态：提案  
> 目标版本：分阶段灰度  
> 适用范围：Hydro Desktop 主进程、Agent 会话内核、内嵌页面桥接、本地 Node.js 接入

## 决策记录

- 当前轮次仅完成方向设计与实施拆解，不进入代码实现阶段
- 后续是否启动实现，取决于产品规划与试点场景选择
- 相关需求与设计方案以本文档及配套文档为准，作为后续计划输入

## 1. 文档目标

本文档定义 Hydro Desktop 从“桌面聊天与编程工具”升级为“本地可扩展 Agent 平台”的技术方案。

本次升级的两个核心目标：

1. 开放复用现有 Agent Session 能力
2. 通过官方 skill 注入复用指导，避免用户重复集成底层 Claude SDK

本设计以“不破坏现有功能”为第一原则。现有宿主聊天窗口、定时任务、钉钉桥接、微信通知、能力管理、已有 IPC 接口必须保持兼容。

## 2. 产品定位

升级后，Hydro Desktop 同时承担三种角色：

- 本地 Agent 应用宿主：继续提供现有聊天与编程能力
- 本地 Agent 开发宿主：用户可在 Hydro Desktop 中开发普通应用或带 AI 能力的应用
- 本地 Agent 平台：用户开发的内嵌页面和本地 Node.js 应用可直接复用 Hydro 的 Agent Session 能力

这不改变现有“通用编程模式”的定位。用户仍然可以使用 Hydro Desktop 开发与本产品无关的任意应用。

## 3. 当前代码现状

### 3.1 当前核心结构

当前 Agent 模式核心结构如下：

- 会话内核：`src/main/agent-session-manager.js`
- 会话模型：`src/main/agent-session.js`
- Claude SDK 适配：`src/main/runners/claude-code-runner.js`
- IPC 适配：`src/main/ipc-handlers/agent-handlers.js`
- Renderer 暴露：`src/preload/preload.js`
- 桌面能力注入：`src/main/managers/desktop-capability-query-options.js`
- 会话持久化：`src/main/session-database.js` + `src/main/database/agent-db.js`

### 3.2 已有优势

当前代码已经具备平台化改造的良好基础：

- `AgentSessionManager` 已经是集中式会话服务，而不是散落在 UI 层
- `ClaudeCodeRunner` 已经隔离底层 Claude SDK
- `agent-handlers` 已经是一层 API façade，只是当前 transport 为 Electron IPC
- `preload.js` 已经暴露清晰的宿主调用面
- `buildDesktopCapabilityQueryOptions()` 已经证明可在发送消息前注入 MCP、工具白名单、附加系统提示

### 3.3 当前约束与风险

当前实现仍然是“单宿主视角”，尚未具备多客户端复用隔离：

- `AgentSessionManager` 内部统一持有 `sessions: Map<sessionId, AgentSession>`
- 事件通过 `_safeSend()` 直接发往主窗口
- `agent:*` IPC 默认假设调用方就是宿主聊天窗口
- 持久化表 `agent_conversations` 尚未记录客户端归属

因此，不能把现有 IPC 或内部 manager 直接原样开放给内嵌页面或独立 Node.js 应用，否则存在串会话、串事件、误操作宿主会话的风险。

## 4. 升级原则

### 4.1 首要原则

- 不破坏现有宿主聊天窗口
- 不改变现有 `agent:*` IPC 协议语义
- 不重写 `AgentSessionManager` 主逻辑
- 不将“开放平台”逻辑混入现有桌面能力注入逻辑
- 一切新增能力必须可通过 feature flag 灰度和回滚

### 4.2 设计原则

- 平台内核与接入方式解耦
- 先做主进程内 broker，后续再考虑独立进程
- 先做 localhost 本地复用，不做公网服务
- 能力接口强复用，视觉风格弱绑定
- skill 作为主要开发引导手段，prompt 仅做短提示兜底

## 5. 目标架构

### 5.1 架构总览

```text
+--------------------------------------------------------------+
|                     Hydro Desktop Host                       |
|                                                              |
|  +-------------------+      +-----------------------------+  |
|  | Host Chat UI      |      | Embedded Page / Webview UI  |  |
|  +---------+---------+      +-------------+---------------+  |
|            |                              |                  |
|            v                              v                  |
|       IPC Adapter                 Embedded Agent Bridge      |
|                     \              /                         |
|                      \            /                          |
|                       v          v                           |
|               +------------------------+                     |
|               | Agent Access Layer     |                     |
|               | - host adapter         |                     |
|               | - embedded adapter     |                     |
|               | - local API adapter    |                     |
|               +-----------+------------+                     |
|                           |                                  |
|                           v                                  |
|               +------------------------+                     |
|               | Agent Session Broker   |                     |
|               | - client auth          |                     |
|               | - ownership            |                     |
|               | - event routing        |                     |
|               | - session scoping      |                     |
|               +-----------+------------+                     |
|                           |                                  |
|                           v                                  |
|               +------------------------+                     |
|               | AgentSessionManager    |                     |
|               +-----------+------------+                     |
|                           |                                  |
|                           v                                  |
|       ClaudeCodeRunner + DB + Env + Files + MCP + Capability |
+--------------------------------------------------------------+
                            ^
                            |
                            | localhost only
                            |
+-------------------------------+
| Local Node.js App             |
| @hydro/agent-client           |
+-------------------------------+
```

### 5.2 架构职责

#### Agent Access Layer

负责把不同接入方式统一映射为平台内部调用。

- 宿主聊天窗口仍通过 Electron IPC 调用
- 内嵌页面通过精简 bridge 调用
- 本地 Node.js 应用通过 `HTTP + WebSocket` 调用

#### Agent Session Broker

负责多客户端隔离，是本次升级的新增核心。

职责：

- 分配和校验 `clientId`
- 确定 `session.ownerClientId`
- 控制 session 的可见性和操作权限
- 按 client 路由事件
- 校验 `cwd` 与作用域约束

#### AgentSessionManager

继续做底层会话执行引擎，不直接承担多客户端认证与隔离逻辑。

## 6. 客户端模型

### 6.1 客户端类型

统一抽象三类 client：

- `host-ui`
  - 宿主聊天窗口
- `embedded`
  - 由 Hydro Desktop 承载的内嵌页面
- `local-node`
  - 独立本地 Node.js 应用

### 6.2 客户端身份

新增 client 标识：

- `clientId`
- `clientType`
- `clientName`
- `clientMeta`

示例：

- `host-ui`
- `embed:page:inspector`
- `node:my-local-app`

### 6.3 Session 所有权

每个 session 必须绑定 owner：

- `ownerClientId`
- `clientType`
- `clientMeta`

默认规则：

- `host-ui` 只能操作自己创建的 session
- `embedded` 只能操作自己创建的 session
- `local-node` 只能操作自己创建的 session

后续如需支持宿主观察 guest session，应显式设计 `attach` 语义，且默认只读。

## 7. 非破坏性兼容策略

### 7.1 必须保持不变的现有行为

- 现有 `agent:create`
- 现有 `agent:sendMessage`
- 现有 `agent:cancel`
- 现有 `agent:close`
- 现有 `agent:reopen`
- 现有 `agent:getMessages`
- 现有 `agent:interactionRequest` 事件流
- 现有 `agent:init / message / result / error / statusChange` 事件名和语义

### 7.2 宿主兼容策略

宿主聊天窗口继续通过现有 IPC 访问。

内部调整仅为：

- IPC handler 不再直接调用 session manager
- IPC handler 通过 `Broker` 以 `clientId = host-ui` 访问

这意味着 renderer 层和现有业务组件无需因平台升级而重写。

## 8. 模块级改造方案

### 8.1 保持核心执行内核，最小改动

#### `src/main/agent-session-manager.js`

定位：保留为会话执行内核。

允许改动：

- 增加事件发布器注入点
- 增加 session owner 字段透传
- 增加按 client 路由事件所需的上下文

禁止改动：

- 重写 `sendMessage()` 核心执行链
- 改变现有 `buildDesktopCapabilityQueryOptions()` 调用时机
- 改变现有消息入库结构

建议改造：

- 保留 `_safeSend()` 作为兼容出口
- 新增 `setEventPublisher(publisher)` 或构造参数注入
- manager 内部发布统一标准事件对象，再由兼容层决定发往窗口还是 broker

#### `src/main/agent-session.js`

新增字段：

- `ownerClientId`
- `clientType`
- `clientMeta`

这些字段不改变现有宿主逻辑，仅用于隔离和审计。

### 8.2 新增平台层

#### `src/main/agent-platform/agent-session-broker.js`

职责：

- 注册 client
- 校验 client 权限
- 创建 session 时注入 owner 元数据
- 代理 `create/sendMessage/cancel/close/reopen/respondInteraction`
- 对 list/get 等查询做所有权过滤

#### `src/main/agent-platform/agent-event-router.js`

职责：

- 接收底层标准事件
- 根据 session owner 路由到订阅者
- 对宿主继续发现有 `agent:*` IPC
- 对 local API 通过 WebSocket 发事件
- 对 embedded bridge 通过定向事件发消息

#### `src/main/agent-platform/local-agent-api-server.js`

职责：

- 启动本地 `127.0.0.1` only 服务
- 提供 HTTP 控制面和 WebSocket 事件面
- 校验本地 token
- 转发到 broker

#### `src/main/agent-platform/embedded-agent-bridge.js`

职责：

- 为内嵌页面提供精简调用面
- 限制能力范围，不直接暴露全量 `electronAPI`

### 8.3 现有 adapter 层调整

#### `src/main/ipc-handlers/agent-handlers.js`

策略：协议不变，内部走 broker。

改动要点：

- 每个现有 `agent:*` handler 使用固定 `clientId = host-ui`
- 返回结构保持原样

#### `src/preload/preload.js`

策略：宿主兼容不动，新增精简 bridge。

保留：

- `window.electronAPI.createAgentSession`
- `window.electronAPI.sendAgentMessage`
- 全量现有宿主接口

新增：

- `window.hydroAgent.createSession()`
- `window.hydroAgent.sendMessage()`
- `window.hydroAgent.onEvent()`
- `window.hydroAgent.respondInteraction()`
- `window.hydroHostTheme.getSnapshot()`
- `window.hydroHostTheme.onThemeChanged()`

## 9. 本地 API 设计

### 9.1 形态

第一版采用：

- HTTP：控制面
- WebSocket：事件流

不建议第一版使用公网 web 服务，也不建议第一版使用单纯 SSE 替代 WebSocket。

### 9.2 监听范围

- 只绑定 `127.0.0.1`
- 默认随机端口或受配置控制
- 不对局域网开放

### 9.3 建议接口

#### HTTP

- `POST /v1/agent/sessions`
- `GET /v1/agent/sessions/:id`
- `GET /v1/agent/sessions`
- `POST /v1/agent/sessions/:id/messages`
- `POST /v1/agent/sessions/:id/cancel`
- `POST /v1/agent/sessions/:id/close`
- `POST /v1/agent/sessions/:id/interactions/:interactionId/respond`

#### WebSocket

- `WS /v1/agent/events`

事件类型沿用现有语义：

- `agent:init`
- `agent:message`
- `agent:result`
- `agent:error`
- `agent:cliError`
- `agent:statusChange`
- `agent:interactionRequest`
- `agent:interactionResolved`

### 9.4 第一版功能边界

第一版只开放 Agent Session 本身。

暂不直接开放：

- 任意全盘文件写入 API
- 全局设置管理
- 宿主窗口控制
- 全量 `electronAPI`

## 10. 数据模型与迁移

### 10.1 数据库迁移目标

仅增量扩展 `agent_conversations`，不重建旧表。

新增列建议：

- `owner_client_id TEXT DEFAULT 'host-ui'`
- `client_type TEXT DEFAULT 'host'`
- `client_meta TEXT`

### 10.2 兼容策略

- 所有历史会话默认归属 `host-ui`
- 老代码读取旧字段不受影响
- 新代码若未发现 owner 字段，按 `host-ui` 回退

### 10.3 作用域策略

第一版不引入复杂 ACL。

第一版规则：

- session 的默认工作与文件作用域由 `cwd` 决定
- `cwd` 必须明确或自动分配
- 外部 client 默认只能在自身 session 作用域内工作

## 11. Prompt、能力与 Skill 注入策略

### 11.1 当前注入入口

当前消息发送链中，能力注入发生在：

- `AgentSessionManager.sendMessage()`
- `buildDesktopCapabilityQueryOptions()`
- `ClaudeCodeRunner.createQuery()`

可注入项包括：

- `mcpServers`
- `appendSystemPrompt`
- `allowedTools`
- `disallowedTools`

### 11.2 平台升级后的职责划分

#### `appendSystemPrompt`

只用于原则性提示，不承载完整文档。

建议增加一小段平台提示：

- 当用户正在开发需要本地 Agent 或聊天能力的应用时，优先使用 Hydro 平台接口
- 不要重复集成底层 Claude SDK，除非用户明确要求脱离 Hydro

#### 官方 Skill

完整说明、模板和示例放进官方 skill `hydro-agent-app-dev`。

这样做的好处：

- 不污染普通对话
- 可版本化维护
- 可直接给示例代码
- 可根据接入方式输出不同模板

### 11.3 不应破坏的现有能力注入

本次升级不能把平台引导逻辑混进 `desktop-capability-query-options` 的既有桌面超级能力逻辑中。定时任务、微信通知、钉钉等能力仍应保持当前独立边界。

平台复用指导应通过以下方式注入：

- 短 append prompt
- 官方 skill
- 可选的 capability 入口

## 12. 内嵌页面主题策略

### 12.1 结论

内嵌页面开发时：

- Agent 能力应强复用
- 主题样式不应强绑定宿主
- 提供可选主题桥接
- 默认允许用户自由设计

### 12.2 原因

如果强制内嵌页面继承宿主 UI，会带来问题：

- 限制用户做品牌化产品
- 强耦合 Hydro 当前设计系统
- 后续宿主题升级会影响用户页面

但完全没有主题桥接也不理想，因为很多页面希望快速与宿主保持一致。

### 12.3 推荐方案

采用“能力复用强约束，视觉复用弱约束”的模式。

提供两种选择：

#### 模式 A：自由样式，默认推荐

- 页面只复用 Agent API
- 样式完全自定义
- 适合产品化页面、品牌化页面、独立业务页面

#### 模式 B：可选宿主主题桥接

提供只读主题上下文：

- `theme`: `light | dark`
- `colorScheme`
- `locale`
- 可选设计 token 快照

建议 API：

- `window.hydroHostTheme.getSnapshot()`
- `window.hydroHostTheme.onThemeChanged(cb)`

适用场景：

- 设置页扩展
- 宿主工具面板
- 希望与 Hydro Desktop UI 一致的页面

### 12.4 不建议做的事

- 不强制嵌入页加载整个宿主 design system
- 不默认注入大段宿主 CSS
- 不让嵌入页直接依赖内部 Naive UI theme overrides 实现细节

## 13. Feature Flag 策略

新增开关建议：

- `settings.experimental.agentPlatformEnabled`
- `settings.experimental.localAgentApiEnabled`
- `settings.experimental.embeddedAgentBridgeEnabled`
- `settings.experimental.hostThemeBridgeEnabled`

灰度顺序：

1. 启用 broker，但仅服务宿主
2. 启用 local API
3. 启用 embedded bridge
4. 启用主题桥接

## 14. 分阶段实施计划

### 阶段 1：平台内核兼容重构

目标：

- 引入 broker 与 event router
- 宿主聊天窗口零行为变化

改动：

- `AgentSessionManager` 增加事件发布器
- `agent-handlers` 改走 broker
- 数据库迁移 owner 字段

验收：

- 现有宿主功能与回归测试全绿

### 阶段 2：本地 API Server

目标：

- 独立 Node.js 应用可复用 Agent Session

改动：

- 新增本地 HTTP + WebSocket 服务
- 新增 token 校验
- 新增 `@hydro/agent-client` 客户端协议文档

验收：

- 外部应用仅可操作自己的 session

### 阶段 3：内嵌页面桥接

目标：

- 内嵌页面在宿主内部复用 Agent API

改动：

- preload 中新增精简桥接命名空间
- 控制可见能力范围

验收：

- 内嵌页不具备全量宿主管理权限

### 阶段 4：官方 Skill 与开发指引

目标：

- Agent 开发时优先复用 Hydro 平台能力

改动：

- 新增官方 skill `hydro-agent-app-dev`
- 新增最小 append prompt

验收：

- 相关开发任务可优先生成 Hydro 复用方案
- 普通应用开发不被强制导向 Hydro

## 15. 测试计划

### 15.1 不可回归测试

必须覆盖：

- 宿主创建 Agent 会话
- 发送消息和流式输出
- 交互请求与用户回答
- 会话取消、关闭、重开
- 现有定时任务能力注入
- 微信通知能力注入
- 钉钉桥接消息处理

### 15.2 新增测试

新增建议测试文件：

- `tests/main/agent-session-broker.test.js`
- `tests/main/agent-event-router.test.js`
- `tests/main/local-agent-api-server.test.js`
- `tests/main/embedded-agent-bridge.test.js`
- `tests/main/agent-db-owner-migration.test.js`

### 15.3 手工回归矩阵

- 宿主普通聊天
- 宿主编程会话
- 宿主开发无关应用
- 宿主开发内嵌 Agent 页面
- 外部 Node.js client 接入
- guest client 与 host-ui 并存
- 主题切换下的内嵌页面桥接

## 16. 回滚策略

原则：关闭 feature flag 后，应立即退回“宿主专用 Agent 应用”模式。

可回滚项：

- local API server 不启动
- embedded bridge 不暴露
- broker 仍可存在，但只服务 `host-ui`

不可回滚项：

- 数据库新增字段会保留，但不影响旧逻辑

## 17. 交付清单

本设计落地后，最小交付应包括：

- Broker 与 Event Router
- 非破坏式 IPC 兼容适配
- 本地 Agent API Server
- 内嵌页面精简 Agent Bridge
- 官方 skill `hydro-agent-app-dev`
- 平台开发文档
- 测试与灰度开关

## 18. 成功标准

本次升级成功的标志不是“多了一个接口”，而是以下目标同时成立：

- 宿主现有聊天和编程功能不受影响
- 用户能在 Hydro Desktop 中开发普通应用
- 用户能在需要时复用 Hydro Agent Platform 能力
- 内嵌页面和本地 Node.js 应用不会误伤宿主会话
- Agent 能主动给出正确的 Hydro 复用开发方案，而不是重复造底层 SDK 集成
