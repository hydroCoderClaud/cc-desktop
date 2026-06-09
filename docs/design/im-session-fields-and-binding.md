# IM 会话字段与绑定模型

> 最后更新：2026-06-08
> 适用范围：钉钉、飞书、企业微信、个人微信
> 本文档描述当前代码事实，不再记录中间迁移方案。

---

## 一、当前结论

本轮 IM 重构后的核心约束如下：

1. 会话层判定 IM 渠道，使用 `imChannel` 与数据库 IM 身份字段，不再使用 `type` 判断渠道。
2. IM 入站创建的 Agent 会话统一为 `type: 'chat'`、`source: 'im-inbound'`。
3. 数据库中的 IM 身份以 `im_channel + im_user_id + im_chat_id + im_chat_type` 为唯一权威模型。
4. `staff_id`、`conversation_id` 视为已移除的旧字段，本轮重构不再依赖，也不再做兼容性设计。
5. `source` 仅表示“会话创建来源”，不是 IM 路由依据，也不是渠道字段。

---

## 二、会话字段语义

### 2.1 内存 / 会话对象字段

| 字段 | 当前语义 |
|------|------|
| `type` | 会话 UI 类型。当前 IM 会话统一为 `chat`，不再出现 `dingtalk` / `feishu` / `enterprise-weixin` 这类渠道名 |
| `source` | 创建来源。当前 IM 入站创建统一写 `im-inbound` |
| `imChannel` | 当前绑定的 IM 渠道标识，例如 `dingtalk` / `feishu` / `enterprise-weixin` / `weixin` |
| `meta` | 渠道附加运行信息。`meta.source` 不再作为 IM 路由主语义 |

### 2.2 数据库字段

| 字段 | 当前语义 |
|------|------|
| `im_channel` | 渠道标识 |
| `im_user_id` | 单聊目标用户 ID；群聊固定为空串 |
| `im_chat_id` | 群聊目标 chat ID；单聊固定为空串 |
| `im_chat_type` | 聊天类型。单聊常见为 `p2p` / `single`，群聊常见为 `chat` / `group` |

---

## 三、单聊与群聊的持久化语义

### 3.1 单聊

单聊统一落库为：

```text
im_channel   = 渠道
im_user_id   = 对端用户 ID
im_chat_id   = ''
im_chat_type = 'p2p' 或 'single'
```

这代表“单聊身份只按用户维度识别”，与当前 `ImSessionMapper.buildKey(...)` 的单聊 key 规则一致。

### 3.2 群聊

群聊统一落库为：

```text
im_channel   = 渠道
im_user_id   = ''
im_chat_id   = 群 chatId
im_chat_type = 'chat' 或 'group'
```

这代表“群聊身份只按群维度识别”，不会再把群聊主身份落在发送人上。

### 3.3 各渠道说明

| 渠道 | 单聊 chatType | 群聊 chatType | 备注 |
|------|------|------|------|
| 钉钉 | `p2p` | `chat` / `group` | 群目标发送与恢复按群维度 |
| 飞书 | `p2p` | `chat` | 群会话标题优先用群名 |
| 企业微信 | `single` | `group` | 主动发送与入站恢复均按统一模型 |
| 微信 | `p2p` | 不支持 | 已按单聊版统一模型接入共享会话与命令语义 |

---

## 四、运行态绑定模型

### 4.1 共享运行态结构

当前四端主链路共用以下运行态概念：

| 结构 | 含义 |
|------|------|
| `sessionMap` | IM 身份 key -> 当前会话 sessionId。用于“当前聊天上下文”入站路由 |
| `_sessionTargets` | sessionId -> 当前桌面会话绑定的出站目标 |
| `_targetSessionMap` | targetId -> 当前拥有该目标的桌面会话 |
| `_sessionIdentities` | sessionId -> 最近一次入站身份/回复身份 |

其中：

- `sessionMap` 解决“这条入站消息该进哪个当前会话”
- `_sessionTargets` / `_targetSessionMap` 解决“桌面主动发送绑定后，后续入站如何回到该会话”

这两类结构职责不同，当前代码中都保留，`_targetSessionMap` 不是冗余补丁。

### 4.2 共享运行态 helper

`src/main/managers/im-binding-runtime.js` 已成为当前主路径，负责：

1. 注册新的 runtime target 绑定
2. 清理 session -> target 绑定
3. 清理 target -> session 反向绑定
4. 保证“一个 session 只绑定一个目标”和“一个目标只归一个 session”

---

## 五、ImSessionMapper 的当前职责

`src/main/managers/im-session-mapper.js` 是三端共享的 IM 会话映射核心，当前职责如下：

1. `buildKey(identity)`
   - 群聊使用 `chatId`
   - 单聊使用 `userId`
2. `ensureSession(identity)`
   - 先查 `sessionMap`
   - 未命中则查数据库历史
   - 仍无结果则创建新会话
3. `createSession(identity)`
   - 创建 `type: 'chat'`
   - 写入 `source: 'im-inbound'`
   - 写入 `imChannel`
   - 同时调用 `updateImIdentity(...)` 持久化 IM 身份
4. `handleChoice(...)`
   - 处理历史会话数字选择
   - 恢复后回写统一 IM 身份字段

---

## 六、source 的当前作用

### 6.1 会话层

`source` 当前只表达“这条会话最初是怎么创建的”，例如：

- `manual`
- `im-inbound`

### 6.2 不再承担的职责

`source` 当前不再承担以下职责：

1. 不表示 IM 渠道
2. 不参与单聊 / 群聊判断
3. 不作为历史匹配主键
4. 不作为桌面回传目标依据

因此，判断 IM 历史、当前绑定、恢复目标时，应始终看：

- 会话对象：`imChannel`
- 数据库：`im_channel / im_user_id / im_chat_id / im_chat_type`

---

## 七、关闭、解绑、恢复时的规则

### 7.1 关闭当前会话

关闭时会清理当前聊天映射，并将会话标记为 `closed`。后续同一 IM 目标再次入站时：

1. 如果存在当前 runtime 绑定并允许静默接管，则回当前绑定会话
2. 否则进入历史选择 / 新建逻辑

当前钉钉、飞书、企业微信、个人微信都以这个现象目标对齐。

### 7.2 解绑

解绑的目标是“解除桌面主动发送目标所有权”，并防止被旧绑定静默复活。解绑后：

1. 工具栏图标恢复未绑定状态
2. 当前会话不再拥有该 IM target
3. 该 target 不应继续被 status / resume 误认为当前绑定

### 7.3 恢复历史会话

恢复历史会话时会重新写入统一 IM 身份字段。这不是旧字段兼容，而是因为：

1. 同一历史会话可能重新被绑定到当前聊天上下文
2. 当前聊天身份需要覆盖到这条已恢复会话

---

## 八、当前接受的平台差异

以下属于当前接受的实现差异，不视为字段模型不统一：

1. 飞书不做启动时全量 `_restoreSessionBindings()`，按需恢复即可
2. 企业微信保留启动时 `_restoreSessionBindings()`
3. 钉钉保留少量平台侧 runtime 编排，例如主动绑定补偿与 callback 特性
4. 微信仅纳入单聊统一模型，不补群聊、组织联系人发现和稳定上下文保活能力

这些差异不影响统一的字段语义与用户可见现象。

---

## 九、明确不再采用的旧结论

以下说法在当前代码中都已经不成立：

1. “群聊 `im_user_id` 记录首条发送人”
2. “`_targetSessionMap` 可以删除”
3. “仍需保留 `staff_id` / `conversation_id` 双写兼容”
4. “`source` 可以继续承载渠道或调度语义”
5. “`type` 可以等于钉钉/飞书/企业微信渠道名”

如需判断当前真实模型，请以本文档和相关代码为准。
