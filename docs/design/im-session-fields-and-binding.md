# IM 会话字段定义与绑定模型

> 2026-06-03 | 讨论结论版
> 
> 参与平台：钉钉、飞书、企业微信、个人微信

---

## 一、字段定义

| 字段 | 含义 | 单聊 | 群聊 |
|------|------|:--:|:--:|
| `im_channel` | 平台标识 | `feishu` / `dingtalk` / `enterprise-weixin` / `weixin` | 同 |
| `im_user_id` | 对端用户 ID | 发送者/绑定目标 | 记录首条消息发送者 |
| `im_chat_id` | 聊天 ID | **空** | 群 chatId |
| `im_chat_type` | 聊天类型 | `p2p` / `single` | `group` |

### 单聊 `im_chat_id` 为空的原因

| 平台 | 单聊 chatId | 理由 |
|------|------|------|
| 飞书 | `chat_id = open_id` | 冗余，等于 im_user_id |
| 企业微信 | `chatid = userid` | 同上 |
| 钉钉 | 拿不到 | 必须等用户发消息才知道 |
| 微信 | 不支持群聊 | p2p only，始终为空 |
| 微信 | — | 待确认 |

---

## 二、sessionMap 规则

```
key 格式:
  单聊: userId              // "ou_xxx"
  群聊: chatId              // "oc_group123"

value: sessionId

sessionMap 是"当前活跃会话"的权威内存索引:
  - 出站绑定时写入
  - 入站新建时写入
  - 用户从选择菜单恢复时写入
  - 桌面关闭时删除
  - /new 时旧 key 删除、新 key 写入
  - 重启后清空，首次入站从 DB 按需重建
```

不需要 `_targetSessionMap`——它只是 sessionMap 没写时的补偿，sessionMap 绑定时就写就能删掉它。

---

## 三、_sessionIdentities 规则

```
桌面 → IM 方向的路由表

单聊: { userId, chatType:'p2p' }
群聊: { chatId, chatType:'group' }

用途: 桌面端用户在 Agent 聊天区发消息，Bridge 据此决定往哪个 IM 目标发送
     单聊 → API 传 userId
     群聊 → API 传 chatId
```

---

## 四、绑定场景

### 4.1 出站绑定（桌面 → IM）

```
桌面创建会话 → 工具栏选择目标 → 发送成功 → 绑定

  单聊 (用户 ou_xxx):
    内存:
      sessionMap['ou_xxx'] = Session-A
      _sessionIdentities[Session-A] = { userId:'ou_xxx', chatType:'p2p' }
    DB:
      im_user_id='ou_xxx', im_chat_id='', im_chat_type='p2p'

  群聊 (群 oc_123):
    内存:
      sessionMap['oc_123'] = Session-B
      _sessionIdentities[Session-B] = { chatId:'oc_123', chatType:'group' }
    DB:
      im_user_id='', im_chat_id='oc_123', im_chat_type='group'
```

### 4.2 入站新建（IM → 桌面）

```
IM 用户发消息 → 入站 → 查不到现有会话 → 新建

  单聊:
    内存:
      sessionMap['ou_xxx'] = Session-C
      _sessionIdentities[Session-C] = { userId:'ou_xxx', chatType:'p2p' }
    DB:
      im_user_id='ou_xxx', im_chat_id='', im_chat_type='p2p'

  群聊:
    内存:
      sessionMap['oc_123'] = Session-D
      _sessionIdentities[Session-D] = { chatId:'oc_123', chatType:'group' }
    DB:
      im_user_id='ou_xxx', im_chat_id='oc_123', im_chat_type='group'
      (im_user_id 存首条消息发送者，纯记录)
```

### 4.3 入站路由（已有会话）

```
入站消息 → key (单聊=userId, 群聊=chatId)

  1. sessionMap[key] 命中 → 路由到该会话 ✅

  2. sessionMap 未命中 → 查 DB (全部，不过滤 status):

     → 0 条: 新建会话 (4.2)
     → ≥1 条: 弹选择菜单，用户决定

  status 仅用于前端图标标记 (idle/streaming/closed)
  永远不自动选择，永远交给用户决定
```

---

## 五、出站发送模型

```
桌面 Agent 会话 → 用户发消息 → Bridge

  已绑定 (_sessionIdentities 有记录):
    chatType === 'p2p'  → API 传 userId
    chatType === 'group'→ API 传 chatId

  未绑定:
    弹出工具栏 → 选择目标 → 发送 → 绑定 (4.1)
```

### 各平台 API 适配

| | 单聊 | 群聊 |
|------|------|------|
| 钉钉 | `{ userIds: [userId] }` | `{ chatIds: [chatId] }` |
| 飞书 | `sendTextMessage('open_id', userId)` | `sendTextMessage('chat_id', chatId)` |
| 企业微信 | `sendMessage(userId)` | `sendMessage(chatId)` |
| 个人微信 | `sendText({ targetId: userId })` | 待确认 |

---

## 六、DB 查询

```sql
-- 单聊: 只用 im_user_id
SELECT * FROM agent_conversations
WHERE im_channel = ? AND im_user_id = ?
ORDER BY updated_at DESC

-- 群聊: 用 im_chat_id
SELECT * FROM agent_conversations
WHERE im_channel = ? AND im_chat_id = ?
ORDER BY updated_at DESC
```

`getImSessionsByType` 已实现：`conversationId` 为空时跳过 `im_chat_id` 过滤。

---

## 七、清理规则

| 事件 | sessionMap | _sessionIdentities | DB |
|------|:--:|:--:|:--:|
| 桌面关闭会话 | 删除 key | 删除 | status='closed' |
| `/new` | 删旧 key、写新 key | 删旧、写新 | 旧行 status 不变 |
| 重启 | 全部清空 | 全部清空 | 不变 |
| Bridge stop | 全部清空 | 全部清空 | 不变 |

---

## 八、可以实现的内容

| 项目 | 涉及文件 |
|------|------|
| sessionMap key 格式统一 (单聊=userId, 群聊=chatId) | 所有 Bridge + ImSessionMapper |
| 绑定时写 sessionMap (当前飞书/钉钉漏写) | feishu-bridge, dingtalk-bridge |
| 删除 `_targetSessionMap` (sessionMap 已覆盖其职责) | 所有 Bridge |
| `_sessionIdentities` 格式统一 (群聊不加 userId) | 所有 Bridge |
| 入站路由统一: sessionMap → DB 全查 → 选择菜单 | 所有 Bridge |
| 群聊 key=chatId (同一群不同用户进同一会话) | feishu-bridge, dingtalk-bridge, enterprise-weixin-bridge |
| 新增 `im_chat_type` 列 | agent-db.js, session-database.js |
| `sendTextToTarget` 支持群聊 (chatId 参数) | 所有 Bridge IPC handler |
| `_cmdStatus` / `_cmdResume` 统一走 DB 查询 (去掉 mergeBound 补丁) | dingtalk-commands.js |
| `updateDingTalkMetadata` → `updateImIdentity` | agent-db.js + 所有调用点 |

---

## 九、微信并入方案

微信 Bridge (`weixin-bridge.js`) p2p only，不支持群聊。`im_chat_id` 永远为空，`im_chat_type` 永远为 `p2p`。

接入共享层 `ImSessionMapper` 即可跟随统一模型。`listTargets` 只列用户，`sendToTarget` 只走 p2p 路径。消息路由逻辑与其他三端 p2p 一致。

## 十、不做什么

- 不删除 `staff_id` / `conversation_id` 旧列（渐进迁移，先双写）
- 不改变 `_pendingChoices` 机制（选择菜单逻辑不变）
- 群聊出站绑定期不设 `im_user_id`（等入站消息自然会更新）
