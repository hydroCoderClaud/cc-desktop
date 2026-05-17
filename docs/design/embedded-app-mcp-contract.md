# Embedded App MCP 工具契约

> 状态：当前实现说明
> 适用范围：Hydro Desktop 内嵌 app Agent 会话
> 关联实现：
> - `src/main/managers/embedded-app-capability-query-options.js`
> - `src/main/agent-platform/embedded-app-runtime-manager.js`
> - `src/renderer/components/embedded-agent/embedded-app-runtime-bridge.js`
> - `src/renderer/pages/hydrology-workbench/main.js`

## 1. 文档目标

本文档定义内嵌 app 会话级内置 MCP server `embeddedapp` 的当前工具契约。

它与全局平台能力型 MCP `hydrodesktop` 不同：

- `hydrodesktop`
  - 面向桌面平台通用能力
  - 例如定时任务、微信通知
- `embeddedapp`
  - 面向当前内嵌 app 实例
  - 负责读取 app 上下文、驱动 app 执行动作

## 2. 设计定位

`embeddedapp` 不是公网 MCP，也不是用户手工配置的外部 MCP。

它是：

- 会话级
- 主进程内置
- 按当前 embedded session 动态注入
- 仅对 `clientType=embedded` 且带 `appId` 的 Agent 会话生效

## 3. 当前工具列表

当前 `embeddedapp` 只提供两个工具：

1. `context_get`
2. `command_execute`

这两个工具构成 embedded app 与 agent 的最小闭环：

- `context_get`
  - 读 app 当前状态
- `command_execute`
  - 让 app 执行受控动作

## 4. 工具定义

### 4.1 `context_get`

用途：

- 读取当前 embedded app 的业务上下文快照
- 避免模型仅凭聊天记录猜测“当前站点”“当前 tab”“当前任务”

输入：

```json
{}
```

返回：

```json
{
  "action": "context_get",
  "appId": "hydrology-workbench",
  "context": {
    "title": "三家店水文站 / 审核任务状态",
    "summary": "当前站点：三家店水文站（SJD001），当前功能：审核任务状态。",
    "payload": {}
  }
}
```

返回字段说明：

- `action`
  - 固定为 `context_get`
- `appId`
  - 当前内嵌 app 标识
- `context`
  - 由当前 embedded app 提供的结构化上下文对象

### 4.2 `command_execute`

用途：

- 请求当前 embedded app 执行一个受控动作
- 例如切换 tab、选中站点、打开审核任务

输入：

```json
{
  "command": "openTab",
  "payload": {
    "functionKey": "review"
  }
}
```

参数说明：

- `command`
  - 动作名称，当前支持：
    - `refresh` — 请求 app 安全刷新页面数据
    - `selectStation` — 切换站点
    - `openTab` — 切换功能 tab
    - `openReviewTask` — 打开审核任务详情
    - `openReviewBoard` — 直接切到审核任务状态页
- `payload`
  - 动作参数对象

返回：

```json
{
  "action": "command_execute",
  "appId": "hydrology-workbench",
  "command": "openTab",
  "payload": {
    "functionKey": "review"
  },
  "result": {
    "success": true,
    "activeFunctionKey": "review"
  }
}
```

返回字段说明：

- `action`
  - 固定为 `command_execute`
- `appId`
  - 当前内嵌 app 标识
- `command`
  - 实际执行的动作名
- `payload`
  - 传入参数
- `result`
  - 当前 embedded app 返回的执行结果

## 5. Hydrology Workbench 当前上下文结构

当前水文工作台通过 `getAgentContext()` 向 `context_get` 提供上下文。

当前结构如下：

```json
{
  "title": "站点名 / 当前功能名",
  "summary": "当前站点、当前功能、当前时槽、当前审核任务的摘要文本",
  "payload": {
    "appId": "hydrology-workbench",
    "station": {},
    "function": {},
    "realtimeSlot": {},
    "reviewTask": {}
  }
}
```

当前 `payload` 主要字段：

- `appId`
  - 固定为 `hydrology-workbench`
- `station`
  - 当前选中站点对象
- `function`
  - 当前激活的中间区功能 tab
- `realtimeSlot`
  - 当前实时数据详情对应的时槽对象
- `reviewTask`
  - 当前选中审核任务对象

说明：

- `realtimeSlot` 仅在实时数据场景下存在
- `reviewTask` 仅在审核任务页存在
- 未选中时对应字段为 `null`

## 6. Hydrology Workbench 当前命令集

当前水文工作台已实现的 `command_execute` 命令如下。

### 6.1 `refresh`

用途：

- 请求 app 安全刷新页面数据，用于 in-app 写入（如通过 MCP 工具新增/修改/删除数据）后同步 UI 状态

输入：

```json
{
  "command": "refresh",
  "payload": {}
}
```

返回示例（有选中站点）：

```json
{
  "success": true,
  "refreshed": true,
  "selectedStationId": "station-001"
}
```

返回示例（无选中站点）：

```json
{
  "success": true,
  "refreshed": true,
  "selectedStationId": null
}
```

### 6.2 `selectStation`

用途：

- 切换当前站点

输入：

```json
{
  "command": "selectStation",
  "payload": {
    "stationId": "station-001"
  }
}
```

返回示例：

```json
{
  "success": true,
  "selectedStationId": "station-001"
}
```

### 6.3 `openTab`

用途：

- 打开中间区域功能 tab

输入：

```json
{
  "command": "openTab",
  "payload": {
    "functionKey": "review"
  }
}
```

当前 `functionKey` 取值由页面定义，当前至少包括：

- `basic`
- `realtime`
- `review`
- `rule-config`
- `results`

返回示例：

```json
{
  "success": true,
  "activeFunctionKey": "review"
}
```

### 6.4 `openReviewTask`

用途：

- 打开某个审核任务对应的时槽详情

输入：

```json
{
  "command": "openReviewTask",
  "payload": {
    "taskId": "review-task-001",
    "slotTime": "2026-05-16T00:00:00.000Z"
  }
}
```

返回示例：

```json
{
  "success": true,
  "selectedTaskId": "review-task-001",
  "selectedSlotId": "slot-001"
}
```

### 6.5 `openReviewBoard`

用途：

- 直接切到审核任务状态页

输入：

```json
{
  "command": "openReviewBoard",
  "payload": {}
}
```

返回示例：

```json
{
  "success": true,
  "activeFunctionKey": "review"
}
```

## 7. 提示词与工具路由约束

当前 embedded session 会追加一段专用 system prompt。

其核心约束是：

- “当前站点 / 当前 tab / 当前任务 / 当前选择”这类问题，优先调用 `context_get`
- “切换页面 / 打开审核任务状态 / 打开实时数据列表 / 选择站点”这类请求，优先调用 `command_execute`
- 在 `hydrology-workbench` 中：
  - `站点`
  - `实时数据`
  - `审核任务`
  - `审核任务状态`
  - `工作成果`
  - `时槽`
  - `当前任务`
  默认解释为水文工作台业务域
- 只有用户明确提到：
  - `定时任务`
  - `计划任务`
  - `schedule`
  - `cron`
  才应优先路由到全局 `hydrodesktop` 定时任务工具
- 当 MCP 工具（如 `hydrology` 的 CRUD 操作）在 app 内写入数据后，UI 可能已过时，此时可调用 `command_execute` 的 `refresh` 命令请求页面安全重载

三层能力路由优先级：

| 问题类型 | 优先 MCP server |
|---------|----------------|
| 当前页面状态、当前站点/tab/任务 | `embeddedapp` |
| 水文业务数据查询与写入（站点、时槽、审核、质量检查） | `hydrology` |
| 桌面平台全局能力（定时任务、微信通知） | `hydrodesktop` |

## 8. 运行时桥接机制

`embeddedapp` MCP 的运行链路如下：

```text
embedded app renderer
  -> getContext()
  -> window.hydroAgent.updateContext()
  -> EmbeddedAppRuntimeManager
  -> embeddedapp.context_get

agent
  -> embeddedapp.command_execute
  -> EmbeddedAppRuntimeManager.executeCommand()
  -> main process event bridge
  -> renderer commandHandler
```

关键点：

- 上下文快照保存在主进程 `EmbeddedAppRuntimeManager`
- 命令回调也注册在 `EmbeddedAppRuntimeManager`
- Agent 实际看到的是会话级内置 MCP 工具，不直接接触 renderer 对象

## 9. 扩展约定

后续新增 embedded app 时，建议继续复用相同模式：

1. 每个 app 提供一个稳定的 `getContext()`
2. 每个 app 提供一个显式 `commandHandler()`
3. 上下文优先保持结构化，而不是只拼自然语言摘要
4. 命令名保持面向业务动作，而不是面向 DOM 细节

推荐原则：

- 好命令：
  - `selectStation`
  - `openTab`
  - `openReviewTask`
- 不推荐：
  - `clickLeftTreeNode`
  - `triggerButton42`
  - `setDivVisible`

## 10. 当前边界

当前 `embeddedapp` MCP 仍有边界：

- 不支持任意 DOM 控制
- 不支持跨 app 调用
- 不支持一个会话同时控制多个 embedded app
- 不负责全局桌面能力

因此它的角色应当被理解为：

- 当前内嵌 app 实例的业务上下文与动作代理

而不是：

- 通用桌面自动化工具

## 11. 与 `hydrology` MCP server 的关系

自闭环重构后，水文工作台 Agent 会话同时注入三个 MCP server：

- `hydrodesktop` — 桌面平台通用能力（定时任务、微信通知）
- `embeddedapp` — 当前内嵌 app 的 UI 上下文与动作代理（本文档范围）
- `hydrology` — 水文专业业务数据能力（站点 CRUD、实时观测 CRUD、过程线、demo 数据灌入、审核任务处理、质量检查）

`embeddedapp` 与 `hydrology` 的职责边界：

| | `embeddedapp` | `hydrology` |
|---|---|---|
| 读取当前页面上下文 | ✅ | — |
| 驱动前端页面切换 | ✅ | — |
| 查询/写入水文业务数据 | — | ✅ |
| 执行质量检查 | — | ✅ |
| demo 数据灌入 | — | ✅ |

`hydrology` server 的工具清单与实现详见：
- `src/main/managers/hydrology-capability-query-options.js`
- `docs/design/hydrology-embedded-agent-closure-refactor-plan.md`
