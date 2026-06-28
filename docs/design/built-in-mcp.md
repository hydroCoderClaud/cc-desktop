# 内置 MCP 能力现状

> Hydro Desktop v1.7.64+ | [← 集成系统设计](./integrations.md) | [主进程设计](./main-process.md)

本文记录 Hydro Desktop 当前“内置 MCP”机制的真实现状，供后续重新启动相关任务时快速恢复上下文。当前已落地桌面端定时任务管理能力、微信通知通道、IM 主动发送通道，并已补齐微信双向聊天基础闭环；是否继续扩展新的内置工具，需以明确的日常使用价值为前提。

---

## 当前结论

- 当前内置 MCP 不是能力市场里的普通 MCP，也不是写入用户 MCP 配置的外部 server。
- 它是在 Agent 会话创建 `queryOptions` 时动态注入的 SDK MCP server。
- 现有 server 名称是 `hydrodesktop`，暴露桌面端定时任务工具、微信通知工具和 IM 主动发送工具。
- 定时任务管理工具会统一注入可用的 Agent 会话，不再按“任务执行会话”做特殊区分。
- 微信通知工具会注入定时任务执行会话，用于让定时任务主动把结果推送给已绑定的微信目标。
- 当前通过会话级 `allowedTools` 和 `disallowedTools` 做短期工具路由：允许 `mcp__hydrodesktop__schedule_*`，禁用 Claude Code 内建 `Cron*` 工具，避免用户意图被路由到错误调度系统。
- 会话是否绑定 `taskId` 不再影响内置 MCP 注入；只要能力可用，就按同一规则注入。
- 测试时如果是在“由定时任务自动创建/恢复”的会话里继续聊天，是否能看到 `schedule_*` 工具取决于上述全局开关。

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
- `src/main/managers/im-file-attachments.js`
  - 统一 IM 文档附件的出站格式、支持扩展名和大小上限
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

工具返回值统一包装为 MCP text content，文本内容是格式化后的 JSON。任务序列化结果包含 `id`、`name`、`prompt`、`enabled`、调度配置、`nextRunAt`、`lastRunAt`、`lastError`、`failureCount`、`runtimeState`、`sessionBindingMode`、`cwd` 和本地化 `summary` 等字段。

MCP 公共输入中的调度时间统一使用 `firstRunAt`。`dailyTime` 仍只保留在服务层 / 存储层作为历史兼容字段，不属于对外 schema，也不建议由外部调用方传入。

### 定时任务执行语义

- 定时任务领域对外暴露的是 `maxRuns`，含义是“任务生命周期内最多允许执行多少次”。
- `maxRuns` 计数的是任务启动次数，不是单次 Agent 对话内部的消息轮次。
- 通用 Agent 能力里的 `maxTurns` 仍然存在，但它属于“单次会话/单次调用最多跑多少轮”的底层限制，不属于定时任务产品语义。
- Hydro Desktop 当前刻意不在定时任务 UI、MCP schema、任务草案里暴露 `maxTurns`，避免把“执行次数”和“单次轮次”混为一谈。
- 如果后续需要防止单次任务运行过长，应优先用系统级兜底或会话级底层限制处理，而不是重新把 `maxTurns` 暴露为定时任务配置项。
- `interval` 类型的下次触发时间以 `firstRunAt + N * intervalMinutes` 的固定槽位推进；启用、恢复或重置计数后，仍回到同一相位基准重新计算最近槽位，而不是以“重新启用时刻”作为新起点。
- 定时任务不再维护独立 `apiProfileId` / `modelId`；执行时统一复用绑定会话的当前 runtime。
- 普通聊天创建的 `sessionBindingMode=current` 任务仍静态绑定创建时的具体会话。
- embedded app 创建的 `sessionBindingMode=current` 任务是“跟随该 app 当前会话”，不是静态回用旧会话。
- embedded current 绑定任务在目标 app 当前没有会话时会记一次 `skipped`，不会回落到新建独立任务会话。

`hydrodesktop` 还暴露 2 个微信通知工具：

| 工具 | 作用 |
|------|------|
| `weixin_notify_list_targets` | 列出已绑定且可通知的微信目标 |
| `weixin_notify_send` | 向已绑定目标发送一条微信文本通知 |

微信通知工具只支持已授权且已捕获的目标：需要接收通知的微信用户必须自己扫码授权，Hydro Desktop 通过 `getupdates` 保存 `targetId/accountId/contextToken` 后，才能在后续聊天或定时任务中主动发送通知。该能力不读取个人微信通讯录，也不能给扫码用户的普通微信好友代发。

已验证的 iLink 边界：

- `get_bot_qrcode?bot_type=3` 生成的是登录/授权二维码，`get_qrcode_status` 返回 `bot_token`、`ilink_bot_id` 和扫码用户 `ilink_user_id`。
- 未发现“目标用户进入 bot 会话”的独立入口二维码或 invite/contact/session-entry 类接口；公开协议也只覆盖登录、`getupdates`、`sendmessage`、`getconfig`、`sendtyping` 和媒体上传。
- 因此当前可落地模型是“接收通知的人自己扫码授权后成为可通知目标”，不是“A 扫码后给 A 的任意微信好友 B 发消息”。

当前 MCP 工具面向聊天发送做了第一步优化：

- `weixin_notify_list_targets` 返回 `targetKey`、`displayLabel`、`aliases`、`sendable`，让 LLM 优先使用稳定的 `targetKey` 发送。
- 当目标备注名唯一时，`targetKey` 使用备注名；当备注名重复时，`targetKey` 退回完整目标 `id`，避免误发。
- `weixin_notify_send` 支持 `targetKey`，同时兼容旧的 `targetId/displayName`。
- 发送结果返回 `recipient`，用于聊天窗口向用户展示“发给了谁”和 `messageId`。

`hydrodesktop` 还暴露 1 个 IM 主动发送工具：

| 工具 | 作用 |
|------|------|
| `im_send` | 向已配置的飞书、钉钉或企业微信目标发送文本、图片或文档文件 |

`im_send` 的当前输入边界：

- `channel` 可指定 `feishu`、`dingtalk`、`enterprise-weixin`；省略时优先使用当前会话已绑定的 IM 目标。
- `targetKey` 用于选择目标，可使用列表返回的稳定目标键、目标名称或明确 ID。
- `text`、`imagePaths`、`filePaths` 至少提供一种。
- `imagePaths` 继续用于图片发送，并保持图片视觉理解链路不变。
- `filePaths` 支持本地绝对路径文档，当前格式为 `.pdf`、`.doc`、`.docx`、`.xls`、`.xlsx`、`.ppt`、`.pptx`，单文件大小上限为 30MB。
- Windows 路径和 macOS/Linux POSIX 绝对路径均应可用；文件必须已存在且可读取。

使用示例：

```json
{
  "channel": "feishu",
  "targetKey": "飞书李四",
  "text": "请查收文档",
  "filePaths": ["/Users/demo/report.pdf"]
}
```

---

## Prompt 策略

内置系统提示的目标是让模型明确区分两套调度能力：

- `hydrodesktop` 定时任务：Hydro Desktop 本地数据库里的桌面端定时任务。
- Claude Code 内建 Cron / `/loop`：Claude Code 自身调度能力。

当前提示要求模型在用户询问“定时任务、计划任务、每天、每周、立即执行、运行记录”等意图时优先使用 `hydrodesktop` 工具，而不是回复“无法访问”或引导用户去 UI 操作。

重要约束：

- 查询任务前必须实际调用相关工具，不能凭空声称没有任务或没有历史。
- 修改或删除任务前，如果用户没有提供明确 `taskId`，应先 `schedule_list` 定位目标。
- 不要把定时任务描述成“自带独立模型配置”；当前真实语义是跟随绑定会话运行。

---

## 当前边界

- 这套机制目前不是通用内置 MCP registry，逻辑集中在 `desktop-capability-query-options.js`。
- 具备桌面内置能力的会话会按同一规则注入 `allowedTools`；不再因为会话是否关联定时任务而做区别注入。
- `disallowedTools` 对 Claude Code 内建 `Cron*` 是硬编码短期策略。远期需要更细粒度地区分目标域，而不是一刀切禁用。
- 内置 MCP 工具与 UI IPC 共享底层 `ScheduledTaskService`，但不是同一入口；行为一致性主要靠服务层和测试保障。
- `im_send` 只负责发送本地已存在文件，不负责创建、下载或解析文档；文档理解仍由 Agent 自身文件/PDF能力完成。
- GitNexus 当前没有识别出这些工具为标准 MCP tool nodes，理解链路时需要直接看源码和测试。
- 微信通知状态文件保存 bot token 和 contextToken，属于敏感凭证；正式 UI 需要明确提示本地存储边界，后续可考虑迁移到系统凭据存储或加密存储。

待回头处理的问题：

- 定时任务执行时偶发出现 `Bash: 获取当前日期和时间` 这类无关工具调用/回复，怀疑与定时任务 MCP 注入、系统提示或工具选择策略有关。微信双向聊天阶段完成后，需要回到 `buildDesktopCapabilityQueryOptions()` 和定时任务执行链路排查：确认任务触发运行时的 MCP 注入、allowed/disallowedTools、prompt 约束和模型工具选择是否导致任务结果被 Bash 时间查询污染。

---

## 微信通知三阶段计划

### 阶段 1：主动通知发送

目标：让 Hydro Desktop 定时任务可向已授权微信目标主动推送结果。

- 内建 iLink HTTP 协议调用，不依赖 OpenClaw runtime 或 npm 包。
- 支持扫码登录，保存 `accountId`、`botToken`、`userId`。
- 支持通过后台轮询自动捕获已授权用户的 `userId/contextToken`，必要时也可手动补抓最新消息。
- 支持 `weixin_notify_list_targets` 和 `weixin_notify_send`。
- 桌面端入口位于“能力管理 → 微信通知”，用于目标用户扫码授权、管理目标和发送测试通知。
- 不做通讯录读取，不做任意好友发送，不做自动 AI 回复。

### 阶段 2：回信展示

目标：用户收到通知后可以回发消息，Hydro Desktop 能在桌面端显示。

- 已完成基础层：`WeixinNotifyService.start()` 会启动后台长轮询，轮询与手动捕获共用串行队列，避免并发调用 `getupdates`。
- 已完成基础层：轮询到入站消息后会发出 `message` / `messages` 服务事件，事件包含 `accountId`、`targetId`、`displayName`、`text`、`contextToken`、`createTimeMs` 和目标元数据。
- 已完成会话接入：将服务事件写入桌面 Agent 会话，`source === 'weixin'` 的用户气泡带微信来源标记。
- 已补齐 Notebook 会话接入：Notebook `ChatPanel` 也会监听并展示微信回流消息。
- 如果回信对应某次桌面主动发送的通知，将回信写入该通知所属 Agent 会话，显示在发送通知的聊天窗口内。
- 如果桌面端没有主动发过通知，但捕获到已绑定微信目标的新消息，可以创建一个新的 `source === 'weixin'` 会话并显示入站消息。
- 会话标题优先使用微信目标备注名，并保留 `accountId/targetId` 映射用于后续回复。
- 当前已允许微信回信触发 Agent 回复，并将 Agent 文本回复同步发送回微信端，交互模式与钉钉桥接保持一致。

基础存储约束：

- 底层按 `accountId + userId` 保留通道绑定，重复捕获同一个微信用户时不再物理删除旧绑定。
- UI 和 MCP 默认只展示 `preferred !== false` 且未 `deletedAt` 的首选目标，保持“一个用户一条可用目标”的体验。
- 新捕获的同一 `userId` 会成为首选目标，旧绑定标记为 `preferred=false` 和 `supersededAt`。
- 删除目标采用软删除：标记 `deletedAt` 且 `preferred=false`，为后续历史会话回流保留基础数据。

### 阶段 3：回信触发 Agent

目标：允许微信回信继续驱动指定 Agent 会话。

- 已建立微信目标与 Agent 会话映射：桌面主动发出的微信通知会记住 `sessionId -> target`，目标回信优先回到原会话；无上下文入站消息会新建微信会话。
- 已实现基础双向聊天：微信用户消息进入 LLM，LLM 回复会发回微信端；桌面端在微信会话中介入时，会将桌面输入和本轮 Agent 回复组成块回发微信。
- 已支持聊天工具栏快捷发微信：Agent 与 Notebook 对话面板都可直接选择目标发送，并建立当前会话绑定。
- 同一目标消息后续仍需要进一步串行化和错误反馈优化，避免高频消息与 Agent streaming 竞态。
- 权限、防骚扰、频率限制和审计仍未展开，当前仅依赖“已扫码授权 + 已捕获 contextToken”的发送边界。
- 明确区分“通知通道”和“外部 IM 会话桥接”：MCP 工具仍是主动通知入口，微信会话桥接由后台轮询和 `WeixinBridge` 负责。

### 阶段 4：微信图片与媒体附件

目标：补齐微信通知 / 微信会话侧高价值图文交互；微信侧语音、视频、普通文件暂缓，仅作为后续文件传输能力记录。

- 已实现微信图片双向：微信入站图片会经 iLink CDN 下载/解密为 `{ base64, mediaType }`，进入桌面气泡和 LLM 多模态输入；桌面介入图片、Agent 工具产出的本地图片路径会经 `getuploadurl`、CDN 上传和 `image_item` 回发微信。
- 当前个人微信链路的已落地媒体能力为“文本 + 图片”双向；语音、视频、普通文件仍未实现。
- 飞书、钉钉、企业微信三端的文档附件能力已在 IM 统一附件阶段单独实现，不属于本微信通知阶段。
- 后续如果要恢复微信侧媒体任务，应先复用 IM 附件模型，再适配微信 iLink 协议，避免把语音/视频/文件逻辑散落在桥接层。

---

## 测试覆盖

当前相关测试主要覆盖两类风险：

- `tests/main/desktop-capability-query-options.test.js`
  - 验证 `hydrodesktop` server 和 9 个工具被暴露
  - 验证工具 payload 序列化、任务定位、运行记录、立即执行和删除委托
  - 验证 `allowedTools` 名称、当前会话默认绑定语义，以及 embedded current-session 跟随语义
- `tests/main/agent-interactions.test.js`
  - 验证普通手动会话会注入定时任务 MCP 工具
  - 验证普通身份 prompt 注入与会话级 queryOptions 合并
- `tests/main/scheduled-task-service.test.js`
  - 验证任务不再持有独立模型/API 配置
  - 验证 embedded current-session 任务在 `/clear` / 新建会话后跟随新的当前会话
  - 验证 embedded app 无当前会话时任务会 `skipped`

---

## 后续重启任务时先确认

继续做新的内置 MCP 能力前，先回答这些问题：

1. 这个能力是否是用户日常高频会用的本地桌面能力？
2. AI 是否必须通过桌面端宿主才能可靠完成，而不是直接用现有文件、Shell、浏览器或普通 MCP？
3. 这个能力是否会带来真实闭环，例如减少 UI 操作、触发通知、管理长期任务、恢复上下文？
4. 是否需要修改用户持久配置？如果需要，是否有确认、回滚和审计记录？
5. 多个内置 MCP 共存时，`allowedTools` 和 `disallowedTools` 应该如何合并？

当前倾向：不要为了“内置”而继续扩展。只有当出现明确用户需求，再按同一套会话级注入机制或先抽象 registry 继续推进。
