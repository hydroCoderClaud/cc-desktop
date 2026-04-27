# 内置 MCP 能力现状

> Hydro Desktop v1.7.54+ | [← 集成系统设计](./integrations.md) | [主进程设计](./main-process.md)

本文记录 Hydro Desktop 当前“内置 MCP”机制的真实现状，供后续重新启动相关任务时快速恢复上下文。当前已落地桌面端定时任务管理能力，并开始内建微信通知通道；是否继续扩展新的内置工具，需以明确的日常使用价值为前提。

---

## 当前结论

- 当前内置 MCP 不是能力市场里的普通 MCP，也不是写入用户 MCP 配置的外部 server。
- 它是在 Agent 会话创建 `queryOptions` 时动态注入的 SDK MCP server。
- 现有 server 名称是 `hydrodesktop`，暴露桌面端定时任务工具和微信通知工具。
- 定时任务管理工具只注入普通手动聊天会话，不注入 `source === 'scheduled'` 的定时任务执行会话，避免任务执行过程中再递归管理任务。
- 微信通知工具会注入定时任务执行会话，用于让定时任务主动把结果推送给已绑定的微信目标。
- 当前通过会话级 `allowedTools` 和 `disallowedTools` 做短期工具路由：允许 `mcp__hydrodesktop__schedule_*`，禁用 Claude Code 内建 `Cron*` 工具，避免用户意图被路由到错误调度系统。

---

## 接入链路

```text
AgentSessionManager.sendMessage()
  -> buildDesktopCapabilityQueryOptions({ scheduledTaskService, weixinNotifyService, session })
  -> createSdkMcpServer({ name: 'hydrodesktop', tools })
  -> queryOptions.mcpServers.hydrodesktop
  -> queryOptions.appendSystemPrompt
  -> queryOptions.allowedTools / queryOptions.disallowedTools
  -> Claude Code SDK query
```

关键文件：

- `src/main/agent-session-manager.js`
  - 在构建 SDK `queryOptions` 时调用 `buildDesktopCapabilityQueryOptions()`
  - 合并内置能力返回的 `mcpServers`、`appendSystemPrompt`、`allowedTools`、`disallowedTools`
- `src/main/managers/desktop-capability-query-options.js`
  - 定义 `hydrodesktop` server、工具列表、工具 schema、工具 handler、系统提示和工具白名单
- `src/main/managers/weixin-notify-service.js`
  - 内建微信 iLink 通知通道，负责扫码登录、捕获通知目标、保存 contextToken、发送文本通知
- `src/main/managers/scheduled-task-service.js`
  - 执行真实定时任务 CRUD、立即执行、历史记录、状态更新和调度轮询
- `src/main/ipc-handlers/scheduled-task-handlers.js`
  - 给桌面 UI 提供同一套定时任务能力的 IPC 管理入口
- `src/main/index.js`
  - 创建 `ScheduledTaskService`
  - 注入到 `agentSessionManager.scheduledTaskService`
  - 通过 IPC 初始化流程注入 `SessionDatabase` 并启动服务

---

## 已暴露工具

`hydrodesktop` 当前暴露 9 个定时任务工具：

| 工具 | 作用 |
|------|------|
| `schedule_list` | 列出全部 Hydro Desktop 定时任务 |
| `schedule_get` | 查看单个定时任务详情 |
| `schedule_runs` | 查看单个任务最近执行记录 |
| `schedule_create` | 创建新定时任务 |
| `schedule_update` | 更新已有定时任务 |
| `schedule_enable` | 启用已有定时任务 |
| `schedule_disable` | 停用已有定时任务 |
| `schedule_run_now` | 立即执行一次定时任务 |
| `schedule_delete` | 删除已有定时任务 |

工具返回值统一包装为 MCP text content，文本内容是格式化后的 JSON。任务序列化结果包含 `id`、`name`、`prompt`、`enabled`、调度配置、`nextRunAt`、`lastRunAt`、`lastError`、`failureCount`、`modelId`、`cwd` 和本地化 `summary` 等字段。

`hydrodesktop` 还暴露 2 个微信通知工具：

| 工具 | 作用 |
|------|------|
| `weixin_notify_list_targets` | 列出已绑定且可通知的微信目标 |
| `weixin_notify_send` | 向已绑定目标发送一条微信文本通知 |

微信通知工具只支持已捕获目标：用户需要先扫码授权，并至少给 bot 发过一次消息，Hydro Desktop 才能保存 `targetId/accountId/contextToken` 并在后续定时任务中主动发送通知。该能力不依赖 OpenClaw 包，不读取个人微信通讯录，也不承诺给任意微信好友代发。

---

## Prompt 策略

内置系统提示的目标是让模型明确区分两套调度能力：

- `hydrodesktop` 定时任务：Hydro Desktop 本地数据库里的桌面端定时任务。
- Claude Code 内建 Cron / `/loop`：Claude Code 自身调度能力。

当前提示要求模型在用户询问“定时任务、计划任务、每天、每周、立即执行、运行记录”等意图时优先使用 `hydrodesktop` 工具，而不是回复“无法访问”或引导用户去 UI 操作。

重要约束：

- 查询任务前必须实际调用相关工具，不能凭空声称没有任务或没有历史。
- 修改或删除任务前，如果用户没有提供明确 `taskId`，应先 `schedule_list` 定位目标。
- 展示模型配置时使用工具返回的真实 `modelId`；如果为空，说明任务跟随 API Profile 默认模型。

---

## 当前边界

- 这套机制目前不是通用内置 MCP registry，逻辑集中在 `desktop-capability-query-options.js`。
- 手动会话的 `allowedTools` 会合并定时任务工具和微信通知工具；定时任务会话只注入微信通知工具且不设置 `allowedTools`，避免限制定时任务原本可用工具。
- `disallowedTools` 对 Claude Code 内建 `Cron*` 是硬编码短期策略。远期需要更细粒度地区分目标域，而不是一刀切禁用。
- 内置 MCP 工具与 UI IPC 共享底层 `ScheduledTaskService`，但不是同一入口；行为一致性主要靠服务层和测试保障。
- GitNexus 当前没有识别出这些工具为标准 MCP tool nodes，理解链路时需要直接看源码和测试。
- 微信通知状态文件保存 bot token 和 contextToken，属于敏感凭证；正式 UI 需要明确提示本地存储边界，后续可考虑迁移到系统凭据存储或加密存储。

---

## 微信通知三阶段计划

### 阶段 1：主动通知发送

目标：让 Hydro Desktop 定时任务可向已绑定微信目标主动推送结果。

- 内建 iLink HTTP 协议调用，不依赖 OpenClaw runtime 或 npm 包。
- 支持扫码登录，保存 `accountId`、`botToken`、`userId`。
- 支持轮询一次 `getupdates` 捕获目标用户的 `userId/contextToken`。
- 支持 `weixin_notify_list_targets` 和 `weixin_notify_send`。
- 桌面端入口位于“能力管理 → 微信通知”，用于扫码绑定、捕获目标和发送测试通知。
- 不做通讯录读取，不做任意好友发送，不做自动 AI 回复。

### 阶段 2：回信展示

目标：用户收到通知后可以回发消息，Hydro Desktop 能在桌面端显示。

- 后台持续长轮询微信入站消息。
- 将回信写入通知记录或任务回执记录。
- 桌面端显示通知和对应任务上下文。
- 默认不触发 AI 自动回复。

### 阶段 3：回信触发 Agent

目标：允许微信回信继续驱动指定 Agent 会话。

- 建立微信目标与 Agent 会话/定时任务的映射。
- 同一目标消息串行处理，避免并发竞态。
- 加入权限、防骚扰、频率限制和审计。
- 明确区分“通知通道”和“外部 IM 会话桥接”。

---

## 测试覆盖

当前相关测试主要覆盖两类风险：

- `tests/main/desktop-capability-query-options.test.js`
  - 验证 `hydrodesktop` server 和 9 个工具被暴露
  - 验证工具 payload 序列化、任务定位、运行记录、立即执行和删除委托
  - 验证 `allowedTools` 名称与系统提示关键内容
- `tests/main/agent-interactions.test.js`
  - 验证普通手动会话会注入定时任务 MCP 工具
  - 验证 `source === 'scheduled'` 的会话不会注入这些工具

---

## 后续重启任务时先确认

继续做新的内置 MCP 能力前，先回答这些问题：

1. 这个能力是否是用户日常高频会用的本地桌面能力？
2. AI 是否必须通过桌面端宿主才能可靠完成，而不是直接用现有文件、Shell、浏览器或普通 MCP？
3. 这个能力是否会带来真实闭环，例如减少 UI 操作、触发通知、管理长期任务、恢复上下文？
4. 是否需要修改用户持久配置？如果需要，是否有确认、回滚和审计记录？
5. 多个内置 MCP 共存时，`allowedTools` 和 `disallowedTools` 应该如何合并？

当前倾向：不要为了“内置”而继续扩展。只有当出现明确用户需求，再按同一套会话级注入机制或先抽象 registry 继续推进。
