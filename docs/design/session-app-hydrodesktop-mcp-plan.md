# 会话应用接入 Hydro Desktop 内置 MCP 计划

> 关联文档：[内置 MCP 能力现状](./built-in-mcp.md)

## 1. 目标

将“会话应用”能力接入现有 `hydrodesktop` 内置 MCP server，让 Agent 在普通对话中可直接通过内置工具创建、查看、修改和启动会话应用。

本次不是新增独立 MCP server，也不是改造外部 MCP 市场，而是在现有 `hydrodesktop` 内置 MCP 上增加一组 `session_app_*` 工具。

## 2. 范围

本期仅纳入以下会话应用工具：

- `session_app_list`
- `session_app_get`
- `session_app_create`
- `session_app_update`
- `session_app_launch`

暂不纳入：

- 工作台打开类工具
- 删除工具
- 版本、草稿、快照等已废弃语义
- `allowedCapabilities`、`inputSchema`、`workflowHints`、`outputHints` 等内部或未稳定字段

## 3. 设计原则

- 继续复用 `hydrodesktop` server，不新增第二个内置 MCP server。
- 底层业务统一复用 `SessionAppManager`，不新增第二套会话应用业务层。
- MCP 暴露字段只包含当前 UI 已稳定支持且用户可理解的字段。
- Agent 通过 MCP 修改的结果，应与工作台直接编辑结果保持一致。
- 不影响现有 `/session-app` 卡片流程；该流程继续作为可视化确认入口存在。

## 4. 工具契约

### 4.1 `session_app_list`

用途：列出当前会话应用列表，便于定位目标应用。

输出字段建议：

- `appId`
- `name`
- `description`
- `defaultContext`

### 4.2 `session_app_get`

用途：查看单个会话应用完整定义。

输入：

- `appId`

输出字段建议：

- `appId`
- `name`
- `description`
- `systemPrompt`
- `startupMessageTemplate`
- `defaultContext`

### 4.3 `session_app_create`

用途：创建会话应用。

输入字段建议：

- `name`
- `description`
- `systemPrompt`
- `startupMessageTemplate`
- `defaultContext.cwd`

### 4.4 `session_app_update`

用途：更新已有会话应用。

输入：

- `appId`
- `updates`

`updates` 仅允许：

- `name`
- `description`
- `systemPrompt`
- `startupMessageTemplate`
- `defaultContext.cwd`

### 4.5 `session_app_launch`

用途：基于会话应用启动一个新的应用会话。

输入：

- `appId`
- 可选 `cwd`
- 可选 `title`

输出：

- `sessionId`
- `title`
- `sessionAppId`

## 5. 实现位置

### 5.1 主实现入口

- `src/main/managers/desktop-capability-query-options.js`

在现有 `hydrodesktop` 工具集合中增加 `session_app_*` 工具定义、schema 和 handler。

### 5.2 业务复用入口

- `src/main/managers/session-app-manager.js`

新增 MCP 侧所需的最小辅助方法时，也应优先加在这里，而不是把会话应用逻辑散落到 MCP 适配层。

### 5.3 运行时依赖注入

`buildDesktopCapabilityQueryOptions()` 需要能够拿到 `SessionAppManager` 或等价能力入口。

建议方式：

- 在 `ipc-handlers.js` 初始化时创建 `SessionAppManager`
- 同时把该实例挂到 `agentSessionManager`
- `AgentSessionManager.sendMessage()` 调用 `buildDesktopCapabilityQueryOptions()` 时一并传入

## 6. Prompt 策略

在 `hydrodesktop` 系统提示中补充会话应用语义：

- 当用户要求创建、查看、修改、启动会话应用时，优先使用 `session_app_*` 工具
- 不要把会话应用创建引导回 `/session-app` 或桌面工作台，除非用户明确要求可视化编辑
- 修改应用前，如目标不明确，应先调用 `session_app_list`
- 查询应用详情时使用 `session_app_get`

## 7. 风险控制

- 不开放删除工具，避免模型误删用户应用
- `session_app_update` 必须显式传 `appId`
- 继续隐藏内部字段，避免模型写入不稳定结构
- 工具返回值统一 JSON text content，保持与现有 `hydrodesktop` 工具一致

## 8. 测试计划

新增或扩展以下测试：

- `tests/main/desktop-capability-query-options.test.js`
  - 验证 `hydrodesktop` 工具集中包含 `session_app_*`
  - 验证 create/get/update/launch 的输入输出
- `tests/main/agent-interactions.test.js`
  - 验证普通 Agent 会话可注入会话应用 MCP 工具
- `tests/main/session-app-manager.test.js`
  - 如补了 manager 新能力，验证其行为与现有 UI 语义一致

## 9. 实施顺序

1. 补本文档
2. 在 `hydrodesktop` 中增加 `session_app_*` 工具定义
3. 接通 `SessionAppManager` 注入链
4. 补测试
5. 跑定向测试与构建验证
