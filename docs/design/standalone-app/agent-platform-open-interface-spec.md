# Agent Platform 对外接口规范

> 状态：Phase 3 正式接口文档草案
> 适用范围：Hydro Desktop Agent Platform
> 关联实现：
> - `src/preload/preload.js`
> - `src/main/ipc-handlers.js`
> - `src/main/agent-platform/agent-session-broker.js`
> - `src/main/agent-platform/agent-event-router.js`
> - `src/main/agent-platform/local-agent-api-server.js`

## 1. 目标

本文档定义 Hydro Desktop 对外开放的 Agent Platform 接口规范，覆盖两条复用路径：

- 宿主内嵌页面：通过 `window.hydroAgent`
- 本地 Node.js 应用：通过本机 `HTTP + WebSocket`

目标不是开放第二套 Agent 系统，而是在不影响原有宿主聊天能力的前提下，对外复用已有底层 `AgentSessionManager` 能力。

## 2. 设计原则

- 原有宿主聊天能力保持不变
- 外部入口统一复用同一套 session 底座
- 不向外暴露宿主专属控制能力
- 事件必须按 owner 定向路由，避免串会话
- 对外接口保持小而稳，先开放最常用能力

## 3. 架构总览

```text
host chat
  -> agent:* IPC
  -> AgentSessionManager

embedded page
  -> window.hydroAgent
  -> hydro-agent:* IPC
  -> AgentSessionBroker
  -> AgentEventRouter
  -> AgentSessionManager

local node app
  -> HTTP / WebSocket
  -> LocalAgentApiServer
  -> AgentSessionBroker
  -> AgentEventRouter
  -> AgentSessionManager
```

## 3.1 内嵌 App 的正式形态

本平台后续对内嵌 app 的正式定义，统一采用：

- 可扩展型内嵌 app

这意味着：

- 它仍然是 `embedded app`
- 它仍然运行在 Hydro Desktop 内
- 它仍然通过 `window.hydroAgent` 与宿主桥接能力
- 它不是脱离 Hydro Desktop 独立运行的 standalone app

这里要明确区分两件事：

- `可扩展型`：安装和目录形态
- `内嵌 app`：运行形态

二者不冲突。

## 3.2 正式目录规范

内嵌 app 的正式目标程序目录建议统一为：

```text
<userData>/embedded-apps/<appId>/
  app.json
  web/
  assets/
  data/
  workspace/
  skills/
```

字段含义：

- `app.json`
  - app 清单
  - 定义 `appId`、名称、入口页、版本、权限声明
- `web/`
  - 前端页面代码与静态资源
  - 宿主加载的内嵌页面入口应从这里解析
- `assets/`
  - 图标、图片、品牌资源
- `data/`
  - 业务运行数据
- `workspace/`
  - 给 Agent 开发该内嵌 app 时使用的工作目录
- `skills/`
  - 该 app 专属 skill、prompt 或接入说明

说明：

- `examples/` 下的目录只用于演示，不代表正式安装位置
- 正式内嵌 app 不建议以主仓源码目录作为长期运行根目录
- 正式形态优先采用 `<userData>/embedded-apps/<appId>/`

## 4. 客户端类型

当前平台约定三类 client：

- `host`
- `embedded`
- `node`

当前 clientId 规范：

- 宿主聊天：`host-ui`
- 内嵌页面：`embed:<appId>`
- 本地 Node.js：`node:<appId>`

## 5. `window.hydroAgent` 接口

### 5.1 使用前提

内嵌页面必须先调用：

```js
await window.hydroAgent.connect({
  appId: 'my-embedded-app',
  clientMeta: {
    page: 'chat',
    version: '0.1.0'
  }
})
```

未 `connect()` 前调用其他方法会抛错。

### 5.2 接口列表

#### `connect({ appId, clientMeta })`

用途：

- 注册 embedded client
- 建立事件桥

返回：

```json
{
  "success": true,
  "clientId": "embed:my-embedded-app",
  "appId": "my-embedded-app"
}
```

#### `disconnect()`

用途：

- 断开事件桥
- 清理当前 embedded client 本地状态

#### `createSession(options)`

用途：

- 创建一个属于当前 embedded client 的 agent session

当前透传到 broker 的常用字段建议：

- `cwd`
- `title`
- `systemPrompt`
- `source`
- `maxTurns`

`cwd` 建议约定：

- 内嵌 app 为自身开发会话创建 session 时，优先使用：
  - `<userData>/embedded-apps/<appId>/workspace/`
  - 或 `<userData>/embedded-apps/<appId>/`
- 不建议把 `cwd` 指向 desktop 主程序安装目录
- 也不建议默认指向 desktop 主仓工程根目录

#### `listSessions()`

返回当前 embedded client 自己拥有的会话列表。

#### `getSession(sessionId)`

返回指定会话；若会话不属于当前 client，则结果为 `null` 或抛出找不到。

#### `getMessages(sessionId)`

返回该会话消息列表。

#### `sendMessage(sessionId, payload)`

支持两种形态：

```js
await window.hydroAgent.sendMessage(sessionId, '你好')
```

```js
await window.hydroAgent.sendMessage(sessionId, {
  message: '请总结当前目录结构',
  model: 'qwen3-coder-plus',
  maxTurns: 8
})
```

当前支持字段：

- `message`
- `model`
- `modelTier`
- `maxTurns`

说明：

- `modelTier` 当前仅作为兼容字段向下透传
- 建议新接入方优先使用 `model`

#### `cancel(sessionId)`

取消当前生成。

#### `close(sessionId)`

关闭会话。

#### `reopen(sessionId)`

恢复已关闭会话。

#### `setModel(sessionId, model)`

为当前会话设置模型快照。

#### `respondInteraction(sessionId, interactionId, response)`

响应宿主提出的交互请求，例如：

- `ask_user_question`
- `permission_request`

#### `cancelInteraction(sessionId, interactionId, reason)`

取消某次交互请求。

#### `listDir(sessionId, relativePath = '', showHidden = false)`

列出会话工作目录下的文件。

#### `readFile(sessionId, relativePath)`

读取会话工作目录下文件。

#### `saveFile(sessionId, relativePath, content)`

保存会话工作目录下文件。

#### `searchFiles(sessionId, keyword, showHidden = false)`

按关键字搜索会话工作目录下文件。

#### `onEvent(sessionId, callback)`

订阅事件。

说明：

- `sessionId` 可传具体会话 id，也可传空值表示监听当前 embedded client 的全部事件
- 返回一个 `unsubscribe` 函数

### 5.3 事件对象格式

回调收到的是统一 envelope：

```json
{
  "channel": "agent:message",
  "payload": {
    "sessionId": "session-1"
  },
  "ownerClientId": "embed:my-embedded-app",
  "timestamp": 1746940000000
}
```

当前常见 `channel`：

- `agent:init`
- `agent:message`
- `agent:stream`
- `agent:result`
- `agent:error`
- `agent:cliError`
- `agent:statusChange`
- `agent:interactionRequest`
- `agent:interactionResolved`
- `agent:allSessionsClosed`

说明：

- `payload` 字段结构沿用现有宿主事件语义
- 外部接入时应优先按 `channel` 分派，而不要假定所有 payload 相同

## 6. `window.hydroHostTheme` 接口

### `getSnapshot()`

返回当前宿主题快照：

```json
{
  "theme": "light",
  "colorScheme": "claude",
  "locale": "zh-CN"
}
```

### `onThemeChanged(callback)`

订阅主题变化，返回 `unsubscribe`。

说明：

- 这是可选桥接
- 内嵌页面可以复用主题，也可以完全自定义样式

## 7. 本地 HTTP 接口

### 7.1 总体规则

- 仅监听 `127.0.0.1`
- 当前使用随机端口
- 功能开关由 `settings.localAgentApi.enabled` 控制
- 所有请求返回 JSON

### 7.2 身份头

除 `GET /v1/agent/status` 外，其余请求都必须携带：

- `x-hydro-app-id: <appId>`

可选：

- `x-hydro-client-meta: <json-string>`

示例：

```http
x-hydro-app-id: hydrology-helper
x-hydro-client-meta: {"entry":"cli","version":"0.1.0"}
```

### 7.3 路由列表

#### `GET /v1/agent/status`

返回服务状态：

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "running": true,
    "host": "127.0.0.1",
    "port": 63827
  }
}
```

#### `POST /v1/agent/sessions`

创建会话。

#### `GET /v1/agent/sessions`

列出当前 node client 自己的会话。

#### `GET /v1/agent/sessions/:id`

读取单个会话。

#### `GET /v1/agent/sessions/:id/messages`

读取会话消息。

#### `POST /v1/agent/sessions/:id/messages`

发送消息。

请求体：

```json
{
  "message": "请总结当前目录结构",
  "model": "qwen3-coder-plus",
  "maxTurns": 8
}
```

#### `POST /v1/agent/sessions/:id/cancel`

取消生成。

#### `POST /v1/agent/sessions/:id/close`

关闭会话。

#### `POST /v1/agent/sessions/:id/reopen`

恢复会话。

#### `POST /v1/agent/sessions/:id/set-model`

设置模型。

请求体：

```json
{
  "model": "qwen3-coder-plus"
}
```

#### `POST /v1/agent/sessions/:id/files/list`

列出会话目录文件。

#### `POST /v1/agent/sessions/:id/files/read`

读取会话目录文件。

#### `POST /v1/agent/sessions/:id/files/save`

保存会话目录文件。

#### `POST /v1/agent/sessions/:id/files/search`

搜索会话目录文件。

#### `POST /v1/agent/sessions/:id/interactions/:interactionId/respond`

响应交互请求。

#### `POST /v1/agent/sessions/:id/interactions/:interactionId/cancel`

取消交互请求。

### 7.4 返回结构

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "APP_ID_REQUIRED",
    "message": "x-hydro-app-id header is required"
  }
}
```

## 8. WebSocket 事件接口

地址：

- `WS /v1/agent/events`

请求头：

- `x-hydro-app-id`
- 可选 `x-hydro-client-meta`

连接成功后，服务端会把属于当前 `node:<appId>` 的事件 envelope 推送给客户端。

推送格式与 embedded route 一致：

```json
{
  "channel": "agent:message",
  "payload": {
    "sessionId": "session-1"
  },
  "ownerClientId": "node:hydrology-helper",
  "timestamp": 1746940000000
}
```

## 9. 错误语义

当前第一版对外错误约定：

- `APP_ID_REQUIRED`
- `NOT_FOUND`
- `INTERNAL_ERROR`

此外，底层 broker 的权限校验失败目前统一表现为：

- `Session not found`

这是一种刻意收口：

- 不向外部泄露“该 session 存在但不属于你”
- 避免跨 client 探测宿主或其他 app 的会话

## 10. 最小接入流程

### 10.1 内嵌页面

1. `connect({ appId })`
2. 为当前 app 解析正式目录：`<userData>/embedded-apps/<appId>/`
3. `createSession({ cwd, title })`
4. `cwd` 优先指向该 app 的 `workspace/` 或 app 根目录
5. `onEvent(session.id, handler)`
6. `sendMessage(session.id, { message })`
7. 如收到 `agent:interactionRequest`，调用 `respondInteraction()`

### 10.1.1 示例清单建议

后续正式内嵌 app 的 `app.json` 建议至少包含：

```json
{
  "appId": "hydrology-workbench",
  "name": "Hydrology Workbench",
  "version": "0.1.0",
  "entry": "web/index.html",
  "permissions": {
    "agentSession": true,
    "hostTheme": true,
    "sessionFiles": true
  }
}
```

### 10.2 本地 Node.js

1. 发现本地服务端口
2. 通过 `x-hydro-app-id` 连接 WebSocket
3. 通过 HTTP 创建 session
4. 发送消息
5. 消费 WebSocket 事件

## 11. 向后兼容约束

- 原 `agent:*` IPC 不废弃
- 宿主聊天窗口仍直接走原结构
- 新增开放接口只增加，不替换宿主聊天主链路
- 任何后续扩展都不得破坏 `host-ui` 的默认行为

## 12. 当前已实现与暂未实现

当前已实现：

- `window.hydroAgent`
- `window.hydroHostTheme`
- embedded IPC 路由
- `AgentEventRouter`
- 本地 `HTTP + WebSocket`
- 基础文件操作接口

当前暂未实现：

- 官方 Node.js SDK 包
- 固定端口管理与发现协议
- token 级鉴权
- 更细粒度 capability ACL
- 示例应用入口注册器

## 13. 示例

最小 embedded 示例见：

- `examples/embedded-agent-minimal/`

鉴权与权限模型见：

- `docs/design/standalone-app/agent-platform-auth-permission-model.md`
