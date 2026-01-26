/**
 * 终端管理器
 * 管理单个 PTY 进程的生命周期
 */

const pty = require('node-pty');
const os = require('os');

class TerminalManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow;
    this.configManager = configManager;
    this.pty = null;
    this.currentProject = null;
  }

  /**
   * 启动终端进程
   */
  start(projectPath) {
    // 先关闭旧进程
    this.kill();

    const config = this.configManager.getConfig();

    // 跨平台 shell 选择：优先使用系统默认 shell
    const isWin = os.platform() === 'win32';
    const shell = isWin
      ? (process.env.COMSPEC || 'cmd.exe')  // Windows: 使用 COMSPEC 或 cmd.exe
      : (process.env.SHELL || '/bin/sh');   // macOS/Linux: 使用 SHELL 或 /bin/sh

    console.log(`[Terminal] Starting in: ${projectPath}`);

    try {
      // 创建 PTY 进程
      this.pty = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: projectPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: config.settings.anthropicApiKey || config.settings.claudeApiKey,
          TERM: 'xterm-256color'
        }
      });

      this.currentProject = projectPath;

      // 监听数据输出
      this.pty.onData(data => {
        this.mainWindow.webContents.send('terminal:data', data);
      });

      // 监听退出
      this.pty.onExit(({ exitCode, signal }) => {
        console.log(`[Terminal] Process exited. Code: ${exitCode}, Signal: ${signal}`);
        this.pty = null;
        this.currentProject = null;
        this.mainWindow.webContents.send('terminal:exit', { exitCode, signal });
      });

      // 发送欢迎消息
      setTimeout(() => {
        this.writeLine('');
        this.writeLine('# CC Desktop Terminal');
        this.writeLine(`# Working Directory: ${projectPath}`);
        this.writeLine('# Type "claude code" to start Claude Code CLI');
        this.writeLine('');
      }, 100);

      return { success: true, path: projectPath };
    } catch (error) {
      console.error('[Terminal] Failed to start:', error);
      this.mainWindow.webContents.send('terminal:error', error.message);
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
        console.log('[Terminal] Killing process...');
        this.pty.kill();
        this.pty = null;
        this.currentProject = null;
      } catch (error) {
        console.error('[Terminal] Kill failed:', error);
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
