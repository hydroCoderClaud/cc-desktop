# 架构常见问题（FAQ）

## Q1: 能实现 CLI 和外部其他功能的交互吗？

**答：完全可以！**

Claude Code CLI 提供了 JSON API 模式，支持程序化交互：

```bash
claude code --print --output-format=stream-json --input-format=stream-json
```

### 可以做什么：

✅ **获取结构化数据**
- 每条消息都是 JSON 对象
- 包含类型、内容、元数据、Token 使用情况

✅ **实时流式输出**
- 逐块接收 Claude 的回复
- 支持打字机效果

✅ **双向通信**
- 发送：JSON 格式的消息
- 接收：JSON 格式的响应

✅ **元数据访问**
- Token 用量（输入/输出）
- 模型版本
- 停止原因
- 消息 ID

### 示例 JSON 输出：

```json
// 消息开始
{"type":"message_start","message":{"id":"msg_123","role":"assistant","model":"claude-sonnet-4.5"}}

// 内容块（流式）
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好！"}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"我是 Claude"}}

// Token 使用情况
{"type":"usage","input_tokens":150,"output_tokens":200}

// 消息结束
{"type":"message_stop"}
```

## Q2: 能否做到 CLI 在后台运行，前台使用自定义界面？

**答：完全可以！这正是 API 模式的设计目的。**

### 实现方案

```
┌────────────────────────────────┐
│      自定义 UI 界面              │  ← 你完全控制这部分
│  - 聊天气泡                      │
│  - Markdown 渲染                 │
│  - 代码高亮                      │
│  - 对话历史                      │
│  - 搜索、导出                    │
└────────────┬───────────────────┘
             │ IPC 通信
┌────────────▼───────────────────┐
│   ClaudeAPIManager (主进程)     │
│  - 启动 CLI 进程                │
│  - 解析 JSON 流                 │
│  - 转发到渲染进程               │
└────────────┬───────────────────┘
             │ stdin/stdout
┌────────────▼───────────────────┐
│  claude code (后台运行)         │  ← CLI 在后台，不显示终端
│  --print                        │
│  --output-format=stream-json    │
└─────────────────────────────────┘
```

### 关键代码

```javascript
// 主进程：启动后台 CLI
const process = spawn('claude', [
  'code',
  '--print',                    // 非交互模式
  '--output-format=stream-json' // JSON 输出
], {
  stdio: ['pipe', 'pipe', 'pipe'] // 完全控制输入输出
});

// 解析输出
process.stdout.on('data', (data) => {
  const json = JSON.parse(data.toString());
  // 发送到自定义 UI
  mainWindow.webContents.send('claude:message', json);
});

// 发送用户输入
process.stdin.write(JSON.stringify({
  type: 'message',
  content: '用户的问题'
}) + '\n');
```

### 你可以实现的功能

✅ **完全自定义 UI**
- 不是终端，而是聊天界面
- 使用 React、Vue 或原生 HTML/CSS
- 可以像 ChatGPT 那样的对话框

✅ **富文本渲染**
```javascript
// Markdown → HTML
import marked from 'marked';
messageDiv.innerHTML = marked(claudeResponse);

// 代码高亮
import Prism from 'prismjs';
Prism.highlightAll();
```

✅ **对话历史管理**
```javascript
// 存储结构化数据
conversationHistory.push({
  role: 'user',
  content: '你好',
  timestamp: new Date()
});

conversationHistory.push({
  role: 'assistant',
  content: 'Claude 的回复',
  tokens: { input: 10, output: 50 },
  timestamp: new Date()
});

// 导出为 JSON 或 Markdown
exportToJSON(conversationHistory);
```

✅ **实时统计**
```javascript
// 显示 Token 使用情况
onTokenUsage((usage) => {
  document.getElementById('tokens').textContent =
    `输入: ${usage.inputTokens} | 输出: ${usage.outputTokens}`;
});
```

## Q3: 这两种模式该选哪个？

### 终端模式（当前实现）

**适合：**
- 开发者用户
- 需要命令行体验
- 快速开发和部署

**优点：**
- ✅ 简单直接
- ✅ 完整终端功能
- ✅ 开箱即用

**缺点：**
- ❌ UI 受限
- ❌ 难以定制

### API 模式（新功能）

**适合：**
- 非技术用户
- 需要现代化聊天界面
- 需要对话管理功能

**优点：**
- ✅ 完全自定义 UI
- ✅ 结构化数据
- ✅ 丰富功能（搜索、导出、统计）

**缺点：**
- ❌ 开发工作量更大
- ❌ 不支持某些终端特性

### 推荐方案：混合模式

**同时支持两种模式**，让用户选择：

```
┌──────────────────────────────┐
│  [终端模式] [对话模式]  ← 切换按钮
├──────────────────────────────┤
│                              │
│  根据选择显示不同界面         │
│                              │
└──────────────────────────────┘
```

实现：
```javascript
class HybridManager {
  switchMode(mode) {
    if (mode === 'terminal') {
      showTerminal();  // xterm.js
    } else {
      showChatUI();    // 自定义聊天界面
    }
  }
}
```

## 实现路线图

### v1.0 - 终端模式（已完成）
- ✅ 基于 xterm.js
- ✅ 完整终端体验

### v1.1 - 添加 API 模式
- [ ] 实现 ClaudeAPIManager
- [ ] 创建基础聊天 UI
- [ ] 添加模式切换

### v1.2 - 功能增强
- [ ] 对话历史
- [ ] 搜索和过滤
- [ ] 导出功能
- [ ] Token 统计

### v2.0 - 高级功能
- [ ] 多会话管理
- [ ] 对话分支
- [ ] 插件系统

## 参考文档

- `CLAUDE.md` - 项目架构指南
- `docs/CUSTOM-UI-GUIDE.md` - 自定义 UI 实现详解
- `docs/ARCHITECTURE-COMPARISON.md` - 两种模式对比
- `src/main/claude-api-manager.js` - API 模式示例代码

## 总结

**你的问题答案：**

1. ✅ **能实现 CLI 和外部功能交互** - 通过 JSON API 模式
2. ✅ **能获取对话内容** - 结构化 JSON 数据
3. ✅ **能自定义 UI** - CLI 后台运行，前台完全自定义
4. ✅ **不仅限于终端界面** - 可以做聊天界面、富文本等

**关键命令：**
```bash
claude code --print --output-format=stream-json
```

**现在的状态：**
- 已实现：终端模式
- 已准备：API 模式代码示例和文档
- 待实现：UI 界面开发

你可以选择保持终端模式，或者实现自定义 UI，或者两者都支持！
