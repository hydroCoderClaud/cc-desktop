/**
 * 终端管理器
 * 管理单个 PTY 进程的生命周期
 */

const pty = require('node-pty');
const os = require('os');
const fs = require('fs');
const { killProcessTree } = require('./utils/process-tree-kill');

class TerminalManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow;
    this.configManager = configManager;
    this.pty = null;
    this.currentProject = null;
  }

  /**
   * 安全地发送消息到渲染进程
   * @param {string} channel - IPC 频道
   * @param {any} data - 数据
   * @returns {boolean} 是否发送成功
   */
  _safeSend(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data)
        return true
      }
      console.warn(`[Terminal] Cannot send to ${channel}: window or webContents destroyed`)
      return false
    } catch (error) {
      console.error(`[Terminal] Failed to send to ${channel}:`, error)
      return false
    }
  }

  /**
   * 启动终端进程
   */
  start(projectPath) {
    // 先关闭旧进程
    this.kill();

    const config = this.configManager.getConfig();

    // 跨平台 shell 选择：优先使用系统默认 shell
    const platform = os.platform();
    let shell;
    let shellArgs = [];  // shell 启动参数

    if (platform === 'win32') {
      // Windows: 使用 COMSPEC 或 cmd.exe
      shell = process.env.COMSPEC || 'cmd.exe';
    } else if (platform === 'darwin') {
      // macOS: 优先使用 zsh（macOS 10.15+ 默认），其次 bash
      shell = process.env.SHELL || '/bin/zsh';
      // 如果 SHELL 环境变量指向不存在的路径，尝试常见路径
      try {
        fs.accessSync(shell, fs.constants.X_OK);
      } catch (e) {
        console.warn(`[Terminal] Shell ${shell} not accessible, trying alternatives...`);
        // 如果默认 shell 不可用，尝试其他常见 shell
        const alternativeShells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
        for (const altShell of alternativeShells) {
          try {
            fs.accessSync(altShell, fs.constants.X_OK);
            shell = altShell;
            console.log(`[Terminal] Found working shell: ${shell}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }

      // 以登录 shell 方式启动，加载 .zshrc/.bashrc 等配置文件
      if (shell.includes('/zsh') || shell.includes('/bash')) {
        shellArgs = ['-l'];
      }
    } else {
      // Linux: 使用 SHELL 或 /bin/bash
      shell = process.env.SHELL || '/bin/bash';
    }

    console.log(`[Terminal] Platform: ${platform}`);
    console.log(`[Terminal] Selected shell: ${shell}`);
    console.log(`[Terminal] SHELL env: ${process.env.SHELL}`);
    console.log(`[Terminal] Working directory: ${projectPath}`);

    try {
      // 创建 PTY 进程
      this.pty = pty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: projectPath,
        env: {
          ...process.env,
          // 清除所有可能的认证变量，避免冲突
          ANTHROPIC_API_KEY: undefined,
          ANTHROPIC_API_TOKEN: undefined,
          ANTHROPIC_AUTH_TOKEN: undefined,
          CLAUDE_AI_TOKEN: undefined,
          // 根据配置设置正确的认证方式（二选一）
          ...(config.settings.anthropicApiKey ? {
            ANTHROPIC_API_KEY: config.settings.anthropicApiKey
          } : {}),
          ...(config.settings.anthropicApiToken ? {
            ANTHROPIC_API_TOKEN: config.settings.anthropicApiToken
          } : {}),
          ...(config.settings.claudeApiKey ? {
            ANTHROPIC_API_KEY: config.settings.claudeApiKey
          } : {}),
          TERM: 'xterm-256color',
          PATH: process.env.PATH // 确保 PATH 正确传递
        }
      });

      this.currentProject = projectPath;

      // 监听数据输出
      this.pty.onData(data => {
        this._safeSend('terminal:data', data);
      });

      // 监听退出
      this.pty.onExit(({ exitCode, signal }) => {
        console.log(`[Terminal] Process exited. Code: ${exitCode}, Signal: ${signal}`);
        this.pty = null;
        this.currentProject = null;
        this._safeSend('terminal:exit', { exitCode, signal });
      });

      // 发送欢迎消息并启动 claude code
      setTimeout(() => {
        // Windows: 设置 UTF-8 代码页以正确显示 Unicode 字符
        if (platform === 'win32') {
          this.writeLine('chcp 65001 >nul');
        }

        this.writeLine('');
        this.writeLine('# CC Desktop Terminal');
        this.writeLine(`# Working Directory: ${projectPath}`);
        this.writeLine('# Starting Claude Code CLI...');
        this.writeLine('');

        // 自动启动 claude code
        this.writeLine('claude code');
      }, 100);

      return { success: true, path: projectPath };
    } catch (error) {
      console.error('[Terminal] Failed to start:', error);
      this._safeSend('terminal:error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 写入数据到终端
   */
  write(data) {
    if (this.pty) {
      this.pty.write(data);
    }
  }

  /**
   * 写入一行（自动添加换行符）
   */
  writeLine(text) {
    if (this.pty) {
      this.pty.write(text + '\r\n');
    }
  }

  /**
   * 调整终端大小
   */
  resize(cols, rows) {
    if (this.pty) {
      try {
        this.pty.resize(cols, rows);
      } catch (error) {
        console.error('[Terminal] Resize failed:', error);
      }
    }
  }

  /**
   * 关闭终端
   */
  kill() {
    if (this.pty) {
      try {
        const pid = this.pty.pid;
        console.log(`[Terminal] Killing process (PID: ${pid})...`);
        // Windows: 先杀进程树（包括 shell 内启动的 claude code 等子进程）
        killProcessTree(pid);
        // 再走 node-pty 自身的清理
        this.pty.kill();
        this.pty = null;
        this.currentProject = null;
      } catch (error) {
        console.error('[Terminal] Kill failed:', error);
        this.pty = null;
        this.currentProject = null;
      }
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      running: this.pty !== null,
      project: this.currentProject
    };
  }
}

module.exports = TerminalManager;
