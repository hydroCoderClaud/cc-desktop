# Hydro Agent Platform 实施任务拆解

> 状态：执行规划  
> 关联文档：  
> - `docs/design/agent-platform-technical-design.md`  
> - `docs/design/hydro-agent-app-dev-skill-design.md`

## 1. 文档目标

本文档将技术设计转化为可执行任务清单，按阶段定义：

- 改动目标
- 代码涉及文件
- 关键实现点
- 测试点
- 发布门槛
- 回滚点

本拆解以“不影响原有功能”为最高约束。

## 2. 总体策略

### 2.1 实施顺序

必须按以下顺序推进：

1. 先做兼容式平台内核抽象
2. 再做本地开放复用
3. 再做内嵌页面桥接
4. 最后做官方 skill 与引导策略

### 2.2 不可跨越的门槛

在任何阶段开始编码前，都必须满足：

- 不删除现有 `agent:*` IPC
- 不改宿主 renderer 对现有接口的调用方式
- 不改现有 `sendMessage` 的异步流式语义
- 不把平台引导逻辑直接混进现有定时任务/微信通知能力逻辑

### 2.3 Feature Flag 规则

所有新增平台能力都必须在 feature flag 后。

建议新增：

- `settings.experimental.agentPlatformEnabled`
- `settings.experimental.localAgentApiEnabled`
- `settings.experimental.embeddedAgentBridgeEnabled`
- `settings.experimental.hostThemeBridgeEnabled`

## 3. 当前代码边界与关键文件

### 3.1 平台内核边界

- `src/main/agent-session-manager.js`
- `src/main/agent-session.js`
- `src/main/runners/claude-code-runner.js`

### 3.2 宿主接入边界

- `src/main/ipc-handlers/agent-handlers.js`
- `src/preload/preload.js`
- `src/main/ipc-handlers.js`

### 3.3 数据边界

- `src/main/session-database.js`
- `src/main/database/agent-db.js`

### 3.4 Prompt / Skill / 能力注入边界

- `src/main/managers/desktop-capability-query-options.js`
- `src/main/managers/capability-manager.js`
- `src/main/ipc-handlers/skills-handlers.js`
- `src/main/component-scanner.js`

### 3.5 必测现有测试

- `tests/main/agent-interactions.test.js`
- `tests/main/desktop-capability-query-options.test.js`
- `tests/main/agent-handlers-set-model.test.js`
- `tests/main/agent-path-normalize.test.js`
- 以及所有关联 Agent / DingTalk / Weixin / scheduled task 测试

## 4. 阶段 0：前置准备

### 4.1 目标

在真正编码前，建立安全网和变更边界。

### 4.2 任务

#### Task 0.1：补齐现状文档索引

目标：

- 记录当前 `agent:*` IPC 通道
- 记录现有 `AgentSessionManager` 公开方法与事件

涉及文件：

- `docs/code-index/ipc-channels.md`
- `docs/code-index/main.md`

产出：

- 平台改造前的行为基线

#### Task 0.2：补齐回归测试基线

目标：

- 在改造前跑通现有 Agent 相关测试，确认基线绿灯

建议执行：

- Agent 相关单测
- scheduled task 相关单测
- weixin / dingtalk 相关单测

产出：

- 基线测试报告

### 4.3 阶段门槛

只有在“基线测试稳定、当前行为有文档记录”后，才允许进入阶段 1。

## 5. 阶段 1：平台内核兼容抽象

### 5.1 目标

在不改变宿主功能的前提下，把现有 Agent 会话内核从“单窗口事件发送模型”调整为“可插拔事件发布模型”。

### 5.2 核心原则

- 只抽象，不开放
- 只改主进程，不动宿主 renderer 行为
- 所有现有 IPC 语义保持不变

### 5.3 任务清单

#### Task 1.1：为 AgentSession 增加 owner 元数据

目标：

- 给 session 增加多客户端归属信息

涉及文件：

- `src/main/agent-session.js`

实现要点：

- 新增 `ownerClientId`
- 新增 `clientType`
- 新增 `clientMeta`
- 默认值兼容宿主：`host-ui` / `host`

注意：

- `toJSON()` 需要决定是否暴露这些字段
- 宿主现有列表 UI 不依赖这些字段，不应因此变化

测试：

- 新增 `tests/main/agent-session-model.test.js`

#### Task 1.2：会话创建链路透传 owner 元数据

目标：

- 在 manager.create() 时记录 owner 信息

涉及文件：

- `src/main/agent-session-manager.js`

实现要点：

- `create(options)` 支持 owner 相关参数
- 不传时回退为宿主默认值

注意：

- 不能改变现有 `create()` 的返回结构兼容性

测试：

- 扩展 `tests/main/agent-interactions.test.js`

#### Task 1.3：抽象事件发布器

目标：

- 将 `_safeSend()` 从“仅发主窗口”升级为“兼容事件发布器”

涉及文件：

- `src/main/agent-session-manager.js`

实现要点：

- 增加 `setEventPublisher(publisher)`
- `_safeSend()` 继续保留，但内部优先走 publisher
- publisher 不存在时，按旧逻辑发主窗口

注意：

- 绝不能删 `_safeSend()`
- 现有事件名和载荷不变

测试：

- 新增 `tests/main/agent-event-publisher-compat.test.js`

#### Task 1.4：建立 Broker 雏形

目标：

- 在不开放外部接口前，先把宿主访问改为经过 broker

新增文件：

- `src/main/agent-platform/agent-session-broker.js`

实现要点：

- 固定注册 `host-ui`
- broker 包装：
  - `createSession()`
  - `sendMessage()`
  - `cancelSession()`
  - `closeSession()`
  - `reopenSession()`
  - `resolveInteraction()`
  - `listOwnSessions()`
- 第一阶段只服务宿主

测试：

- 新增 `tests/main/agent-session-broker.test.js`

#### Task 1.5：现有 IPC handler 改走 broker

目标：

- `agent:*` handler 协议不变，但调用路径改为 broker

涉及文件：

- `src/main/ipc-handlers/agent-handlers.js`
- `src/main/index.js`

实现要点：

- 注入 broker 实例
- handler 使用 `clientId = host-ui`

注意：

- 返回值格式必须保持兼容
- 错误处理必须保持原有风格

测试：

- 现有 `agent-handlers` 相关测试全通过

### 5.4 阶段 1 测试清单

- 宿主新建会话
- 宿主发送消息并接收流式输出
- 宿主交互请求与回答
- 宿主会话关闭 / 重开
- 定时任务能力注入不受影响
- 微信通知能力注入不受影响

### 5.5 阶段 1 发布门槛

- 现有 Agent 相关单测全绿
- 宿主聊天手工回归通过
- 不启用任何 local API 和 embedded bridge

### 5.6 阶段 1 回滚点

- 关闭 `agentPlatformEnabled`
- handler 恢复直接调用 manager

## 6. 阶段 2：数据库归属字段与兼容迁移

### 6.1 目标

在不影响历史数据的前提下，为平台化复用补齐持久化归属信息。

### 6.2 任务清单

#### Task 2.1：为 `agent_conversations` 增加 owner 字段

涉及文件：

- `src/main/session-database.js`

实现要点：

- 迁移新增：
  - `owner_client_id TEXT DEFAULT 'host-ui'`
  - `client_type TEXT DEFAULT 'host'`
  - `client_meta TEXT`

注意：

- 只能增量迁移
- 不允许重建 `agent_conversations`

测试：

- 新增 `tests/main/agent-db-owner-migration.test.js`

#### Task 2.2：更新 Agent DB 读写

涉及文件：

- `src/main/database/agent-db.js`

实现要点：

- `createAgentConversation()` 写入 owner 字段
- `getAgentConversation()` 保持兼容
- `listAgentConversations()` 保持旧默认行为

注意：

- 不要在本阶段把 list 行为改成强过滤，过滤应由 broker 做

测试：

- 新增 owner 字段持久化与读取测试

### 6.3 阶段门槛

- 历史数据可正常读取
- 宿主旧会话默认归属 `host-ui`

## 7. 阶段 3：事件路由层

### 7.1 目标

把 session 事件从“主窗口广播”升级为“按 owner 定向路由”，但保持宿主行为不变。

### 7.2 任务清单

#### Task 3.1：实现 Event Router

新增文件：

- `src/main/agent-platform/agent-event-router.js`

实现要点：

- 订阅 `sessionId -> subscriber`
- 支持 `clientId -> eventSink`
- 宿主 sink 继续用 IPC 发 `agent:*`

测试：

- 新增 `tests/main/agent-event-router.test.js`

#### Task 3.2：Broker 接入 Event Router

涉及文件：

- `src/main/agent-platform/agent-session-broker.js`
- `src/main/agent-session-manager.js`

实现要点：

- 创建 session 后记录 owner -> session
- 收到 manager 事件后，按 session owner 路由

注意：

- 宿主场景下行为必须与今天一致

### 7.3 阶段门槛

- 单宿主场景无行为变化
- 多 client 模拟测试下不串事件

## 8. 阶段 4：本地 Agent API Server

### 8.1 目标

开放本地复用能力给独立 Node.js 应用。

### 8.2 任务清单

#### Task 4.1：定义本地 API 契约

产出：

- HTTP 路由
- WebSocket 事件定义
- token 机制

建议文档位置：

- `docs/design/local-agent-api-spec.md`

#### Task 4.2：实现 Local API Server

新增文件：

- `src/main/agent-platform/local-agent-api-server.js`
- `src/main/agent-platform/client-auth.js`

实现要点：

- 只监听 `127.0.0.1`
- 支持 token 校验
- 调用 broker
- 事件通过 WebSocket 推送

注意：

- 第一期不要暴露全量文件能力
- 第一期不要监听公网地址

测试：

- 新增 `tests/main/local-agent-api-server.test.js`

#### Task 4.3：主进程启动与关闭管理

涉及文件：

- `src/main/index.js`

实现要点：

- 受 feature flag 控制启动
- 应用退出时优雅关闭

测试：

- 启停测试

### 8.3 阶段门槛

- 外部 Node client 可正常创建与使用 session
- 外部 client 只能看见自己的 session
- 宿主与外部 client 并存不串扰

### 8.4 阶段回滚点

- 关闭 `localAgentApiEnabled`
- 本地 server 不启动

## 9. 阶段 5：Node.js 客户端 SDK

### 9.1 目标

提供官方本地接入体验，避免用户手写 HTTP/WebSocket 协议。

### 9.2 任务清单

#### Task 5.1：设计 `@hydro/agent-client`

能力：

- `createHydroClient()`
- `createSession()`
- `sendMessage()`
- `onEvent()`
- `cancel()`
- `close()`
- `respondInteraction()`

#### Task 5.2：编写最小示例

文档产出：

- 示例代码
- 错误处理方式

注意：

- 该 SDK 可先在仓库内以文档形式定义，后续再独立打包

## 10. 阶段 6：内嵌页面 Agent Bridge

### 10.1 目标

让宿主内嵌页面可以安全复用平台能力，而不是访问全量 `electronAPI`。

### 10.2 任务清单

#### Task 6.1：定义内嵌页 bridge API

最小接口：

- `window.hydroAgent.createSession`
- `window.hydroAgent.sendMessage`
- `window.hydroAgent.onEvent`
- `window.hydroAgent.cancel`
- `window.hydroAgent.close`
- `window.hydroAgent.respondInteraction`

#### Task 6.2：实现 preload 精简暴露

涉及文件：

- `src/preload/preload.js`

注意：

- 不把全量 `electronAPI` 复用给内嵌页
- 不暴露宿主设置、主窗口控制等高权限接口

测试：

- 新增 `tests/main/embedded-agent-bridge.test.js`

### 10.3 阶段门槛

- 内嵌页能用 Agent
- 内嵌页不能误操作宿主专属接口

## 11. 阶段 7：宿主题桥接

### 11.1 目标

为需要视觉一致性的内嵌页提供可选主题桥接，但不强绑定宿主题。

### 11.2 任务清单

#### Task 7.1：定义主题快照结构

建议字段：

- `theme`
- `colorScheme`
- `locale`
- 可选 `tokens`

#### Task 7.2：实现只读主题桥接

建议接口：

- `window.hydroHostTheme.getSnapshot()`
- `window.hydroHostTheme.onThemeChanged()`

涉及文件：

- `src/preload/preload.js`
- 可能需要补充主进程主题广播或现有设置广播的桥接

注意：

- 不默认注入整套宿主 CSS
- 不强制嵌入页使用宿主题

测试：

- 主题切换下快照同步测试

## 12. 阶段 8：官方 Skill 上线

### 12.1 目标

让 Agent 在开发相关应用时，自动知道何时应复用 Hydro 平台。

### 12.2 任务清单

#### Task 8.1：产出正式 SKILL.md

基于：

- `docs/design/hydro-agent-app-dev-skill-design.md`

产出位置建议：

- 官方内置 skill 目录

#### Task 8.2：决定安装策略

选项：

- 内置为官方全局 skill
- 通过能力市场预装

建议：

- 内置

#### Task 8.3：增加 append prompt 最小兜底

涉及文件：

- `src/main/agent-session-manager.js`

实现要点：

- 只追加极短规则
- 绝不写成长篇接口文档

注意：

- 普通应用开发不能被强行导向 Hydro

### 12.3 验收

- 开发内嵌页聊天场景时优先生成 `window.hydroAgent` 方案
- 开发本地 Node 应用时优先生成 `@hydro/agent-client` 方案
- 普通应用开发不受影响

## 13. 阶段 9：文档与示例

### 13.1 目标

让平台可被真正使用，而不是只停留在内部结构。

### 13.2 任务清单

#### Task 9.1：新增平台用户文档

建议新增：

- `docs/user-guide/HYDRO-AGENT-PLATFORM.zh.md`

内容：

- 什么是 Hydro Agent Platform
- 适合什么场景
- 内嵌页怎么接
- 本地 Node 怎么接

#### Task 9.2：新增示例项目

建议新增：

- `examples/embedded-chat-page`
- `examples/local-node-agent-client`

## 14. 阶段 10：灰度发布与观察

### 14.1 灰度顺序

#### 灰度 A

- 仅启用 broker
- 仅服务宿主

#### 灰度 B

- 启用本地 API
- 内部使用

#### 灰度 C

- 启用内嵌 bridge
- 启用主题桥接

#### 灰度 D

- 默认安装官方 skill

### 14.2 观察指标

- 宿主会话异常率
- 会话事件丢失率
- 本地 API 连接成功率
- guest client 串扰问题
- 用户是否误用平台接口替代普通开发

## 15. 测试任务总表

### 15.1 必保留原测试

- `tests/main/agent-interactions.test.js`
- `tests/main/desktop-capability-query-options.test.js`
- `tests/main/agent-handlers-set-model.test.js`
- `tests/main/agent-path-normalize.test.js`
- DingTalk / Weixin / scheduled task 相关测试

### 15.2 新增测试建议

- `tests/main/agent-session-model.test.js`
- `tests/main/agent-event-publisher-compat.test.js`
- `tests/main/agent-session-broker.test.js`
- `tests/main/agent-db-owner-migration.test.js`
- `tests/main/agent-event-router.test.js`
- `tests/main/local-agent-api-server.test.js`
- `tests/main/embedded-agent-bridge.test.js`
- `tests/main/host-theme-bridge.test.js`

## 16. 实施阶段与责任建议

### 波次 1：核心兼容层

- 负责人：主进程 / session / DB
- 交付：阶段 1-3

### 波次 2：开放接口层

- 负责人：主进程 / preload / client 协议
- 交付：阶段 4-7

### 波次 3：开发引导层

- 负责人：skills / docs / product integration
- 交付：阶段 8-10

## 17. 启动建议

推荐的实际启动顺序：

1. 先完成阶段 1 和阶段 2
2. 验证宿主零回归
3. 再开始阶段 3 和阶段 4
4. 本地 API 稳定后再做内嵌 bridge
5. 最后落 skill 和用户文档

这是对现有代码侵入最小、可验证性最强、回滚最简单的路线。

