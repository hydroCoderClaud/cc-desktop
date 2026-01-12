/**
 * Claude API Manager
 * 使用 Claude Code CLI 的 JSON 模式进行结构化交互
 */

const { spawn } = require('child_process');
const path = require('path');

class ClaudeAPIManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow;
    this.configManager = configManager;
    this.process = null;
    this.currentProject = null;
    this.messageBuffer = '';
    this.conversationHistory = [];
  }

  /**
   * 启动 Claude Code CLI（JSON 模式）
   */
  start(projectPath) {
    // 先关闭旧进程
    this.kill();

    // 获取并验证 API 配置
    const validation = this.configManager.validateAPIConfig();
    if (!validation.valid) {
      const errorMsg = `API 配置错误:\n${validation.errors.join('\n')}`;
      console.error(`[Claude API] ${errorMsg}`);
      this.mainWindow.webContents.send('claude:error', {
        error: errorMsg,
        needsConfig: true
      });
      return { success: false, error: errorMsg, needsConfig: true };
    }

    const apiConfig = validation.config;
    console.log(`[Claude API] Starting in: ${projectPath}`);
    console.log(`[Claude API] Base URL: ${apiConfig.baseUrl}`);
    console.log(`[Claude API] Model: ${apiConfig.model}`);
    console.log(`[Claude API] Proxy enabled: ${apiConfig.useProxy}`);

    try {
      // 构建环境变量
      const env = {
        ...process.env,
        // 自定义 API 端点
        ANTHROPIC_BASE_URL: apiConfig.baseUrl
      };

      // 根据 authType 设置对应的环境变量（二选一，避免冲突）
      const authType = apiConfig.authType || 'api_key';
      if (authType === 'api_key') {
        // Anthropic 官方 API 标准
        env.ANTHROPIC_API_KEY = apiConfig.authToken;
        console.log('[Claude API] Using ANTHROPIC_API_KEY (official)');
      } else if (authType === 'auth_token') {
        // 第三方代理服务使用
        env.ANTHROPIC_AUTH_TOKEN = apiConfig.authToken;
        console.log('[Claude API] Using ANTHROPIC_AUTH_TOKEN (third-party)');
      }

      // 如果启用代理，设置代理环境变量
      if (apiConfig.useProxy) {
        if (apiConfig.httpsProxy) {
          env.HTTPS_PROXY = apiConfig.httpsProxy;
          env.https_proxy = apiConfig.httpsProxy; // 兼容小写
          console.log(`[Claude API] HTTPS Proxy: ${apiConfig.httpsProxy}`);
        }
        if (apiConfig.httpProxy) {
          env.HTTP_PROXY = apiConfig.httpProxy;
          env.http_proxy = apiConfig.httpProxy; // 兼容小写
          console.log(`[Claude API] HTTP Proxy: ${apiConfig.httpProxy}`);
        }
      }

      // 启动 CLI 进程
      this.process = spawn('claude', [
        'code',
        '--print',                          // 非交互模式
        '--output-format=stream-json',      // JSON 流式输出
        '--input-format=stream-json',       // JSON 流式输入
        '--include-partial-messages',       // 包含部分消息
        '--replay-user-messages',           // 回显用户消息
        '--model', apiConfig.model          // 指定模型
      ], {
        cwd: projectPath,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
      });

      this.currentProject = projectPath;

      // 监听标准输出（JSON 数据流）
      this.process.stdout.on('data', (data) => {
        this.handleOutput(data);
      });

      // 监听标准错误
      this.process.stderr.on('data', (data) => {
        console.error(`[Claude API] Error: ${data.toString()}`);
        this.mainWindow.webContents.send('claude:error', {
          error: data.toString()
        });
      });

      // 监听退出
      this.process.on('exit', (code, signal) => {
        console.log(`[Claude API] Process exited. Code: ${code}, Signal: ${signal}`);
        this.process = null;
        this.currentProject = null;
        this.mainWindow.webContents.send('claude:exit', { code, signal });
      });

      // 监听错误
      this.process.on('error', (error) => {
        console.error(`[Claude API] Process error:`, error);
        this.mainWindow.webContents.send('claude:error', {
          error: error.message
        });
      });

      return { success: true, path: projectPath };
    } catch (error) {
      console.error('[Claude API] Failed to start:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理 JSON 输出流
   */
  handleOutput(data) {
    const text = data.toString();
    this.messageBuffer += text;

    // 按行分割 JSON 对象（stream-json 每行一个 JSON）
    const lines = this.messageBuffer.split('\n');

    // 保留最后不完整的行
    this.messageBuffer = lines.pop() || '';

    // 处理每一行
    lines.forEach(line => {
      if (!line.trim()) return;

      try {
        const jsonData = JSON.parse(line);
        this.processMessage(jsonData);
      } catch (error) {
        console.error('[Claude API] Failed to parse JSON:', line, error);
      }
    });
  }

  /**
   * 处理单个 JSON 消息
   */
  processMessage(message) {
    console.log('[Claude API] Received:', message);

    // 根据消息类型处理
    switch (message.type) {
      case 'message_start':
        // 新消息开始
        this.mainWindow.webContents.send('claude:message-start', {
          id: message.message?.id,
          role: message.message?.role,
          model: message.message?.model
        });
        break;

      case 'content_block_start':
        // 内容块开始
        this.mainWindow.webContents.send('claude:content-start', {
          index: message.index,
          contentType: message.content_block?.type
        });
        break;

      case 'content_block_delta':
        // 内容块增量（流式输出）
        if (message.delta?.type === 'text_delta') {
          this.mainWindow.webContents.send('claude:text-delta', {
            text: message.delta.text,
            index: message.index
          });
        }
        break;

      case 'content_block_stop':
        // 内容块结束
        this.mainWindow.webContents.send('claude:content-stop', {
          index: message.index
        });
        break;

      case 'message_delta':
        // 消息元数据更新
        this.mainWindow.webContents.send('claude:message-delta', {
          stopReason: message.delta?.stop_reason,
          stopSequence: message.delta?.stop_sequence
        });
        break;

      case 'message_stop':
        // 消息完成
        this.mainWindow.webContents.send('claude:message-stop', message);
        break;

      case 'usage':
        // Token 使用情况
        this.mainWindow.webContents.send('claude:usage', {
          inputTokens: message.input_tokens,
          outputTokens: message.output_tokens
        });
        break;

      case 'error':
        // 错误消息
        this.mainWindow.webContents.send('claude:error', {
          error: message.error
        });
        break;

      default:
        console.log('[Claude API] Unknown message type:', message.type);
    }

    // 存储到历史记录
    this.conversationHistory.push({
      timestamp: new Date().toISOString(),
      message
    });
  }

  /**
   * 发送用户消息（JSON 格式）
   */
  sendMessage(content) {
    if (!this.process || !this.process.stdin) {
      console.error('[Claude API] Process not running');
      return false;
    }

    try {
      // 构造 JSON 消息
      const message = {
        type: 'message',
        content: content
      };

      // 写入 stdin（每个 JSON 对象一行）
      this.process.stdin.write(JSON.stringify(message) + '\n');

      console.log('[Claude API] Sent message:', content);
      return true;
    } catch (error) {
      console.error('[Claude API] Failed to send message:', error);
      return false;
    }
  }

  /**
   * 关闭进程
   */
  kill() {
    if (this.process) {
      try {
        console.log('[Claude API] Killing process...');
        this.process.kill();
        this.process = null;
        this.currentProject = null;
        this.conversationHistory = [];
        this.messageBuffer = '';
      } catch (error) {
        console.error('[Claude API] Kill failed:', error);
      }
    }
  }

  /**
   * 获取对话历史
   */
  getConversationHistory() {
    return this.conversationHistory;
  }

  /**
   * 导出对话
   */
  exportConversation(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.conversationHistory, null, 2);
    } else if (format === 'markdown') {
      // 转换为 Markdown 格式
      return this.conversationHistory
        .filter(item => item.message.type === 'content_block_delta')
        .map(item => item.message.delta?.text || '')
        .join('');
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      running: this.process !== null,
      project: this.currentProject,
      messageCount: this.conversationHistory.length
    };
  }
}

module.exports = ClaudeAPIManager;
