const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { buildBasicEnv } = require('../utils/env-builder')

const DEFAULT_TIMEOUT = 30000
const WECOM_COMMAND = 'wecom-cli'
const WECOM_CONFIG_DIR = process.env.WECOM_CLI_CONFIG_DIR || path.join(os.homedir(), '.config', 'wecom')

const ERROR_CODES = {
  CLI_NOT_INSTALLED: 'CLI_NOT_INSTALLED',
  CLI_NOT_INITIALIZED: 'CLI_NOT_INITIALIZED',
  CONTACT_NOT_AUTHORIZED: 'CONTACT_NOT_AUTHORIZED',
  CONTACT_AUTH_EXPIRED: 'CONTACT_AUTH_EXPIRED',
  CLI_EXEC_FAILED: 'CLI_EXEC_FAILED',
  CONTACT_FETCH_FAILED: 'CONTACT_FETCH_FAILED',
}

class WecomCliManager {
  constructor() {
    this.timeout = DEFAULT_TIMEOUT
  }

  _spawn(...args) {
    return spawn(...args)
  }

  _getExecEnv(extraEnv = {}) {
    return buildBasicEnv(extraEnv)
  }

  getConfigDir() {
    return WECOM_CONFIG_DIR
  }

  async getStatus() {
    const installed = await this.isInstalled()
    const initialized = this.isInitialized()
    return {
      installed,
      initialized,
      configDir: this.getConfigDir(),
      botInfoPath: path.join(this.getConfigDir(), 'bot.enc'),
      mcpConfigPath: path.join(this.getConfigDir(), 'mcp_config.enc'),
    }
  }

  async getBootstrapStatus() {
    const status = await this.getStatus()
    if (!status.installed) {
      return {
        ...status,
        authStatus: 'not_installed',
        contactAuth: 'unknown',
      }
    }

    if (!status.initialized) {
      return {
        ...status,
        authStatus: 'not_initialized',
        contactAuth: 'unknown',
      }
    }

    try {
      const authState = await this.getAuthStatus()
      return {
        ...status,
        authStatus: authState,
        contactAuth: 'unknown',
        lastErrorCode: null,
        lastErrorMessage: '',
        helpMessage: '',
        helpInstruction: '',
      }
    } catch (err) {
      return {
        ...status,
        authStatus: 'unknown',
        contactAuth: 'unknown',
        lastErrorCode: err.code || ERROR_CODES.CLI_EXEC_FAILED,
        lastErrorMessage: err.message || 'Unknown error',
        helpMessage: err.helpMessage || '',
        helpInstruction: err.helpInstruction || '',
      }
    }
  }

  async isInstalled() {
    try {
      await this._exec([WECOM_COMMAND, 'auth', 'show', '--auth-status'], { timeout: 10000 })
      return true
    } catch (err) {
      if (this._isMissingCommandError(err)) return false
      return true
    }
  }

  isInitialized() {
    const botPath = path.join(this.getConfigDir(), 'bot.enc')
    return fs.existsSync(botPath)
  }

  async getDetailedStatus() {
    const status = await this.getStatus()
    if (!status.installed) {
      return {
        ...status,
        authStatus: 'not_installed',
        contactAuth: 'unknown',
      }
    }

    if (!status.initialized) {
      return {
        ...status,
        authStatus: 'not_initialized',
        contactAuth: 'unknown',
      }
    }

    try {
      const authState = await this.getAuthStatus()
      const contactState = await this.getContactAuthStatus()
      return {
        ...status,
        authStatus: authState,
        contactAuth: contactState.status,
        lastErrorCode: contactState.errorCode || null,
        lastErrorMessage: contactState.errorMessage || '',
        helpMessage: contactState.helpMessage || '',
        helpInstruction: contactState.helpInstruction || '',
      }
    } catch (err) {
      return {
        ...status,
        authStatus: 'initialized',
        contactAuth: 'unknown',
        lastErrorCode: err.code || ERROR_CODES.CLI_EXEC_FAILED,
        lastErrorMessage: err.message || 'Unknown error',
        helpMessage: err.helpMessage || '',
        helpInstruction: err.helpInstruction || '',
      }
    }
  }

  async getAuthStatus() {
    const result = await this.execJsonRpc([WECOM_COMMAND, 'auth', 'show', '--auth-status'])
    const normalized = String(result || '').trim().toLowerCase()
    if (normalized === 'authorized') return 'authorized'
    if (normalized === 'unauthorized') return 'unauthorized'
    return 'unknown'
  }

  async getContactAuthStatus() {
    try {
      await this.listContacts()
      return { status: 'authorized' }
    } catch (err) {
      if (err.code === ERROR_CODES.CONTACT_NOT_AUTHORIZED) {
        return {
          status: 'unauthorized',
          errorCode: err.code,
          errorMessage: err.message,
          helpMessage: err.helpMessage || '',
          helpInstruction: err.helpInstruction || '',
        }
      }
      if (err.code === ERROR_CODES.CONTACT_AUTH_EXPIRED) {
        return {
          status: 'expired',
          errorCode: err.code,
          errorMessage: err.message,
          helpMessage: err.helpMessage || '',
          helpInstruction: err.helpInstruction || '',
        }
      }
      if (err.code === ERROR_CODES.CLI_NOT_INITIALIZED) {
        return {
          status: 'not_initialized',
          errorCode: err.code,
          errorMessage: err.message,
        }
      }
      if (err.code === ERROR_CODES.CLI_NOT_INSTALLED) {
        return {
          status: 'not_installed',
          errorCode: err.code,
          errorMessage: err.message,
        }
      }
      return {
        status: 'unknown',
        errorCode: err.code || ERROR_CODES.CONTACT_FETCH_FAILED,
        errorMessage: err.message || 'Unknown error',
      }
    }
  }

  async listContacts() {
    await this._assertInstalled()
    this._assertInitialized()

    const payload = await this.execJsonRpc([WECOM_COMMAND, 'contact', 'get_userlist'])
    if (!payload || typeof payload !== 'object') {
      const err = new Error('Failed to parse WeCom contact response')
      err.code = ERROR_CODES.CONTACT_FETCH_FAILED
      throw err
    }

    const errcode = Number(payload.errcode || 0)
    if (errcode !== 0) {
      throw this._buildBusinessError(payload)
    }

    const userlist = Array.isArray(payload.userlist) ? payload.userlist : []
    return userlist.map(user => {
      const userId = typeof user?.userid === 'string' ? user.userid.trim() : ''
      const name = typeof user?.name === 'string' ? user.name.trim() : ''
      const alias = typeof user?.alias === 'string' ? user.alias.trim() : ''
      return {
        id: userId,
        userId,
        targetId: userId,
        displayName: name || alias || userId,
        name: name || alias || userId,
        alias,
      }
    }).filter(Boolean)
  }

  async installCommand() {
    if (process.platform === 'win32') {
      return {
        supported: true,
        command: 'npm install -g @wecom/cli',
        shell: process.env.COMSPEC || 'cmd.exe',
        args: ['/k', 'npm install -g @wecom/cli'],
      }
    }

    return {
      supported: true,
      command: 'npm install -g @wecom/cli',
      shell: '/bin/sh',
      args: ['-lc', 'npm install -g @wecom/cli'],
    }
  }

  async initCommand() {
    if (process.platform === 'win32') {
      return {
        supported: true,
        command: 'wecom-cli init --no-open',
        shell: process.env.COMSPEC || 'cmd.exe',
        args: ['/k', 'wecom-cli init --no-open'],
      }
    }

    return {
      supported: true,
      command: 'wecom-cli init --no-open',
      shell: '/bin/sh',
      args: ['-lc', 'wecom-cli init --no-open'],
    }
  }

  async reauthorizeCommand() {
    return this.initCommand()
  }

  async runCommand(commandSpec) {
    if (!commandSpec?.command) {
      const err = new Error('WeCom CLI command is not available')
      err.code = ERROR_CODES.CLI_EXEC_FAILED
      throw err
    }

    if (process.platform === 'win32') {
      const command = String(commandSpec.command).replace(/"/g, '\\"')
      const child = this._spawn(process.env.COMSPEC || 'cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', command], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env,
      })
      child.unref()
      return { success: true, mode: 'terminal', command: commandSpec.command }
    }

    if (process.platform === 'darwin') {
      const escaped = String(commandSpec.command)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
      const appleScript = `tell application "Terminal"
activate
do script "${escaped}"
end tell`
      const child = this._spawn('osascript', ['-e', appleScript], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      })
      child.unref()
      return { success: true, mode: 'terminal', command: commandSpec.command }
    }

    const err = new Error('Direct CLI execution is only supported on Windows and macOS')
    err.code = ERROR_CODES.CLI_EXEC_FAILED
    throw err
  }

  async execJsonRpc(args) {
    const result = await this._exec(args)
    const stdout = (result.stdout || '').trim()
    if (!stdout) return null

    if (stdout.startsWith('{') && stdout.includes('"jsonrpc"')) {
      const outer = JSON.parse(stdout)
      const text = outer?.result?.content?.[0]?.text
      if (!text) return outer
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    }

    try {
      return JSON.parse(stdout)
    } catch {
      return stdout
    }
  }

  async _assertInstalled() {
    if (!(await this.isInstalled())) {
      const err = new Error('wecom-cli is not installed')
      err.code = ERROR_CODES.CLI_NOT_INSTALLED
      throw err
    }
  }

  _assertInitialized() {
    if (!this.isInitialized()) {
      const err = new Error('wecom-cli is not initialized')
      err.code = ERROR_CODES.CLI_NOT_INITIALIZED
      throw err
    }
  }

  _buildBusinessError(payload) {
    const errcode = Number(payload?.errcode || 0)
    const message = String(payload?.errmsg || 'WeCom CLI business error')
    const helpMessage = typeof payload?.help_message === 'string' ? payload.help_message : ''
    const helpInstruction = typeof payload?.help_instruction === 'string' ? payload.help_instruction : ''

    const err = new Error(helpMessage || message)
    err.errcode = errcode
    err.helpMessage = helpMessage
    err.helpInstruction = helpInstruction

    if (errcode === 850002) {
      err.code = ERROR_CODES.CONTACT_NOT_AUTHORIZED
      return err
    }

    if (helpMessage && /7天|七天|过期|重新授权/i.test(helpMessage)) {
      err.code = ERROR_CODES.CONTACT_AUTH_EXPIRED
      return err
    }

    err.code = ERROR_CODES.CONTACT_FETCH_FAILED
    return err
  }

  _isMissingCommandError(err) {
    const msg = `${err?.message || ''}`.toLowerCase()
    return msg.includes('enoent') || msg.includes('not recognized') || msg.includes('not found')
  }

  async _exec(args, options = {}) {
    const timeout = options.timeout || this.timeout
    const env = this._getExecEnv(options.env || {})
    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let child
      let timer

      const isWindows = process.platform === 'win32'
      if (isWindows) {
        const cmdLine = args.map(arg => /[\s"&|<>^]/.test(arg) ? `"${arg}"` : arg).join(' ')
        child = this._spawn(process.env.COMSPEC || 'cmd.exe', ['/s', '/c', cmdLine], {
          windowsHide: true,
          env,
        })
      } else {
        child = this._spawn(args[0], args.slice(1), {
          env,
        })
      }

      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })

      timer = setTimeout(() => {
        child.kill()
        const err = new Error('wecom-cli command timed out')
        err.code = ERROR_CODES.CLI_EXEC_FAILED
        reject(err)
      }, timeout)

      child.on('error', err => {
        clearTimeout(timer)
        err.code = this._isMissingCommandError(err) ? ERROR_CODES.CLI_NOT_INSTALLED : ERROR_CODES.CLI_EXEC_FAILED
        reject(err)
      })

      child.on('close', code => {
        clearTimeout(timer)
        if (code !== 0) {
          const err = new Error((stderr || stdout || `wecom-cli exited with code ${code}`).trim())
          err.code = this._isMissingCommandError(err) ? ERROR_CODES.CLI_NOT_INSTALLED : ERROR_CODES.CLI_EXEC_FAILED
          err.exitCode = code
          err.stdout = stdout
          err.stderr = stderr
          reject(err)
          return
        }
        resolve({ stdout, stderr, exitCode: 0 })
      })
    })
  }
}

module.exports = {
  WecomCliManager,
  WECOM_CLI_ERROR_CODES: ERROR_CODES,
}
