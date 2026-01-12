# 自定义 UI 集成指南

本文档说明如何使用 `ClaudeAPIManager` 实现自定义 UI 界面，替代传统的终端界面。

## 架构对比

### 当前架构（终端模式）
```
用户 → xterm.js 终端 → PTY → Shell → claude code CLI
```
**特点**：简单直接，但 UI 受限于终端格式

### 新架构（自定义 UI 模式）
```
用户 → 自定义 UI → IPC → ClaudeAPIManager → claude code CLI (JSON 模式)
```
**特点**：完全控制 UI，可实现富文本、代码高亮、Markdown 等

## 实现步骤

### 1. 在主进程中使用 ClaudeAPIManager

```javascript
// src/main/index.js

const ClaudeAPIManager = require('./claude-api-manager');

let claudeAPIManager = null;

app.whenReady().then(() => {
  // 使用 ClaudeAPIManager 替代 TerminalManager
  claudeAPIManager = new ClaudeAPIManager(mainWindow, configManager);

  // 设置 IPC 处理器
  setupClaudeAPIHandlers(mainWindow, configManager, claudeAPIManager);
});
```

### 2. 添加 IPC 处理器

```javascript
// src/main/ipc-handlers.js

function setupClaudeAPIHandlers(mainWindow, configManager, claudeAPIManager) {
  // 启动 Claude
  ipcMain.handle('claude:start', async (event, projectPath) => {
    return claudeAPIManager.start(projectPath);
  });

  // 发送消息
  ipcMain.handle('claude:send', async (event, content) => {
    return claudeAPIManager.sendMessage(content);
  });

  // 获取历史记录
  ipcMain.handle('claude:history', async () => {
    return claudeAPIManager.getConversationHistory();
  });

  // 导出对话
  ipcMain.handle('claude:export', async (event, format) => {
    return claudeAPIManager.exportConversation(format);
  });

  // 关闭
  ipcMain.handle('claude:kill', async () => {
    claudeAPIManager.kill();
    return { success: true };
  });
}
```

### 3. 在 Preload 中暴露 API

```javascript
// src/preload/preload.js

contextBridge.exposeInMainWorld('claudeAPI', {
  // 启动
  start: (projectPath) => ipcRenderer.invoke('claude:start', projectPath),

  // 发送消息
  send: (content) => ipcRenderer.invoke('claude:send', content),

  // 获取历史
  getHistory: () => ipcRenderer.invoke('claude:history'),

  // 导出
  export: (format) => ipcRenderer.invoke('claude:export', format),

  // 关闭
  kill: () => ipcRenderer.invoke('claude:kill'),

  // 事件监听
  onMessageStart: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('claude:message-start', listener);
    return () => ipcRenderer.removeListener('claude:message-start', listener);
  },

  onTextDelta: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('claude:text-delta', listener);
    return () => ipcRenderer.removeListener('claude:text-delta', listener);
  },

  onMessageStop: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('claude:message-stop', listener);
    return () => ipcRenderer.removeListener('claude:message-stop', listener);
  },

  onUsage: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('claude:usage', listener);
    return () => ipcRenderer.removeListener('claude:usage', listener);
  },

  onError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('claude:error', listener);
    return () => ipcRenderer.removeListener('claude:error', listener);
  }
});
```

### 4. 在渲染进程中构建自定义 UI

```javascript
// src/renderer/js/chat-app.js

class ChatApp {
  constructor() {
    this.messages = [];
    this.currentMessage = null;
    this.initUI();
    this.setupEventListeners();
  }

  initUI() {
    // 创建聊天界面
    this.chatContainer = document.getElementById('chat-container');
    this.inputBox = document.getElementById('message-input');
    this.sendButton = document.getElementById('send-button');
    this.usageDisplay = document.getElementById('usage-display');
  }

  setupEventListeners() {
    // 监听消息开始
    window.claudeAPI.onMessageStart((data) => {
      console.log('Message started:', data);
      this.currentMessage = {
        id: data.id,
        role: data.role,
        model: data.model,
        content: '',
        timestamp: new Date()
      };

      // 在 UI 中创建消息容器
      this.addMessageToUI(this.currentMessage);
    });

    // 监听文本流式输出
    window.claudeAPI.onTextDelta((data) => {
      if (this.currentMessage) {
        this.currentMessage.content += data.text;

        // 实时更新 UI（支持 Markdown 渲染）
        this.updateMessageContent(this.currentMessage.id, this.currentMessage.content);
      }
    });

    // 监听消息完成
    window.claudeAPI.onMessageStop((data) => {
      console.log('Message completed:', data);
      if (this.currentMessage) {
        this.messages.push(this.currentMessage);
        this.finalizeMessage(this.currentMessage.id);
        this.currentMessage = null;
      }
    });

    // 监听 Token 使用情况
    window.claudeAPI.onUsage((data) => {
      this.updateUsageDisplay(data);
    });

    // 监听错误
    window.claudeAPI.onError((data) => {
      this.showError(data.error);
    });

    // 发送按钮点击
    this.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // 回车发送
    this.inputBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  async sendMessage() {
    const content = this.inputBox.value.trim();
    if (!content) return;

    // 添加用户消息到 UI
    this.addUserMessage(content);

    // 清空输入框
    this.inputBox.value = '';

    // 发送到 Claude
    try {
      await window.claudeAPI.send(content);
    } catch (error) {
      this.showError('Failed to send message: ' + error.message);
    }
  }

  addUserMessage(content) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message user-message';
    messageEl.innerHTML = `
      <div class="message-header">
        <span class="role">You</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="message-content">${this.escapeHtml(content)}</div>
    `;
    this.chatContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  addMessageToUI(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant-message';
    messageEl.id = `message-${message.id}`;
    messageEl.innerHTML = `
      <div class="message-header">
        <span class="role">Claude</span>
        <span class="model">${message.model}</span>
        <span class="timestamp">${message.timestamp.toLocaleTimeString()}</span>
      </div>
      <div class="message-content" id="content-${message.id}">
        <div class="typing-indicator">Thinking...</div>
      </div>
    `;
    this.chatContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  updateMessageContent(messageId, content) {
    const contentEl = document.getElementById(`content-${messageId}`);
    if (contentEl) {
      // 使用 Markdown 渲染（需要引入 marked.js 或类似库）
      contentEl.innerHTML = this.renderMarkdown(content);
      this.scrollToBottom();
    }
  }

  finalizeMessage(messageId) {
    const messageEl = document.getElementById(`message-${messageId}`);
    if (messageEl) {
      messageEl.classList.add('completed');
    }
  }

  updateUsageDisplay(usage) {
    this.usageDisplay.innerHTML = `
      <span>Input: ${usage.inputTokens} tokens</span>
      <span>Output: ${usage.outputTokens} tokens</span>
      <span>Total: ${usage.inputTokens + usage.outputTokens} tokens</span>
    `;
  }

  renderMarkdown(content) {
    // 简单的 Markdown 渲染示例
    // 实际应用中建议使用 marked.js 或 markdown-it
    return content
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code)}</code></pre>`;
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  showError(message) {
    // 显示错误提示
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    this.chatContainer.appendChild(errorEl);

    setTimeout(() => errorEl.remove(), 5000);
  }

  async exportConversation(format = 'json') {
    try {
      const data = await window.claudeAPI.export(format);

      // 下载文件
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.showError('Failed to export: ' + error.message);
    }
  }
}

// 初始化应用
const app = new ChatApp();

// 启动 Claude
async function startClaude(projectPath) {
  const result = await window.claudeAPI.start(projectPath);
  if (result.success) {
    console.log('Claude started successfully');
  } else {
    console.error('Failed to start Claude:', result.error);
  }
}
```

### 5. 自定义 UI 样式

```css
/* src/renderer/css/chat-app.css */

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
  background: #f5f5f0;
}

.message {
  margin-bottom: 20px;
  padding: 15px;
  border-radius: 8px;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-message {
  background: #e3f2fd;
  align-self: flex-end;
  max-width: 70%;
}

.assistant-message {
  background: #fff;
  border: 1px solid #e0e0e0;
  max-width: 85%;
}

.message-header {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #666;
}

.role {
  font-weight: 600;
  color: #333;
}

.model {
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 3px;
  font-family: monospace;
}

.message-content {
  line-height: 1.6;
  color: #333;
}

.message-content code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
  font-size: 0.9em;
}

.message-content pre {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
}

.message-content pre code {
  background: none;
  color: inherit;
  padding: 0;
}

.typing-indicator {
  color: #999;
  font-style: italic;
}

.input-container {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

#message-input {
  flex: 1;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;
}

#send-button {
  padding: 12px 30px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

#send-button:hover {
  background: #0056b3;
}

.usage-display {
  padding: 10px;
  background: #f9f9f9;
  border-radius: 5px;
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 15px;
}

.error-message {
  padding: 10px;
  background: #f44336;
  color: white;
  border-radius: 5px;
  margin: 10px 0;
}
```

## 对比总结

| 特性 | 终端模式 | 自定义 UI 模式 |
|------|---------|--------------|
| **UI 灵活性** | 受限于终端格式 | 完全自定义 |
| **Markdown 渲染** | ❌ 纯文本 | ✅ 富文本渲染 |
| **代码高亮** | ❌ 基础 ANSI | ✅ 语法高亮 |
| **对话历史** | ❌ 终端历史 | ✅ 结构化存储 |
| **搜索功能** | ❌ | ✅ 可实现 |
| **导出对话** | ❌ | ✅ JSON/Markdown |
| **Token 显示** | ❌ | ✅ 实时显示 |
| **流式输出** | ✅ | ✅ |
| **实现复杂度** | 简单 | 中等 |

## 下一步

1. **混合模式**：同时支持终端模式和 UI 模式，让用户选择
2. **侧边栏**：在终端旁边显示结构化的对话历史
3. **插件系统**：允许第三方扩展 UI 功能
4. **主题定制**：支持更多主题和样式

## 注意事项

1. **CLI 版本要求**：确保 Claude Code CLI 支持 `--output-format=stream-json`
2. **错误处理**：JSON 解析失败时的降级处理
3. **性能优化**：大量消息时的虚拟滚动
4. **安全性**：渲染用户输入时防止 XSS 攻击
