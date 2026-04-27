# 钉钉远程命令系统计划

> 历史预研/设计稿：本文创建于 2026-02-22。其部分思路已被当前钉钉桥接实现吸收，但**本文不是现行实现说明**；实际行为请以代码和 `docs/design/integrations.md` 为准。
>
> 当前实现只落地了 `/help`、`/status`、`/sessions`、`/new`、`/resume`、`/rename`、`/close`。文中的 `/config`、`/model`、`/restart`、`/export` 等仍停留在历史设想阶段。

## 一、目标

在钉钉桥接中增加**命令拦截层**，以 `/` 前缀的消息作为系统命令处理，不进入 Agent 对话。实现通过钉钉远程管理 Hydro Desktop：查看状态、管理会话、切换配置等。

## 二、现状分析

### 当前消息流

```
钉钉消息 → _handleDingTalkMessage() → _ensureSession() → _processOneMessage() → Agent 对话
```

所有文本消息无差别地发给 Agent。已有的拦截机制只有 `_pendingChoices`（等待用户选择历史会话）。

### 改造后消息流

```
钉钉消息 → _handleDingTalkMessage()
              ↓
          以 / 开头？
           ├─ 是 → _handleCommand() → 执行命令 → _replyToDingTalk() 返回结果
           └─ 否 → 现有逻辑不变 → _ensureSession() → Agent 对话
```

## 三、技术评估

| 维度 | 评价 |
|------|------|
| **复杂度** | 低 |
| **新增代码** | ~150 行 |
| **改动现有代码** | ~5 行（加一个 if 判断） |
| **改动文件** | 仅 `dingtalk-bridge.js` |
| **风险** | 极低，纯新增逻辑，不影响现有对话 |
| **实现时间** | P0 命令半天，全部 1-2 天 |

### 可行性依据

1. **拦截点清晰**：`_handleDingTalkMessage()` 行 233-241，文本提取后、`_ensureSession` 前
2. **回复通道现成**：`sessionWebhook` + `_replyToDingTalk()` 已可用
3. **manager 全部现成**：configManager、agentSessionManager、pluginManager 等均可直接调用
4. **已有参考模式**：`_pendingChoices` 拦截机制证明此模式可行

## 四、拦截位置

在 `dingtalk-bridge.js` 的 `_handleDingTalkMessage()` 方法中，文本消息解析完成后、进入 `_ensureSession` 之前插入：

```js
// 现有代码（行 233-241）：文本消息解析
} else {
  const userText = text?.content?.trim()
  if (!userText) return
  agentMessage = userText
  displayText = userText
}

// ▼ 新增：命令拦截 ▼
if (typeof agentMessage === 'string' && agentMessage.startsWith('/')) {
  await this._handleCommand(agentMessage, sessionWebhook, {
    robotCode, senderStaffId, senderNick, conversationId, conversationType
  })
  return  // 命令已处理，不进入 Agent 对话
}

// 现有代码继续：_ensureSession → _processOneMessage
```

## 五、命令体系

### P0 — 核心命令（首批实现）

| 命令 | 功能 | 数据来源 |
|------|------|---------|
| `/help` | 显示可用命令列表 | 命令注册表 |
| `/status` | 系统状态（连接、会话数、版本、当前配置） | agentSessionManager + configManager |
| `/sessions` | 当前活跃会话列表（含状态） | agentSessionManager |
| `/close [序号\|ID]` | 关闭指定会话 | agentSessionManager |
| `/new` | 新建空会话（自动分配目录） | agentSessionManager |
| `/dir <name>` | 新建会话并指定工作目录名 | agentSessionManager（整合"独立工作目录"计划） |

### P1 — 配置管理

| 命令 | 功能 | 数据来源 |
|------|------|---------|
| `/config` | 查看当前 API 配置概要 | configManager |
| `/config list` | 列出所有 API 配置 | configManager |
| `/config switch <name>` | 切换默认 API 配置 | configManager |
| `/model <tier>` | 历史设想：切换模型级别（当前实现未落地） | configManager |
| `/mcp list` | 列出 MCP 服务及状态 | capabilityManager |
| `/skills list` | 列出已安装 Skills | pluginManager |
| `/agents list` | 列出已安装 Agents | pluginManager |

### P2 — 高级操作

| 命令 | 功能 | 数据来源 |
|------|------|---------|
| `/restart` | 重启钉钉桥接 | self (DingTalkBridge) |
| `/export [序号\|ID]` | 导出会话记录为文本 | sessionDatabase |
| `/log [n]` | 查看最近 n 条系统日志 | 日志文件 |
| `/cwd [序号\|ID]` | 查看指定会话的工作目录 | agentSessionManager |

## 六、架构设计

### 命令注册表

```js
// 在 constructor 中初始化
this._commands = new Map([
  ['help',     { handler: this._cmdHelp,     desc: '显示命令列表',      admin: false }],
  ['status',   { handler: this._cmdStatus,   desc: '系统状态',          admin: false }],
  ['sessions', { handler: this._cmdSessions, desc: '活跃会话列表',      admin: false }],
  ['close',    { handler: this._cmdClose,    desc: '关闭会话',          admin: true  }],
  ['new',      { handler: this._cmdNew,      desc: '新建会话',          admin: false }],
  ['dir',      { handler: this._cmdDir,      desc: '指定目录新建会话',   admin: false }],
  ['config',   { handler: this._cmdConfig,   desc: '配置管理',          admin: true  }],
  ['model',    { handler: this._cmdModel,    desc: '切换模型',          admin: true  }],
  ['mcp',      { handler: this._cmdMcp,      desc: 'MCP 管理',         admin: true  }],
  ['skills',   { handler: this._cmdSkills,   desc: 'Skills 管理',      admin: true  }],
  ['agents',   { handler: this._cmdAgents,   desc: 'Agents 管理',      admin: true  }],
  ['restart',  { handler: this._cmdRestart,  desc: '重启桥接',          admin: true  }],
  ['export',   { handler: this._cmdExport,   desc: '导出会话',          admin: false }],
])
```

### 命令分发器

```js
async _handleCommand(text, webhook, context) {
  const parts = text.substring(1).split(/\s+/)  // 去掉 / ，按空格拆分
  const cmd = parts[0].toLowerCase()
  const args = parts.slice(1)

  const entry = this._commands.get(cmd)
  if (!entry) {
    await this._replyToDingTalk(webhook,
      `❓ 未知命令: /${cmd}\n输入 /help 查看可用命令`)
    return
  }

  // 权限检查
  if (entry.admin && !this._isAdmin(context.senderStaffId)) {
    await this._replyToDingTalk(webhook, '🔒 该命令需要管理员权限')
    return
  }

  try {
    const result = await entry.handler.call(this, args, context)
    await this._replyToDingTalk(webhook, result)
  } catch (err) {
    console.error(`[DingTalk] Command /${cmd} failed:`, err)
    await this._replyToDingTalk(webhook, `❌ 命令执行失败: ${err.message}`)
  }
}
```

### 权限控制

```js
_isAdmin(senderStaffId) {
  const admins = this.configManager.get('dingtalk.adminStaffIds') || []
  // 空列表 = 不限制（向后兼容，默认所有人可用）
  return admins.length === 0 || admins.includes(senderStaffId)
}
```

配置位置：`dingtalk.adminStaffIds: string[]`，在钉钉设置页可配。

## 七、命令处理器参考实现

### /help

```js
_cmdHelp() {
  const lines = ['📋 可用命令：', '']
  for (const [name, { desc }] of this._commands) {
    lines.push(`  /${name} — ${desc}`)
  }
  lines.push('', '💬 不带 / 前缀的消息将发送给当前 Agent 会话')
  return lines.join('\n')
}
```

### /status

```js
_cmdStatus() {
  const sessions = this.agentSessionManager.getAllSessions()
  const active = sessions.filter(s => s.status === 'streaming').length
  const idle = sessions.filter(s => s.status === 'idle').length
  const profiles = this.configManager.get('apiProfiles') || []
  const defaultId = this.configManager.get('defaultProfileId')
  const current = profiles.find(p => p.id === defaultId)

  return [
    '📊 系统状态',
    `├─ 钉钉桥接: ✅ 已连接`,
    `├─ 当前配置: ${current?.name || '未配置'}`,
    `├─ 活跃会话: ${active} 个执行中 / ${idle} 个空闲`,
    `└─ 总会话数: ${sessions.length} 个`
  ].join('\n')
}
```

### /sessions

```js
_cmdSessions() {
  const sessions = this.agentSessionManager.getAllSessions()
  if (sessions.length === 0) return '📭 暂无活跃会话'

  const lines = ['📋 活跃会话：', '']
  sessions.forEach((s, i) => {
    const icon = s.status === 'streaming' ? '🔄' : '💤'
    const dir = s.cwd ? path.basename(s.cwd) : '-'
    lines.push(`${i + 1}. ${icon} ${s.title || s.id.substring(0, 8)}`)
    lines.push(`   状态: ${s.status} | 目录: ${dir}`)
  })
  lines.push('', '使用 /close <序号> 关闭会话')
  return lines.join('\n')
}
```

### /config

```js
_cmdConfig(args) {
  const sub = args[0]

  if (!sub || sub === 'list') {
    const profiles = this.configManager.get('apiProfiles') || []
    const defaultId = this.configManager.get('defaultProfileId')
    if (profiles.length === 0) return '⚙️ 暂无 API 配置'

    const lines = ['⚙️ API 配置列表：', '']
    profiles.forEach((p, i) => {
      const marker = p.id === defaultId ? ' ✅ 当前' : ''
      lines.push(`${i + 1}. ${p.name}${marker}`)
    })
    lines.push('', '使用 /config switch <名称> 切换')
    return lines.join('\n')
  }

  if (sub === 'switch') {
    const name = args.slice(1).join(' ')
    if (!name) return '用法: /config switch <配置名称>'
    const profiles = this.configManager.get('apiProfiles') || []
    const target = profiles.find(p => p.name === name)
    if (!target) return `❌ 未找到配置: ${name}`
    this.configManager.set('defaultProfileId', target.id)
    return `✅ 已切换到: ${target.name}`
  }

  return '用法: /config [list|switch <名称>]'
}
```

### /dir

```js
async _cmdDir(args, context) {
  const dirName = args.join(' ').trim()
  if (!dirName) return '用法: /dir <目录名称>\n示例: /dir my-project'

  const { senderStaffId, senderNick, conversationId, conversationType } = context
  const mapKey = `${senderStaffId}:${conversationId || 'default'}`
  const baseDir = this.agentSessionManager._getOutputBaseDir()
  const cwd = path.join(baseDir, dirName)

  // 创建目录
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true })
  }

  // 创建会话
  const session = this.agentSessionManager.create({
    type: 'dingtalk',
    title: `钉钉 · ${dirName} · ${senderNick || senderStaffId}`,
    cwd,
    dingtalk: { staffId: senderStaffId, conversationId }
  })

  this.sessionMap.set(mapKey, session.id)
  return `✅ 已创建会话\n├─ 目录: ${dirName}\n└─ 路径: ${cwd}`
}
```

## 八、回复格式规范

统一使用 emoji 前缀，钉钉纯文本消息可读性好：

| 场景 | 格式 |
|------|------|
| 成功 | `✅ 操作描述` |
| 失败 | `❌ 错误信息` |
| 状态 | `📊` 图标 + 树形结构 (`├─` / `└─`) |
| 列表 | `📋` 图标 + 编号列表 |
| 配置 | `⚙️` 图标 |
| 帮助 | `📋` 图标 + 缩进命令列表 |
| 权限 | `🔒 该命令需要管理员权限` |
| 未知 | `❓ 未知命令` |
| 等待 | `⏳ 进行中` |

## 九、安全设计

### 权限分级

| 级别 | 命令 | 说明 |
|------|------|------|
| **所有人** | `/help`, `/status`, `/sessions`, `/new`, `/dir`, `/export` | 查看和创建操作 |
| **管理员** | `/config`, `/model`, `/close`, `/restart`, `/mcp`, `/skills`, `/agents` | 修改配置和管理操作 |

### 配置项

```json
{
  "dingtalk": {
    "adminStaffIds": ["staff_id_1", "staff_id_2"],
    // 空数组 = 不限制（默认，向后兼容）
  }
}
```

## 十、与已有计划的关系

| 计划 | 关系 |
|------|------|
| **钉钉会话独立工作目录** | `/dir` 命令直接实现该计划的核心功能 |
| **Web 管理面板** | 钉钉命令 = 文字版管理面板，两者互补而非替代 |
| **Linux 无头部署** | 有了钉钉命令，简单管理不依赖 Web 面板 |
| **商业化** | 高级命令（P1/P2）可作为 Pro 功能 |

## 十一、实施步骤

### 第一步：基础框架 + P0 命令（半天）

1. 在 `_handleDingTalkMessage()` 中加入命令拦截判断（~5 行）
2. 新增 `_handleCommand()` 命令分发器
3. 新增 `_commands` 注册表
4. 实现 P0 命令：`/help`, `/status`, `/sessions`, `/close`, `/new`, `/dir`
5. 测试：钉钉发 `/help` 看到命令列表，发普通文字照常对话

### 第二步：P1 配置管理命令（半天）

1. 实现 `/config`, `/config list`, `/config switch`
2. 实现 `/model`
3. 实现 `/mcp list`, `/skills list`, `/agents list`
4. 新增 `_isAdmin()` 权限检查
5. 在钉钉设置页增加 `adminStaffIds` 配置项

### 第三步：P2 高级命令 + 完善（半天）

1. 实现 `/restart`, `/export`, `/log`, `/cwd`
2. 完善错误处理和边界情况
3. 更新钉钉使用指南文档
