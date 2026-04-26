/**
 * ClaudeCodeRunner
 *
 * 封装 @anthropic-ai/claude-agent-sdk 的输入输出。
 * AgentSessionManager 通过此 Runner 与 SDK 交互，不直接依赖 SDK。
 *
 * 职责：
 * - 加载 SDK（ESM 动态 import）
 * - createQuery：创建持久 AsyncIterable query
 * - normalizeMessage：将 SDK 原始消息转为内部标准格式
 * - buildEnv：构建 SDK 所需环境变量
 */

const { spawn: cpSpawn } = require('child_process')
const { killProcessTree } = require('../utils/process-tree-kill')

class ClaudeCodeRunner {
  constructor() {
    this._queryFn = null
    this._sdkLoading = null
  }

  /**
   * 延迟加载 SDK（ESM 模块需要动态 import）
   */
  async _loadSDK() {
    if (this._queryFn) return this._queryFn
    if (this._sdkLoading) return this._sdkLoading

    this._sdkLoading = (async () => {
      try {
        const sdk = await import('@anthropic-ai/claude-agent-sdk')
        this._queryFn = sdk.query
        console.log('[ClaudeCodeRunner] SDK loaded successfully')
        return this._queryFn
      } catch (error) {
        this._sdkLoading = null
        console.error('[ClaudeCodeRunner] Failed to load SDK:', error)
        throw error
      }
    })()

    return this._sdkLoading
  }

  /**
   * 构建 SDK 所需环境变量
   * @param {object} profile - API Profile
   * @param {object} configManager - ConfigManager 实例
   */
  buildEnv(profile, configManager) {
    const { buildProcessEnv, buildStandardExtraVars } = require('../utils/env-builder')
    const extraVars = buildStandardExtraVars(configManager)
    return buildProcessEnv(profile, extraVars, configManager)
  }

  /**
   * 创建持久 query（AsyncIterable 模式）
   *
   * @param {MessageQueue} messageQueue - 消息队列（streaming input）
   * @param {object} options - query 选项（cwd, env, model, resume 等）
   * @param {object} sessionRef - 会话引用（用于记录 cliPid）
   * @returns {AsyncIterable} SDK query generator
   */
  async createQuery(messageQueue, options, sessionRef) {
    const queryFn = await this._loadSDK()
    const env = options.env

    const queryOptions = {
      cwd: options.cwd,
      permissionMode: options.permissionMode || 'acceptEdits',
      settingSources: options.settingSources || ['user'],
      includePartialMessages: true,
      env,
      spawnClaudeCodeProcess: (spawnOpts) => {
        // 修正 CLI 路径：SDK 在 asar 里，需重定向到 unpacked
        let cliPath = spawnOpts.args[0]
        if (cliPath && /[\/\\]app\.asar[\/\\]/.test(cliPath) && !cliPath.includes('app.asar.unpacked')) {
          cliPath = cliPath.replace(/[\/\\]app\.asar[\/\\]/g, (match) => {
            return match.replace('app.asar', 'app.asar.unpacked')
          })
          spawnOpts.args[0] = cliPath
          console.log(`[ClaudeCodeRunner] Fixed CLI path: ${cliPath}`)
        }

        const proc = cpSpawn(spawnOpts.command, spawnOpts.args, {
          cwd: spawnOpts.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        })

        if (sessionRef) sessionRef.cliPid = proc.pid || null
        console.log(`[ClaudeCodeRunner] CLI spawned: command=${spawnOpts.command}, args[0]=${spawnOpts.args[0]?.substring(0, 80)}`)

        let stderrData = ''
        if (proc.stderr) {
          proc.stderr.on('data', (data) => {
            const text = data.toString()
            stderrData += text
            console.error(`[ClaudeCodeRunner] CLI stderr: ${text}`)
          })
        }

        proc.on('exit', (code, signal) => {
          console.log(`[ClaudeCodeRunner] CLI exited: code=${code}, signal=${signal}`)
          if (code !== 0 && stderrData) {
            console.error(`[ClaudeCodeRunner] CLI stderr (full):`, stderrData)
          }
          // 将 stderr 和退出码挂到 sessionRef 供 SessionManager 读取
          if (sessionRef) {
            sessionRef._lastCliExitCode = code
            sessionRef._lastCliStderr = stderrData
          }
        })

        return proc
      }
    }

    if (options.onToolPermissionRequest && sessionRef) {
      queryOptions.canUseTool = async (toolName, input, permissionOptions) => {
        const response = await options.onToolPermissionRequest({
          toolName,
          input,
          sessionRef,
          toolUseID: permissionOptions?.toolUseID,
          title: permissionOptions?.title,
          description: permissionOptions?.description,
          displayName: permissionOptions?.displayName,
          blockedPath: permissionOptions?.blockedPath,
          decisionReason: permissionOptions?.decisionReason,
          suggestions: permissionOptions?.suggestions
        })

        if (!response || response.behavior === 'deny') {
          return {
            behavior: 'deny',
            message: response?.message || 'User denied the request',
            toolUseID: permissionOptions?.toolUseID,
            decisionClassification: 'user_reject'
          }
        }

        return {
          behavior: 'allow',
          updatedInput: response.updatedInput,
          updatedPermissions: response.updatedPermissions,
          toolUseID: permissionOptions?.toolUseID,
          decisionClassification: response.decisionClassification || 'user_temporary'
        }
      }
    }

    if (options.model) queryOptions.model = options.model
    if (options.maxTurns) queryOptions.maxTurns = options.maxTurns
    if (options.resume) queryOptions.resume = options.resume
    if (options.mcpServers) queryOptions.mcpServers = options.mcpServers
    if (options.appendSystemPrompt) queryOptions.appendSystemPrompt = options.appendSystemPrompt
    if (options.allowedTools) queryOptions.allowedTools = options.allowedTools
    if (options.disallowedTools) queryOptions.disallowedTools = options.disallowedTools

    console.log('[ClaudeCodeRunner] createQuery options:', {
      cwd: queryOptions.cwd,
      model: queryOptions.model || null,
      resume: queryOptions.resume || null,
      envBaseUrl: env?.ANTHROPIC_BASE_URL || env?.ANTHROPIC_API_URL || null,
      envModel: env?.ANTHROPIC_MODEL || null
    })

    return queryFn({ prompt: messageQueue, options: queryOptions })
  }

  /**
   * 将 SDK 原始消息标准化为内部格式
   *
   * 内部标准格式：
   * { type: 'init', sdkSessionId, tools, model, slashCommands }
   * { type: 'compact_done', preTokens, trigger }
   * { type: 'system_status', status }
   * { type: 'assistant_message', content, uuid, sdkSessionId, usage }
   * { type: 'stream_event', event }
   * { type: 'result', subtype, isError, result, totalCostUsd, numTurns, durationMs, usage, modelUsage }
   * { type: 'tool_progress', toolUseId, toolName, elapsedSeconds }
   * { type: 'unknown', raw }
   *
   * @param {object} rawMsg - SDK 原始消息
   * @returns {object} 标准化消息
   */
  normalizeMessage(rawMsg) {
    switch (rawMsg.type) {
      case 'system':
        if (rawMsg.subtype === 'init') {
          return {
            type: 'init',
            sdkSessionId: rawMsg.session_id,
            tools: rawMsg.tools,
            model: rawMsg.model,
            slashCommands: rawMsg.slash_commands || []
          }
        } else if (rawMsg.subtype === 'compact_boundary') {
          return {
            type: 'compact_done',
            preTokens: rawMsg.compact_metadata?.pre_tokens || 0,
            trigger: rawMsg.compact_metadata?.trigger || 'manual'
          }
        } else if (rawMsg.subtype === 'status') {
          return {
            type: 'system_status',
            status: rawMsg.status
          }
        }
        return { type: 'unknown', raw: rawMsg }

      case 'assistant':
        return {
          type: 'assistant_message',
          content: rawMsg.message?.content || [],
          uuid: rawMsg.uuid,
          sdkSessionId: rawMsg.session_id,
          usage: rawMsg.message?.usage || null
        }

      case 'user':
        return {
          type: 'user_message',
          message: rawMsg.message || null,
          content: rawMsg.message?.content || [],
          parentToolUseId: rawMsg.parent_tool_use_id || null,
          toolUseResult: rawMsg.tool_use_result || null,
          uuid: rawMsg.uuid,
          sdkSessionId: rawMsg.session_id
        }

      case 'stream_event':
        return {
          type: 'stream_event',
          event: rawMsg.event
        }

      case 'result':
        return {
          type: 'result',
          subtype: rawMsg.subtype,
          isError: rawMsg.is_error,
          result: rawMsg.result,
          totalCostUsd: rawMsg.total_cost_usd,
          numTurns: rawMsg.num_turns,
          durationMs: rawMsg.duration_ms,
          usage: rawMsg.usage,
          modelUsage: rawMsg.modelUsage
        }

      case 'tool_progress':
        return {
          type: 'tool_progress',
          toolUseId: rawMsg.tool_use_id,
          toolName: rawMsg.tool_name,
          elapsedSeconds: rawMsg.elapsed_time_seconds
        }

      default:
        console.warn('[ClaudeCodeRunner] Unknown message type:', rawMsg.type, '- SDK may have added new message types')
        return { type: 'unknown', raw: rawMsg }
    }
  }
}

module.exports = ClaudeCodeRunner
