# IM Bridge 架构重构文档

> v1.7.74+ | 重构时间：2026-05-26

## 一、重构背景

项目原有三个 IM 桥接（钉钉、飞书、个人微信），总代码量约 4000+ 行，存在两个核心问题：

### 1.1 大量代码重复

- 钉钉 (1568 行) 和飞书 (2197 行) 约 **80% 的方法逻辑相同**
- 飞书开发时提取了三个共享 Helper 类（ImSessionMapper、ImReplyCollector、ImFrontendNotifier），但钉钉从未回迁使用
- `_extractImagePaths` / `_normalizePath` 在三个 Bridge 中逐字复制
- ChatInputToolbar.vue 中三个 IM 的快速发送 UI 各自重复约 200 行

### 1.2 SDK 使用不规范

| 模块 | 严重程度 | 问题 |
|------|---------|------|
| FeishuMessageAPI | 严重 | 完全绕过 SDK，10 个 REST 端点全部用 `globalThis.fetch()` 手写 |
| DingTalk | 中等 | DWClient 用法正确，但 REST API 调用绕过 SDK 用原始 HTTP |
| 个人微信 | N/A | 使用 `ilinkai.weixin.qq.com` 内部 API，非官方公开 API |

### 1.3 平台协议研究

| | 钉钉 | 飞书 | 企业微信 | 个人微信 |
|---|---|---|---|---|
| **SDK** | `dingtalk-stream-sdk-nodejs` | `@larksuiteoapi/node-sdk` | `@wecom/aibot-node-sdk` | 无官方 SDK |
| **连接** | WebSocket Stream | WebSocket 长连接 (protobuf) | WebSocket 长连接 | HTTP 长轮询 |
| **认证** | appKey + appSecret | appId + appSecret | botId + secret | QR 码登录 |
| **回复通道** | sessionWebhook URL（一次性 HTTP POST） | REST API `im.message.create` | WebSocket `aibot_respond_msg`（支持流式） | `ilinkai` 自定义 API |

**结论**：三家平台各自独立协议，无统一标准。BaseImBridge 抽象的是*我们自己的代码模式*，不强行统一底层协议。

---

## 二、重构目标

1. **SDK 规范化**：飞书和钉钉的 API 调用改为使用官方 SDK 方法
2. **架构整合**：提取 BaseImBridge 抽象类，消除 80% 的重复代码
3. **企业微信接入**：作为新 Channel，使用 `@wecom/aibot-node-sdk`
4. **DB Schema 清理**：统一 IM 身份列命名和方法

---

## 三、重构范围

### 完成项 (v1.7.74)

| 步骤 | 内容 | 文件变更 |
|------|------|---------|
| 1a | FeishuMessageAPI SDK 重写 | -209 行 |
| 1b | DingTalk Token 规范化 | +10 行 |
| 2 | im-utils.js 共享提取 | +91 行 |
| 3a | DingTalk 前端通知器迁移 | -7 行 |
| 5 | 企业微信 Bridge 完整接入 | +517 行 |
| 6 | DB Schema 统一 | +43 行 |
| 7 | IPC 处理器统一 | +78 行 |
| — | 企业微信设置页面 | +300 行 |

### 延后项

| 步骤 | 原因 |
|------|------|
| 3b/3c 回复收集器/会话映射器回迁 | DingTalk webhook 管道与共享 Helper 差异大，需真实 IM 测试环境 |
| Step 4 BaseImBridge | 依赖 Step 3 完成 |
| ImQuickSendPanel UI 抽取 | 依赖 BaseImBridge |
| 个人微信重构 | 商榷中 |

---

## 四、SDK 规范化详情

### 4.1 FeishuMessageAPI

**问题**：`@larksuiteoapi/node-sdk` 的 `Client` 类已提供所有 REST API 封装（Token 管理、自动刷新、错误处理），但 `feishu-message-api.js` 完全未使用，全部用 `globalThis.fetch()` 手写。

**修改**：引入 SDK `Client`，替换所有手写调用：

| 手写 (globalThis.fetch) | SDK 方法 |
|---|---|
| POST `/auth/v3/app_access_token/internal` | `Client` 自动管理 |
| POST `/im/v1/messages` | `client.im.v1.message.create()` |
| GET `/im/v1/messages/{id}` | `client.im.v1.message.get()` |
| POST `/contact/v3/users/batch_get` | `client.contact.v3.user.batchGetId()` |
| GET `/contact/v3/users/find_by_dept` | `client.contact.v3.user.list()` |
| POST `/im/v1/images` | `client.im.v1.image.create()` |
| GET `/im/v1/messages/{id}/resources/{key}` | `client.im.v1.messageResource.get()` |
| POST `/im/v1/messages/{id}/reply` | `client.im.v1.message.reply()` |
| POST `/im/v1/messages` (card) | `client.im.v1.message.create()` |
| POST `/im/v1/messages` (image) | `client.im.v1.message.create()` |

保留 `_appId`/`_appSecret` 属性以兼容调用方的凭据状态检查（`_resolveFeishuDisplayNames` 中 `hasFeishuCredentials`）。

### 4.2 DingTalk API

**发现**：`dingtalk-stream-sdk-nodejs` 仅提供 Stream WebSocket 通信（DWClient），不封装 REST API。手动 `globalThis.fetch()` 是正确的做法。

**修改**：Token 获取增强错误处理——中文错误提示、缺失字段检测。标注旧 OA 端点（`oapi.dingtalk.com`）为待迁移。

### 4.3 企业微信 SDK

`@wecom/aibot-node-sdk` v1.0.7 的 `WSClient` 统一了：
- 连接管理 (`connect`/`disconnect`/`isConnected`)
- 消息接收 (`.on('message', callback)`)
- 流式回复 (`replyStream(msgId)` — 返回 stream 对象，支持 `write()`/`finish()`)
- 主动推送 (`sendMessage(chatId, type, content)`)
- 媒体上传 (`uploadMedia(buffer)`)

---

## 五、共享代码架构

### 5.1 im-utils.js

提取三个 Bridge 中逐字相同的工具函数：

```javascript
// 图片路径提取
extractImagePaths(obj, depth = 0)  → string[]
normalizePath(rawPath)              → string   // MSYS → Windows

// 时间格式化
formatRelativeTime(timestamp)       → string   // "3分钟前"

// 常量
IMAGE_EXTENSIONS  = /\.(png|jpg|jpeg|gif|webp|bmp)$/i
IMAGE_MAX_SIZE    = 20 * 1024 * 1024
IMAGE_PATH_MAX_DEPTH = 10
```

引用方：`feishu-bridge.js`、`dingtalk-image.js`、`weixin-bridge.js`

### 5.2 共享 Helper 使用状态

| Helper | 飞书 | 钉钉 | 企业微信 | 个人微信 |
|--------|------|------|---------|---------|
| ImFrontendNotifier | ✅ | ✅ 本次迁移 | ✅ | ❌ 内联 |
| ImReplyCollector | ✅ | ❌ 内联 | ✅ | ❌ 内联 |
| ImSessionMapper | ✅ | ❌ 内联 | ✅ | ❌ 内联 |
| im-utils.js | ✅ | ✅ | ❌ | ✅ |

### 5.3 im-bridge-handlers.js

通用 IPC 处理器工厂，为任何 IM Bridge 注册 6 个标准通道：

```javascript
setupImBridgeHandlers(ipcMain, bridge, configManager, prefix)

// 自动注册:
//   {prefix}:getStatus
//   {prefix}:start
//   {prefix}:stop
//   {prefix}:restart
//   {prefix}:updateConfig
//   {prefix}:sendText
```

企业微信 handler 已使用，钉钉/飞书/微信 handler 留待后续迁移。

---

## 六、企业微信接入详情

### 6.1 Bridge 架构

```
EnterpriseWeixinBridge
├── WSClient (@wecom/aibot-node-sdk)
│   ├── .on('message') → _handleMessage()
│   ├── .on('event')   → 卡片/进入会话事件
│   ├── .on('error')   → 错误通知
│   ├── .on('connected') / .on('disconnected')
│   ├── replyStream()  → 流式回复
│   └── sendMessage()  → 主动推送
├── ImFrontendNotifier  → 前端事件
├── ImReplyCollector    → Agent 回复收集
├── ImSessionMapper     → 会话管理
└── _bindAgentEvents()  → Agent 事件监听
```

### 6.2 消息处理流程

```
企业微信消息 → WSClient.on('message')
  → 去重 (_processedMsgIds)
  → 提取文本 (text/mixed)
  → ImSessionMapper.ensureSession()
     ├── 内存中有 → 恢复
     ├── 有绑定 → 复用
     ├── 有历史 → 发送选择菜单
     └── 无历史 → 创建新会话
  → ImReplyCollector.startCollect()
  → sendMessage() → Agent
  → Agent 流式输出 → replyStream().write()
  → Agent 完成 → replyStream().finish()
```

### 6.3 与钉钉/飞书的关键区别

| | 钉钉 | 飞书 | 企业微信 |
|---|---|---|---|
| 回复通道 | sessionWebhook URL | REST API | 同一条 WebSocket |
| 流式回复 | markdown 分段 POST | 逐条 sendMessage | 原生 `replyStream` |
| 主动推送 | batchSend API | createMessage API | `sendMessage` WS 命令 |

企业微信的架构比钉钉/飞书更简洁——收发同一通道，无需管理 webhook 或独立 API 客户端。

### 6.4 文件清单

```
src/main/managers/
  enterprise-weixin-bridge.js          ← 核心 Bridge (~290 行)

src/main/ipc-handlers/
  enterprise-weixin-handlers.js        ← IPC 处理器 (使用共享工厂)
  im-bridge-handlers.js                ← 通用处理器工厂

src/renderer/pages/
  enterprise-weixin-settings/
    ├── index.html
    ├── main.js
    ├── App.vue
    └── components/
        └── EnterpriseWeixinSettingsContent.vue  ← 设置表单

  channel-settings/components/
    EmbeddedEnterpriseWeixinSettings.vue         ← 嵌入式包装

src/shared/
  external-im-meta.js                  ← 新增 enterprise-weixin 条目

src/preload/
  preload.js                           ← 新增 11 个 API + 4 个事件监听器
```

---

## 七、DB Schema 变更

### 7.1 新增列

```sql
ALTER TABLE agent_conversations ADD COLUMN im_user_id TEXT;
ALTER TABLE agent_conversations ADD COLUMN im_channel_id TEXT;
```

旧列 `staff_id` / `conversation_id` 保留不删，向后兼容。

### 7.2 新增方法

```javascript
// 统一写入 — 同时写新旧两套列
updateImIdentity(sessionId, userId, channelId)

// 统一查询 — 查新列优先，旧列兜底，过滤 closed 状态
getImSessionsByIdentity(imType, userId, channelId, limit)
```

### 7.3 旧方法状态

| 方法 | 状态 |
|------|------|
| `updateDingTalkMetadata()` | @deprecated，内部已同时写入新列 |
| `getDingTalkSessions()` | @deprecated |
| `getImSessionsByType()` | 已更新为查询新列 + 过滤 `status != 'closed'` |

### 7.4 迁移策略

使用已有的 `ALTER TABLE ADD COLUMN` 模式（参考 `session-database.js`），`IF NOT EXISTS` 守卫。新旧方法共存一个版本，平滑过渡。

---

## 八、重构后的文件总览

```
src/main/managers/
├── base-im-bridge.js              ⏸️ 延后
├── im-utils.js                    ✅ 新建 (91行)
├── im-session-mapper.js           ✅ 已有 (422行)
├── im-reply-collector.js          ✅ 已有 (264行)
├── im-frontend-notifier.js        ✅ 已有 (72行)
├── dingtalk-bridge.js             ✅ 部分重构 (1568行)
├── dingtalk-commands.js           — 未动 (384行)
├── dingtalk-image.js              ✅ 引用 im-utils (222行)
├── feishu-bridge.js               ✅ 引用 im-utils (2197行)
├── feishu-event-client.js         — 未动，SDK 合规 (377行)
├── feishu-message-api.js          ✅ SDK 重写 (250行)
├── weixin-bridge.js               ✅ 引用 im-utils + 持久化绑定 (591行)
├── weixin-notify-service.js       — 未动，个人微信 (1121行)
└── enterprise-weixin-bridge.js    ✅ 新建 (290行)

src/main/ipc-handlers/
├── im-bridge-handlers.js          ✅ 新建 (78行)
├── dingtalk-handlers.js           — 未动
├── feishu-handlers.js             — 未动
├── weixin-notify-handlers.js      — 未动
└── enterprise-weixin-handlers.js  ✅ 新建 (15行)

src/renderer/pages/
├── channel-settings/
│   └── EmbeddedEnterpriseWeixinSettings.vue ✅ 新建
├── enterprise-weixin-settings/              ✅ 新建 (5个文件)
├── dingtalk-settings/                       — 未动
└── feishu-settings/                         — 未动

src/shared/
└── external-im-meta.js         ✅ 新增 enterprise-weixin

src/main/database/
├── agent-db.js                 ✅ 新增 im_user_id/channel_id 列 + 方法
└── session-database.js         ✅ 新增列迁移
```

---

## 九、当前渠道能力矩阵

| 能力 | 钉钉 | 飞书 | 企业微信 | 个人微信 |
|------|------|------|---------|---------|
| 入站消息 | ✅ Stream | ✅ 长连接 | ✅ 长连接 | ✅ 轮询 |
| 回复消息 | ✅ webhook | ✅ REST | ✅ WS 流式 | ✅ ilink |
| 主动推送 | ✅ batchSend | ✅ REST | ✅ WS | ✅ ilink |
| 图片收发 | ✅ | ✅ | ✅ | ✅ |
| 交互卡片 | ❌ | ✅ | ✅ (template_card) | ❌ |
| 命令系统 | ✅ | ✅ | ✅ | ❌ |
| 会话历史 | ✅ | ✅ | ✅ | ❌ |
| 桌面介入 | ✅ | ✅ | ✅ | ✅ |
| 快速发送 | ✅ | ✅ | 待 UI 整合 | ✅ |
| 目标绑定 | ✅ | ✅ | ✅ | ✅ |
| DB 持久化 | ✅ | ✅ | ✅ | ✅ (本次补齐) |
| SDK 合规 | 部分 | ✅ | ✅ | N/A |

---

## 十、验证

- 单元测试：663 个，76 个测试文件，全部通过
- 冒烟测试：钉钉/飞书收发正常（用户验证）
- 企业微信：待真实环境验证
- CI：GitHub Actions Linux runner 通过
