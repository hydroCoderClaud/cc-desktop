# IM Bridge 架构文档

> 最后更新：2026-06-08
> 本文档描述当前已落地的 IM 架构，不再保留中间迁移方案。

## 一、架构结论

当前 IM 主链路已经完成三端统一，并将个人微信纳入单聊版统一模型：

- 钉钉
- 飞书
- 企业微信
- 微信（单聊版）

这里的“统一”指的是业务判断依据与用户可见现象统一，包括：

1. 入站首次建会话
2. 桌面主动发送后的绑定
3. 后续 IM 入站回到当前绑定会话
4. `/status`
5. `/resume`
6. `/new`
7. `/close`
8. 解绑防复活
9. 桌面介入回传

允许保留的平台差异，仅限于 transport / SDK / 平台能力层。

---

## 二、分层结构

```text
Renderer / Toolbar / Settings
  -> IPC
Bridge (DingTalk / Feishu / Enterprise Weixin / Weixin)
  -> Shared Command Layer
  -> Shared Runtime Binding Layer
  -> Shared Session Mapping Layer
  -> AgentSessionManager
  -> SessionDatabase
```

### 2.1 共享命令层

当前四端共同复用的命令与流程模块：

- `src/main/managers/im-command-executor.js`
- `src/main/managers/im-command-policy.js`
- `src/main/managers/im-command-presenter.js`
- `src/main/managers/im-session-command-flow.js`
- `src/main/managers/im-session-decision.js`
- `src/main/managers/im-resume-post-action.js`

这些模块共同负责：

1. 命令分发
2. 历史列表渲染
3. `/resume` / `/new` / `/close` / `/rename`
4. 当前会话与历史会话选择
5. resume 后是否需要自动激活 / 自动 hello

### 2.2 共享会话映射层

核心文件：

- `src/main/managers/im-session-mapper.js`

当前职责：

1. 统一 IM 身份 key 构造
2. 统一历史会话查询
3. 统一 IM 入站创建会话
4. 统一历史选择恢复
5. 统一回写 IM 身份字段

### 2.3 共享运行态绑定层

核心文件：

- `src/main/managers/im-binding-runtime.js`
- `src/main/managers/im-binding-policy.js`

其中：

- `im-binding-policy.js` 负责“数据库身份语义”
- `im-binding-runtime.js` 负责“运行时目标占有关系”

---

## 三、统一的数据模型

### 3.1 会话对象

IM 入站创建的会话统一为：

```js
{
  type: 'chat',
  source: 'im-inbound',
  imChannel: 'dingtalk' | 'feishu' | 'enterprise-weixin' | 'weixin'
}
```

说明：

1. `type` 不再承载渠道语义
2. `source` 不是 IM 路由主依据
3. 渠道识别统一使用 `imChannel`

### 3.2 数据库 IM 身份

当前统一身份模型：

```text
im_channel
im_user_id
im_chat_id
im_chat_type
```

单聊：

```text
im_user_id = userId
im_chat_id = ''
```

群聊：

```text
im_user_id = ''
im_chat_id = chatId
```

旧字段 `staff_id`、`conversation_id` 不再作为当前设计的一部分。

---

## 四、当前主路径

### 4.1 入站消息

当前钉钉、飞书、企业微信、个人微信的标准判断顺序已经统一为：

1. 先看 `sessionMap` 是否有当前聊天上下文映射
2. 没有则看当前 runtime target 绑定是否指向某个桌面会话
3. 仍没有则查询数据库历史
4. 有历史则进入选择菜单
5. 无历史则新建会话

### 4.2 桌面主动发送

当前四端在“桌面主动发送成功后绑定”的主语义上统一遵循：

1. 一个桌面会话同一时刻只拥有一个当前 IM 目标
2. 若当前会话已绑定 A，不能继续直接发送给 B
3. 若要联系另一个 IM 目标，应新建桌面会话
4. 绑定成功后，后续该 IM 目标回复应回到当前绑定会话

### 4.3 历史列表状态标记

当前 `/status` 历史菜单中的标记含义：

- `✅` 当前映射会话
- `🔵` 已激活但不是当前映射
- `⭕` 历史存在但当前未激活

这一定义已经用于钉钉、飞书、企业微信、个人微信。

---

## 五、三端当前实现状态

### 5.1 飞书

核心文件：

- `src/main/managers/feishu-bridge.js`

当前状态：

1. 使用共享命令层
2. 使用共享 `ImSessionMapper`
3. 使用共享 runtime binding helper
4. 主命令结果已经改为文本 / Markdown 风格输出
5. 不再以交互卡片作为主命令模式

保留差异：

1. 飞书按需恢复绑定，不做启动时全量 `_restoreSessionBindings()`
2. 文本发送仍通过飞书消息 API 自身实现

### 5.2 企业微信

核心文件：

- `src/main/managers/enterprise-weixin-bridge.js`

当前状态：

1. 使用共享命令层
2. 使用共享 `ImSessionMapper`
3. 使用共享 runtime binding helper
4. `/status`、`/resume`、主动绑定、解绑、桌面介入都已对齐三端语义
5. 保留企业微信原生流式 `replyStream` 能力

保留差异：

1. 启动时做 `_restoreSessionBindings()`
2. 主动联系人列表依赖 `wecom-cli`
3. 群名展示可使用本地 alias / known chat 名称

### 5.3 钉钉

核心文件：

- `src/main/managers/dingtalk-bridge.js`
- `src/main/managers/dingtalk-commands.js`

当前状态：

1. 已接入共享命令层
2. 已接入共享 `ImSessionMapper`
3. 已接入共享 runtime binding helper
4. 单聊 / 群聊的绑定、关闭后恢复、主动发送后入站复用，已与飞书/企微对齐

保留差异：

1. 仍保留钉钉平台侧 callback / webhook 编排
2. 仍保留部分钉钉特有运行态辅助，如 `_runtimeProactiveTargetMap`
3. 群聊发现与主动目标管理仍有钉钉平台特有代码

这些差异是当前刻意保守的边界，不代表业务现象不一致。

### 5.4 微信

核心文件：

- `src/main/managers/weixin-bridge.js`
- `src/main/managers/weixin-notify-service.js`

当前状态：

1. 已接入共享 `ImSessionMapper`
2. 已接入共享命令分发，覆盖 `/help`、`/status`、`/new`、`/resume`、`/close`、`/rename`
3. 单聊身份已统一为 `im_channel='weixin' + im_user_id=targetId + im_chat_id='' + im_chat_type='p2p'`
4. 关闭后再次入站、历史选择、恢复后激活/回放，已按共享语义接入
5. 主动发送成功后再绑定的语义保持不变

保留差异：

1. 仅纳入个人微信单聊模型，不补微信群聊
2. 目标发现仍依赖扫码授权与首条入站捕获
3. 主动发送仍依赖 `contextToken`，上下文过期后需要对方再次入站激活

---

## 六、当前不成立的旧说法

以下旧说法都已经失效：

1. “飞书命令主模式是交互卡片”
2. “仍需要旧字段双写兼容”
3. “`type` 可以表示钉钉/飞书/企微渠道”
4. “`_targetSessionMap` 可以删掉”
5. “钉钉尚未接入共享会话映射主链路”

---

## 七、用户可见的一致性目标

这轮重构真正完成的是：

1. 单聊 / 群聊不会再依赖 `type` 混乱判断
2. 关闭当前会话后，不再静默串到错误会话
3. 桌面主动绑定后，后续 IM 回复可按当前绑定复用
4. `/resume` 对激活态与当前映射态的提示语义一致
5. 解绑后不会因为旧 runtime map 或旧 DB 关系错误复活
6. 桌面介入只回当前绑定的 IM 目标

---

## 八、仍可继续演进但不影响本轮完成度的事项

以下属于后续可选优化，而不是当前重构未完成：

1. 继续减少钉钉平台侧专有编排
2. 是否继续把个人微信向更深的共享 runtime helper 收敛
3. 更完整的 HTML/Markdown 文档生成流程
4. 更细粒度的群 alias 编辑体验

这些不影响当前“重构目标已达成”的结论。
