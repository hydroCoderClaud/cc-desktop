# 钉钉与微信桥接复用评估

> Hydro Desktop v1.7.56+ | 目标：评估 `DingTalkBridge` 与 `WeixinBridge` 是否应进行部分复用整合

本文只评估“如何复用”，不直接推动代码重构。结论优先服务于后续低风险迁移，而不是追求一次性抽象到位。

---

## 当前结论

- 现在已经到了可以做“部分复用整合”的阶段。
- 复用重点应放在“外部 IM 会话桥接的共性行为”，而不是协议层。
- 不建议抽象成一个统一的 `IMBridgeBase` 大基类。
- 更适合的方向是：
  - 提取主进程共享 helper
  - 提取前端共享的 external IM 适配层
  - 保留钉钉、微信各自独立的 transport / auth / config 实现

换句话说：当前最合理的目标不是“钉钉和微信合并成一个模块”，而是“把已经重复的桥接行为收敛成几块稳定公共件”。

---

## 现状判断

### 已经明显同构的部分

#### 1. 会话来源与 UI 语义

钉钉和微信都已经进入相同的桌面对话体系：

- `src/main/agent-session-manager.js`
  - `resolveConversationSource()` 已并列识别 `dingtalk` / `weixin`
- `src/renderer/composables/useAgentPanel.js`
  - 左侧筛选已并列支持 `dingtalk` / `weixin`
- `src/renderer/pages/main/components/agent/AgentLeftContent.vue`
  - 会话图标和来源判断已并列分支
- `src/renderer/pages/main/components/AgentChatTab.vue`
  - 观察模式提示条对两者已是同类结构
- `src/renderer/pages/main/components/MainContent.vue`
  - 会话创建后都走“自动切到 Agent 模式并打开 tab”

这说明前端“外部 IM 会话”语义已经成立，只是现在仍然以两套条件分支散落在多个文件中。

#### 2. 入站消息 -> 会话 -> 前端显示

钉钉和微信都已经具备相同的高层链路：

```text
外部 IM 消息
  -> 主进程 bridge 解析
  -> 创建/定位 Agent 会话
  -> 写入 user message
  -> 通知前端补气泡
  -> 会话继续由 Agent 接管
```

对应实现：

- `src/main/managers/dingtalk-bridge.js`
- `src/main/managers/weixin-bridge.js`
- `src/renderer/composables/useAgentChat.js`

前端监听器目前已经高度相似：

- `setupDingTalkListeners()`
- `setupWeixinListeners()`

除了事件名和字段名小差异，本质上都在做“把外部 IM 的用户消息转成桌面 user bubble”。

#### 3. Agent 回复回推外部 IM

两边都已经形成相同的桥接闭环：

- 监听 `userMessage / agentMessage / agentResult / agentError`
- 收集 Agent 输出
- 将桌面介入和 Agent 回复回推到外部 IM

也就是说，“桥接器作为 AgentSessionManager 事件消费者”的模式已经同构。

---

## 不同构的部分

### 1. 连接与传输模型不同

钉钉：

- `dingtalk-stream-sdk-nodejs`
- WebSocket/stream 长连接
- 有连接状态、断线重连、watchdog、消息 ACK、命令入口

微信：

- `WeixinNotifyService` 基于 iLink HTTP + `getupdates` 轮询
- 登录依赖扫码授权
- 目标依赖 `contextToken`
- 发送依赖 `accountId + targetId + contextToken`

这两套 transport 没有抽象价值。强行统一只会增加条件分支和隐藏协议差异。

### 2. 会话绑定模型不同

钉钉天然有：

- `staffId`
- `conversationId`
- 机器人命令上下文
- 群聊 / 单聊分支

微信天然有：

- `accountId`
- `targetId`
- `contextToken`
- “扫码授权用户”与“被捕获目标”概念

所以两边的 session key、身份模型、重连语义不一样，不应尝试用一个统一身份对象替掉。

### 3. 管理界面与用户操作不同

钉钉是开放平台配置型能力。  
微信是扫码授权 + 目标捕获型能力。

配置界面、目标管理、运维动作完全不同，UI 管理入口不应该合并。

---

## 推荐复用边界

### A. 前端：抽象 “外部 IM 会话适配”

目标：去掉多个文件中的 `if (type === 'dingtalk') ... if (type === 'weixin') ...`。

建议新增一个轻量元数据模块，例如：

- `src/shared/external-im-meta.js`

建议提供：

- `isExternalImSession(type)`
- `getExternalImIcon(type)`
- `getExternalImLabel(type, locale)`
- `getExternalImObserveText(type, locale)`
- `getExternalImMessageSource(type)`

首批替换点：

- `src/renderer/composables/useAgentPanel.js`
- `src/renderer/pages/main/components/agent/AgentLeftContent.vue`
- `src/renderer/pages/main/components/AgentChatTab.vue`
- `src/renderer/pages/main/components/TabBar.vue`
- `src/main/agent-session-manager.js`

这一步收益高、风险低，而且不会碰协议逻辑。

### B. 前端：抽象 “外部 IM 消息注入”

目标：统一 `useAgentChat` 中钉钉/微信的前端监听与消息组装。

建议新增 composable/helper，例如：

- `src/renderer/composables/external-im-message-adapter.js`

职责：

- 把 `onDingTalkMessageReceived` / `onWeixinMessageReceived` 归一到同一格式
- 统一组装 message bubble 所需字段：
  - `id`
  - `role`
  - `content`
  - `timestamp`
  - `source`
  - `senderNick`
  - `images`

注意这里是“显示层归一化”，不是要统一主进程事件协议。

### C. 主进程：提取桥接共享 helper

目标：不动 transport，实现 bridge 行为复用。

更适合抽 helper，而不是抽父类。建议拆成几块：

#### 1. Session bridge helper

例如：

- `src/main/managers/external-im-session-bridge.js`

候选能力：

- 创建/恢复外部 IM 会话标题
- 统一发送前端 `sessionCreated`
- 统一计算 `cwdSubDir`
- 统一会话 source/type 元数据写入

#### 2. Agent reply collector helper

例如：

- `src/main/managers/external-im-reply-collector.js`

候选能力：

- 从 Agent message 中抽取 text block
- 收集 image path
- 管理 pending reply state
- 统一处理 `agentResult / agentError` 收尾

`WeixinBridge` 和 `DingTalkBridge` 都有这部分行为，只是最终发送渠道不同。

#### 3. Frontend notify helper

例如：

- `src/main/managers/external-im-frontend-notify.js`

候选能力：

- 向 renderer 发送 `sessionCreated`
- 向 renderer 发送 `messageReceived`
- 做 `mainWindow?.webContents?.send()` 的统一封装

这样可以避免两个 bridge 各自维护近似重复的 `_notifyFrontend` 和事件 payload 结构。

---

## 不推荐的方案

### 1. 不要抽统一 `IMBridgeBase`

原因：

- 钉钉和微信生命周期差异太大
- 钉钉有连接管理、命令处理、choice menu
- 微信有 session binding、known target、pre-capture 衍生语义

一旦抽父类，子类会不断覆写钩子，最后变成“抽象层比业务层更难懂”。

### 2. 不要统一主进程事件名

不要现在就把：

- `dingtalk:messageReceived`
- `weixin:messageReceived`

改成一个完全统一的 IPC 通道。

原因：

- 现有前端已经稳定依赖这两个事件
- 贸然统一会放大变更面

更稳妥的做法是：先在前端 listener 适配层统一消费，再决定是否需要改主进程事件协议。

### 3. 不要合并配置入口

钉钉设置和微信通知设置的交互模型不一样，强合并只会造成配置页复杂化。

---

## 分阶段迁移建议

### 阶段 0：只做元数据统一

范围：

- 外部 IM 类型判断
- 图标、标签、观察模式文案
- 左侧列表 / tab / chat bar 的来源判断

特点：

- 纯 UI / 轻主进程常量整理
- 不动桥接协议
- 回归成本最低

这是最适合先落地的第一步。

### 阶段 1：统一前端消息注入适配

范围：

- `useAgentChat` 中钉钉/微信监听归一
- `MainContent` 中 session created 打开 tab 的模式归一

产出：

- `registerExternalImListeners(sessionId, handlers, adapters)`
- 或者一个更小的 helper 集合

这一步完成后，前端就会从“按渠道分支”转向“按适配器分发”。

### 阶段 2：提取主进程 bridge helper

范围：

- `WeixinBridge` 与 `DingTalkBridge` 中真正重复的桥接逻辑
- 不碰 transport

要求：

- 必须只抽低耦合 helper
- 每抽一块都要有对应测试兜底

### 阶段 3：评估是否继续收敛事件协议

这一步不是默认要做的，只在前两步完成后再判断。

若届时发现：

- 前端仍有大量协议适配噪音
- 主进程事件 payload 已经基本一致

才考虑统一更高层的 event envelope。

---

## 风险判断

### 低风险区

- 图标、来源元数据、观察模式 UI
- 前端会话类型判断
- 前端消息注入 helper

### 中风险区

- `MainContent` 的自动开 tab 逻辑
- `useAgentChat` 的监听器整合

### 高风险区

- `DingTalkBridge` 主流程重构
- `WeixinBridge` 的会话绑定 / 回推队列重构
- 任意尝试统一 transport 层

因此迁移顺序必须从 UI 和适配层开始，而不是从主进程 bridge 核心逻辑开始。

---

## 最终建议

当前建议是：

1. 当前不主动推进钉钉 / 微信复用重构。
2. 继续按实际需求分别增强钉钉或微信能力。
3. 当后续再次出现钉钉 / 微信增强需求时，先重新审视是否已出现重复修改，再提醒是否进入“阶段 0 轻量复用”。
4. 只有当两端连续出现同类改动，或结构重复开始明显拖累开发时，才启动复用整合。

这条路线的核心原则是：

- 先统一“表现层和适配层”
- 再统一“桥接行为层”
- 永远不要统一“协议层”

这样能最大化复用收益，同时把回归风险控制在可验证范围内。

---

## 直接对应的代码锚点

适合阶段 0 / 1 优先处理的文件：

- `src/main/agent-session-manager.js`
- `src/renderer/composables/useAgentPanel.js`
- `src/renderer/composables/useAgentChat.js`
- `src/renderer/pages/main/components/AgentChatTab.vue`
- `src/renderer/pages/main/components/MainContent.vue`
- `src/renderer/pages/main/components/TabBar.vue`
- `src/renderer/pages/main/components/agent/AgentLeftContent.vue`

适合阶段 2 再考虑的文件：

- `src/main/managers/dingtalk-bridge.js`
- `src/main/managers/weixin-bridge.js`

明确不应合并的文件：

- `src/main/managers/weixin-notify-service.js`
- `src/main/managers/dingtalk-image.js`
- `src/main/managers/dingtalk-commands.js`
- `src/main/ipc-handlers/dingtalk-handlers.js`
- `src/main/ipc-handlers/weixin-notify-handlers.js`

---

## 决策记录

- 决策时间：2026-04-28
- 当前决定：暂不主动做钉钉 / 微信复用重构。
- 触发条件：后续如果再次做钉钉或微信增强，先提醒是否已经进入“值得做轻量复用”的阶段。
- 默认策略：需求优先，重构滞后；只有在真实重复修改已经出现时，才启动复用整合。
