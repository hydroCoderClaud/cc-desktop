# IM 全面重构设计文档

> 2026-06-03 | 重构目标版
>
> 重构范围：钉钉、飞书、企业微信、个人微信四端统一

---

## 一、重构目标

1. **四端统一字段模型** — `im_user_id` / `im_chat_id` / `im_chat_type` 语义一致
2. **四端统一命令菜单** — 去掉飞书卡片，全部用文本模式
3. **统一入站路由** — sessionMap → DB 全查 → 选择菜单
4. **统一出站发送** — 单聊/群聊一个方法，`targetType` 切换 API
5. **统一绑定签名** — 四端 `bindSessionToTarget` 参数一致
6. **删除冗余** — `_targetSessionMap`、`getCurrentBoundHistoryRow` merge 补丁
7. **微信纳入共享层** — 至少 `/help` `/status`
8. **DB 重命名** — `updateDingTalkMetadata` → `updateImIdentity`，新增 `im_chat_type` 列

---

## 二、改完之后长什么样

### 2.1 数据流

```
┌─────────────────────────────────────────────────────────┐
│                       入站                               │
│                                                         │
│  IM 消息 → Bridge._handleInbound({                      │
│              senderId, chatId, chatType, text, images    │
│            })                                            │
│              │                                           │
│              ├─ key = chatType==='group' ? chatId : senderId│
│              │                                           │
│              ├─ sessionMap[key] 命中? → 路由 ✅          │
│              │                                           │
│              └─ 未命中 → DB 全查 (不过滤 status)         │
│                   ├─ 0 条 → createSession → 绑定        │
│                   └─ ≥1 条 → 弹文本选择菜单              │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                       出站                               │
│                                                         │
│  桌面 Agent 消息 → Bridge._onDesktopMessage({           │
│                      sessionId, content, images          │
│                    })                                    │
│              │                                           │
│              ├─ _sessionIdentities[sessionId] 未绑定?    │
│              │    → 弹出工具栏                            │
│              │                                           │
│              └─ 已绑定 → targetType 判断:                │
│                   ├─ p2p → API.sendToUser(userId)        │
│                   └─ group → API.sendToChat(chatId)      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 sessionMap 生命周期

```
时刻                  sessionMap['ou_xxx']    _sessionIdentities[Session-A]
────────────────────────────────────────────────────────────────────────────
出站绑定后            = Session-A             { userId:'ou_xxx', type:'p2p' }
入站新建后            = Session-B             { userId:'ou_xxx', type:'p2p' }
用户从选择菜单恢复后  = Session-C             { userId:'ou_xxx', type:'p2p' }
桌面关闭会话后        (删除)                  (删除)
/new 执行后            (删旧→写新)            (删旧→写新)
重启后                (空)                    (空)
首次入站              (从选择菜单写入)        (写入)
```

### 2.3 命令菜单 (四端统一文本模式)

```
/help:
  📋 可用命令：
  /help    - 显示帮助
  /status  - 查看会话状态
  /close   - 关闭当前会话
  /new [目录] - 创建新会话
  /resume [编号] - 恢复会话
  /rename <名称> - 重命名会话

/status:
  当前会话状态：
  1. ✅ [2h前] Session-A (/project) 默认配置
  2. 🔵 [5min前] Session-B (/other) GPT-4

/close:
  ✅ 会话已关闭

/rename 新名称:
  ✅ 会话已重命名为：新名称

  (已选用 /resume 0 或 /new 或回复数字 0以外的选择，开始新会话)
  # 这里做用户选择

```

飞书不再有卡片按钮、`card.action.trigger` 事件处理、`_resolveCardCommand`、`buildCommandButton`。所有命令输出纯文本。

---

## 三、统一接口签名

### 3.1 入站处理 (每个 Bridge 实现)

```javascript
// 所有 Bridge 统一的入站消息结构
{
  senderId:   string,    // IM 用户 ID
  chatId:     string,    // 聊天 ID (p2p 时 = senderId)
  chatType:   string,    // 'p2p' | 'single' | 'group'
  chatName:   string,    // 聊天名称
  senderName: string,    // 用户名称
  text:       string,    // 消息文本
  images:     Array,     // [{ base64, mediaType }]
  reply:      Function,  // 回复方法: (text) => Promise<void>
}
```

### 3.2 出站发送 (统一签名)

```javascript
// 统一方法，所有 Bridge 实现
async sendToTarget({ sessionId, targetId, targetType, text, displayName })
  // targetType: 'user' | 'chat'
  // 单聊: targetId = userId
  // 群聊: targetId = chatId
```

各平台内部翻译：

```javascript
// DingTalk
body = targetType === 'chat'
  ? { chatIds: [targetId], ... }
  : { userIds: [targetId], ... }

// Feishu
receiveIdType = targetType === 'chat' ? 'chat_id' : 'open_id'
_api.sendTextMessage(receiveIdType, targetId, text)

// Enterprise Weixin
_wsClient.sendMessage(targetId, { ... })  // userId 和 chatId 共用第一个参数

// Weixin
weixinNotifyService.sendText({ targetId, ... })
```

### 3.3 绑定/解绑 (统一签名)

```javascript
// 绑定
async bindTarget(sessionId, { targetId, targetType, displayName })
  // targetType: 'user' | 'chat'
  // 写入 DB: im_user_id, im_chat_id, im_chat_type
  // 写入内存: sessionMap, _sessionIdentities

// 解绑
async unbindTarget(sessionId)

// 查询绑定
getBinding(sessionId) → { targetId, targetType, displayName } | null
```

### 3.4 工具栏联系人列表 (统一签名)

```javascript
// 返回统一结构
async listTargets() → [
  { targetId: 'ou_xxx', targetType: 'user', displayName: '张三' },
  { targetId: 'oc_123', targetType: 'chat', displayName: '项目群' },
]
```

### 3.5 命令分发 (四端共享)

```javascript
// dispatchImCommand 不变，handler 签名统一为:
async handleCommand({ command, args, sessionId, context, reply })
  // reply: (text) => Promise<void>  ← 统一的回复方法
  // 不再有卡片/卡片动作
```

---

## 四、各平台改动清单

### 4.1 飞书 (feishu-bridge.js) ~200行删 + 2个文件全删

```
删除文件 (清空 im-card-renderers/ 目录):
  - im-card-renderers/feishu-card-renderer.js  232行 — 4个card builder + 3个helper
  - im-card-renderers/plain-text-renderer.js     8行 — renderPlainText (未用)

feishu-bridge.js 中删除 (~200行):
  - import feishu-card-renderer (50-58行)
  - _bindEventClientEvents 中 cardAction 监听 (199,203,213行)
  - _unbindEventClientEvents 中 cardAction 解绑
  - _handleCardAction() 整个方法 (619-638行)
  - _resolveCardCommand() 整个方法 (1916-1946行)
  - _resolveHistoryChoiceContext() 整个方法
  - _findPendingMapKeyByChat() 辅助方法
  - 8个卡片wrapper: _buildHistoryChoiceCard _buildHelpCard _buildStatusCard
    _buildResultCard _buildCommandButton _attachCardContext
    _buildCardContextValue _chunkCardActions
  - _sendHelpMenu → 简化为纯文本 sendTextMessage
  - _sendStatusMenu → 简化为纯文本 sendTextMessage
  - _sendCloseResult → 简化为纯文本 sendTextMessage
  - _sendHistoryChoiceMenu → 简化为纯文本 sendTextMessage
  - _handleCommand 中 preservePendingSelection (cardValue.source 逻辑)
  - FEISHU_CARD_SESSION_LIMIT 常量

feishu-event-client.js 中删除 (~40行):
  - card.action.trigger 事件注册 (64-66行)
  - _handleCardAction() 整个方法 (169-195行)

feishu-message-api.js 中删除:
  - sendCardMessage() (220-232行, 12行)

测试更新: feishu-bridge.test.js 中 ~7个卡片测试删除

净减少: ~600行
```

### 4.2 钉钉 (dingtalk-bridge.js + dingtalk-commands.js)

```
移除:
  - _targetSessionMap (被 sessionMap 覆盖)
  - _sessionTargets (统一到 _sessionIdentities)
  - getCurrentBoundHistoryRow() 整个函数 (~30行)
  - mergeDingTalkHistoryRows() 整个函数 (~10行)
  - _cmdStatus 中的 inline query + mergeBound 逻辑 → 走 ImSessionMapper.queryHistorySessions
  - _cmdResume 中的 inline query + mergeBound 逻辑 → 走 ImSessionMapper.queryHistorySessions

简化:
  - _ensureSession → 接入 ImSessionMapper.ensureSession
  - _handleCommand → dispatchImCommand (已做)
  - _sendChoiceMenu → 统一 buildHistoryChoiceMenuText (已做)

新增:
  - bindTarget / unbindTarget / getBinding (统一签名)
  - sendToTarget (统一签名, 支持 chatIds)
  - listTargets 返回群列表
```

### 4.2 钉钉 (dingtalk-bridge.js + dingtalk-commands.js)

```
移除:
  - _targetSessionMap, getCurrentBoundHistoryRow, mergeDingTalkHistoryRows
  - _sessionTargets (统一到 _sessionIdentities)
  - _cmdStatus / _cmdResume 中的 inline query + merge 逻辑

简化:
  - _ensureSession → 统一 ImSessionMapper
  - _cmdStatus / _cmdResume → 走 ImSessionMapper._queryHistorySessions
  - 所有命令处理 → dispatchImCommand (统一)

新增:
  - bindTarget / unbindTarget / getBinding (统一签名)
  - sendToTarget (统一签名，支持 chatIds)
  - listTargets 返回群列表
  - 接入 ImSessionMapper
```

### 4.3 企业微信 (enterprise-weixin-bridge.js)

```
移除:
  - _targetSessionMap (已用 _sessionIdentities)
  - _proactiveRebindSuppressedKeys (sessionMap 覆盖)
  - _cmdStatus / _cmdResume 中的 inline merge

简化:
  - _handleCommand → 纯文本 (已是纯文本，去掉卡片预留)

新增:
  - bindTarget / unbindTarget / getBinding (统一签名)
  - sendToTarget (统一签名)
  - listTargets 返回群列表
```

### 4.4 个人微信 (weixin-bridge.js) — p2p only

微信不支持群聊。`im_chat_id` 永远为空，`im_chat_type` 永远 `p2p`。

```
新增:
  - /help /status 命令 (接入 dispatchImCommand)
  - bindTarget / unbindTarget / getBinding (统一签名)
  - sendToTarget (统一签名, 只走 p2p)
  - 接入 ImSessionMapper

不变:
  - listTargets 只列用户 (无群聊)
  - weixin-notify-service.js (底层通信不变)
  - accountId 多账号维度保持
```

---

## 五、共享层改动

### 5.1 ImSessionMapper

```
  + buildKey(identity) → 单聊=userId, 群聊=chatId
  + queryHistorySessions(identity) → 公共方法 (当前是 _ 私有)
```

### 5.2 DB (agent-db.js)

```
  重命名: updateDingTalkMetadata → updateImIdentity
  新增列: im_chat_type TEXT
  getImSessionsByType: ✅ 已修复 (conversationId 空时跳过 im_chat_id)
```

### 5.3 IPC (im-bridge-handlers.js)

```
标准通道 (不变):
  {prefix}:getStatus / start / stop / restart / setEnabled / updateConfig

统一新增 (四端相同):
  {prefix}:listTargets     → listTargets()
  {prefix}:bindTarget      → bindTarget(sessionId, { targetId, targetType, displayName })
  {prefix}:unbindTarget    → unbindTarget(sessionId)
  {prefix}:getBinding      → getBinding(sessionId) → { targetId, targetType, displayName } | null
  {prefix}:sendToTarget    → sendToTarget({ sessionId, targetId, targetType, text })

统一参数名 (去平台别名):
  前端传: targetId   (不再有 staffId / openId / userId / targetId 四套名字)
  后端用: targetId
  targetType: 'user' | 'chat'  (单聊vs群聊)

微信特殊:
  微信需要 accountId (多账号), bindTarget 额外接受 accountId 参数
```

### 5.4 删除文件

```
  im-card-renderers/feishu-card-renderer.js  (232行)
  im-card-renderers/plain-text-renderer.js    (8行)
  → 整个 im-card-renderers/ 目录清空
```

---

## 六、Before vs After

### 数据结构

```
Before:                          After:
  sessionMap                       sessionMap
  _sessionIdentities               _sessionIdentities
  _targetSessionMap  ← 删          (统一到 sessionMap)
  _sessionTargets    ← 删          (统一到 _sessionIdentities)
  _sessionWebhooks                 _sessionWebhooks
  _pendingChoices                  _pendingChoices
  _desktopPendingBlocks            保留
  _processQueues                   保留
  responseCollectors               保留
```

### 入站路由

```
Before:                          After:
  1. sessionMap 命中?               1. sessionMap 命中? → 路由
  2. _targetSessionMap?            2. 未命中 → DB 全查
  3. _findBoundSession?                  0条 → 新建
  4. DB query + mergeBound               ≥1条 → 文本选择菜单
  5. 选择菜单                             status 仅用于图标
```

### 命令菜单

```
Before:                          After:
  钉钉: 纯文本                     四端: 纯文本
  飞书: 卡片 → 文本fallback       飞书: 纯文本 (卡片全删)
  企业微信: 纯文本                 企业微信: 纯文本
  微信: 无                         微信: 纯文本 (新增)
```

### 绑定签名

```
Before:                          After:
  dingtalk: bind({staffId})        bind({ targetId, targetType })
  feishu:   bind({openId})          ↑ targetType: 'user' | 'chat'
  wecom:    bind({userId})
  weixin:   bind({accountId, targetId})
```

### 飞书 bridge 行数变化

```
Before:  1962行                    After:  ~1350行
  - 卡片系统 ~200行
  - 卡片渲染器 ~240行
  - 事件处理 ~40行
  (-600行)
```

---

## 六、重构批次

### 第一批: DB + 共享层 (基础设施)

```
  1. 新增 im_chat_type 列
  2. updateDingTalkMetadata → updateImIdentity
  3. ImSessionMapper.buildKey 改 key 格式
  4. ImSessionMapper._queryHistorySessions → 公共 queryHistorySessions
  5. getImSessionsByType ✅ 不变
```

### 第二批: 统一接口 + 三端改造

```
  6. 统一 bindTarget / unbindTarget / getBinding
  7. 统一 sendToTarget
  8. 统一 listTargets
  9. 删除 _targetSessionMap
  10. 钉钉接入 ImSessionMapper
  11. 飞书去掉卡片系统
  12. 企业微信清理
```

### 第三批: 微信 + group support

```
  13. 微信接入共享命令层
  14. 工具栏支持群列表
  15. 群聊绑定和发送
```

---

## 七、不做什么

```
- 不改 _pendingChoices 选择菜单机制
- 不改流式回复管道 (replyCollector / webhook)
- 不改图片管线
- 不删 staff_id/conversation_id 旧列 (长期渐进)
```

---

## 八、测试策略

```
飞书卡片去掉后: 飞书和钉钉的 /status /resume /help 输出完全一致
                 → 一份测试覆盖四端
统一签名后:     mock 一个 Bridge → 覆盖所有 bind/send/list 路径
                 → 不需要每个平台写一遍测试
```
