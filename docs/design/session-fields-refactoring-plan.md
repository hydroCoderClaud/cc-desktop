# 会话属性字段重构方案

> 2026-05-26 | 版本 v1.7.74+

## 目标

消除 `type` / `source` 语义重叠，让每个字段职责单一、符合常识。

---

## 修改前后对比

### 字段

| 维度 | 现状（混乱） | 改为（清晰） |
|------|-------------|-------------|
| UI 展示形态 | `type = chat\|dingtalk\|weixin\|feishu\|enterprise-weixin\|notebook` | `type = chat\|notebook` |
| 创建来源 | `source = manual\|dingtalk\|weixin\|feishu\|scheduled\|enterprise-weixin` | `source = manual\|im-inbound` |
| IM 平台 | **与 type/source 混在一起** | `im_channel = dingtalk\|weixin\|feishu\|enterprise-weixin`（新增） |
| IM 用户 | `staff_id`（名称误导） | `im_user_id`（已有） |
| IM 聊天 | `conversation_id` + `im_channel_id`（后者命名错误，未发布） | `im_chat_id`（改名） |
| 定时任务 | `source = 'scheduled'` | 已有 `task_id` 字段，不占 source |
| 内嵌 App | `client_type` + `owner_client_id`（不改） | 保持不变 |

### 旧列处理

| 旧列 | 处理 |
|------|------|
| `staff_id` | 改为写入 `im_user_id`，旧列保留兼容 |
| `conversation_id` | 改为写入 `im_chat_id`，旧列保留兼容 |
| `im_channel_id`（未发布） | 删除，改为 `im_chat_id` |
| `im_channel` | 新增 |
| `source` | 值从 `dingtalk/weixin/feishu` 改为 `im-inbound` |

---

## 典型场景对照

| 场景 | 旧 (type/source) | 新 (type/source/im_channel) |
|------|-----------------|--------------------------|
| 用户点"新建会话" | chat / manual | chat / manual / null |
| 钉钉收到消息新建 | **dingtalk** / **dingtalk** | chat / im-inbound / dingtalk |
| 飞书收到消息新建 | **feishu** / **feishu** | chat / im-inbound / feishu |
| 用户新建后绑钉钉 | chat / **dingtalk**（改 source） | chat / manual / dingtalk（改 im_channel） |
| 定时任务新建 | chat / **scheduled** | chat / manual / null（task_id 标记） |
| Notebook | notebook / manual | notebook / manual / null |
| 内嵌 App | chat / manual（+ client_type） | 不变 |

---

## 受影响范围

### 1. 创建会话 — 传参

| 位置 | 旧 | 新 |
|------|-----|-----|
| `dingtalk-bridge.js:657` | `type: 'dingtalk', source: 'dingtalk'` | `type: 'chat', source: 'im-inbound', meta: { imChannel: 'dingtalk' }` |
| `weixin-bridge.js:390` | `type: 'weixin', source: 'weixin'` | `type: 'chat', source: 'im-inbound', meta: { imChannel: 'weixin' }` |
| `im-session-mapper.js:212` | `type: this._imType, source: this._imType` | `type: 'chat', source: 'im-inbound', meta: { imChannel: this._imType }` |
| `scheduled-task-service.js:670` | `type: 'chat', source: 'scheduled', taskId: ...` | `type: 'chat', source: 'manual', taskId: ...`（删 source） |

### 2. 绑定会话 — 不再改 source

| 位置 | 旧 | 新 |
|------|-----|-----|
| `agent-session-manager.js:1732` `bindSessionExternalImSource()` | 设 `session.source = 'dingtalk'` | 设 `session.imChannel = 'dingtalk'`（存 DB `im_channel` 列） |
| 各 Bridge 的 `bindSessionToTarget()` | 调 `bindSessionExternalImSource(sessionId, 'dingtalk')` | 调 `setSessionImChannel(sessionId, 'dingtalk')` |

### 3. 判断条件 — 消除双 OR

所有 `session.type === 'dingtalk' || session.source === 'dingtalk'` 改为 `session.imChannel === 'dingtalk'`：

| 位置 | 旧 | 新 |
|------|-----|-----|
| `agent-session-manager.js:1717` `assertSessionImBindingAllowed` | `session.type \|\| session.source` | `session.imChannel === normalizedChannel` |
| `dingtalk-commands.js:206` | `s.type === 'dingtalk' \|\| s.source === 'dingtalk'` | `s.imChannel === 'dingtalk'` |
| `feishu-bridge.js:1575` | `session.type === 'feishu' \|\| session.source === 'feishu'` | `session.imChannel === 'feishu'` |
| `enterprise-weixin-bridge.js:355` | `session.type === imType \|\| session.source === imType` | `session.imChannel === imType` |
| `im-session-mapper.js:136` | `row?.type \|\| row?.source` | `row?.im_channel === this._imType` |

### 4. DB 查询 — 查 im_channel 而非 type OR source

| 位置 | 旧 | 新 |
|------|-----|-----|
| `getImSessionsByType()` | `WHERE (type = ? OR source = ?)` | `WHERE im_channel = ?` |
| `getImSessionsByIdentity()` | 同上 | `WHERE im_channel = ?` |

### 5. 核心函数 — 删除或重写

| 函数 | 处理 |
|------|------|
| `resolveConversationSource()` | 删除（不再需要 type→source 强制同步） |
| `getConversationSource()` | 改为 `getSessionImChannel()` → 返回 `im_channel` |
| `isExternalImType()` | 改为 `isExternalImChannel()` → 判断 `im_channel` |
| `isExternalImSession()` | 改为 `isExternalImChannel(conv.imChannel)` |

### 6. 桌面介入/路由

| Bridge | 旧条件 | 新条件 |
|--------|--------|--------|
| 钉钉 | `source !== 'dingtalk' && (sessionType === 'dingtalk' \|\| hasBinding)` | `source !== 'im-inbound' && imChannel === 'dingtalk'` |
| 飞书 | 同上模式 | 同上 |
| 微信 | 同上模式 | 同上 |
| 企业微信 | 同上模式 | 同上 |

### 7. 定时任务 — 不再用 source

| 位置 | 旧 | 新 |
|------|-----|-----|
| `scheduled-task-service.js` | `source: 'scheduled'` | 删，靠 `task_id` 判断 |
| `desktop-capability-query-options.js:136` | `session.source !== 'scheduled'` | `!session.taskId` |
| `AgentLeftContent.vue:47` | `getConversationSource(conv) === 'scheduled'` | `!!conv.taskId` |

### 8. UI 层

| 位置 | 旧 | 新 |
|------|-----|-----|
| `AgentChatTab.vue` 观察模式 | `isExternalImType(sessionType)` | `isExternalImChannel(session.imChannel)` |
| `ChatInputToolbar.vue` 快捷发送按钮 | `sessionType \|\| sessionSource` | `session.imChannel` |
| `TabBar.vue` 图标 | `isExternalImType(sessionType)` | `isExternalImChannel(session.imChannel)` |
| `MessageBubble.vue` 发送者后缀 | `isExternalImType(message.source)` | `isExternalImChannel(message.imChannel)` |
| `useAgentPanel.js` 侧栏筛选 | `getConversationSource(conv)` | `getSessionImChannel(conv)` |

---

## 实施步骤

### 第一步：DB Schema

1. 新增 `im_channel TEXT`（迁移 `ALTER TABLE ADD COLUMN`）
2. 将 `im_channel_id` 重命名逻辑改为 `im_chat_id`（删除 `im_channel_id`，新增 `im_chat_id`）
3. 新增 `updateImChannel()` 方法（同时写旧 `source` + 新 `im_channel`）
4. 迁移更新 `updateImIdentity()` 写入 `im_chat_id`
5. 更新 `getImSessionsByType/ByIdentity` 查询条件改 `im_channel = ?`

### 第二步：Session 模型

1. `AgentSession` 加 `imChannel` 属性
2. `create()` 支持 `imChannel` 参数，写入 DB
3. `_serializeSession()` / `list()` 输出 `imChannel`

### 第三步：Bridge 改造（逐个）

1. DingTalk：`type: 'chat'`, `source: 'im-inbound'`, `imChannel: 'dingtalk'`
2. Feishu：同上
3. WeChat：同上
4. EnterpriseWeChat：同上
5. 所有判断条件从 `type \|\| source` 改为 `imChannel`

### 第四步：绑定流程

1. `bindSessionExternalImSource()` → 改为 `setSessionImChannel()` — 写 `im_channel` 而非 `source`
2. `assertSessionImBindingAllowed()` → 简化为检查 `imChannel` 冲突

### 第五步：核心函数清理

1. 删除 `resolveConversationSource()`
2. 重写 `getConversationSource()` / `getConversationIcon()` → 改为判断 `imChannel`
3. `isExternalImType()` → 改为 `isExternalImChannel()`

### 第六步：定时任务 & 内嵌 App & Notebook

1. 定时任务去掉 `source: 'scheduled'`，靠 `task_id` 筛选
2. 内嵌 App 不动
3. Notebook 不动

### 第七步：UI & 预载

1. 侧栏筛选改为 `imChannel`
2. 图标/标签/观察模式全部基于 `imChannel`
3. preload 传递 `imChannel` 字段

---

## 不改的

- `client_type` / `owner_client_id` / `clientMeta` — 内嵌 App 的归属机制，已正确
- `task_id` — 定时任务关联，已正确
- 个人微信（`weixin-notify-service`）— 暂不纳入
