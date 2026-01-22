/**
 * AI 助手 IPC 处理器
 * 提供独立的 AI 对话功能
 */

const { createIPCHandler } = require('../utils/ipc-utils')
const { countTokens, countMessagesTokens, shouldCompact } = require('../utils/token-counter')

// 常量
const MAX_TOKENS = 200000
const COMPACT_THRESHOLD = 0.5

/**
 * 获取 AI 助手使用的 profile 和配置
 */
function getAIConfig(configManager) {
  const aiConfig = configManager.getAIAssistantConfig()

  // 获取 profile（优先使用指定的，否则使用默认的）
  let profile = null
  if (aiConfig.profileId) {
    profile = configManager.getAPIProfile(aiConfig.profileId)
  }
  if (!profile) {
    profile = configManager.getDefaultProfile()
  }

  return {
    profile,
    model: aiConfig.model || 'claude-3-haiku-20240307',
    maxTokens: aiConfig.maxTokens || 2048,
    temperature: aiConfig.temperature ?? 1,
    systemPrompt: aiConfig.systemPrompt || '你是一个有帮助的 AI 助手。请简洁、准确地回答问题。'
  }
}

/**
 * 设置 AI 助手的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {Object} configManager - ConfigManager instance
 */
function setupAIHandlers(ipcMain, configManager) {

  /**
   * 发送消息到 AI
   * @param {Array} messages - 消息数组 [{role, content}]
   * @returns {Object} - {success, data: {content, inputTokens, outputTokens}, error}
   */
  createIPCHandler(ipcMain, 'ai:chat', async (messages) => {
    const { profile, model, maxTokens, temperature, systemPrompt } = getAIConfig(configManager)

    if (!profile || !profile.authToken) {
      return {
        success: false,
        error: 'NO_API_KEY',
        message: '请先配置 API Key'
      }
    }

    try {
      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }))

      const requestBody = {
        model,
        max_tokens: maxTokens,
        messages: apiMessages
      }

      // 只在有 systemPrompt 时添加
      if (systemPrompt) {
        requestBody.system = systemPrompt
      }

      // 只在 temperature 不为 1 时添加（1 是默认值）
      if (temperature !== 1) {
        requestBody.temperature = temperature
      }

      const response = await fetch(`${profile.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.authToken,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: 'API_ERROR',
          message: errorData.error?.message || `API 错误: ${response.status}`
        }
      }

      const data = await response.json()

      return {
        success: true,
        data: {
          content: data.content?.[0]?.text || '',
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
          model: data.model
        }
      }
    } catch (error) {
      console.error('AI chat error:', error)
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || '网络错误'
      }
    }
  })

  /**
   * 流式发送消息
   * @param {Object} event - IPC event (用于发送流数据)
   * @param {Array} messages - 消息数组
   */
  ipcMain.handle('ai:stream', async (event, messages) => {
    const { profile, model, maxTokens, temperature, systemPrompt } = getAIConfig(configManager)

    if (!profile || !profile.authToken) {
      return {
        success: false,
        error: 'NO_API_KEY',
        message: '请先配置 API Key'
      }
    }

    try {
      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }))

      const requestBody = {
        model,
        max_tokens: maxTokens,
        messages: apiMessages,
        stream: true
      }

      if (systemPrompt) {
        requestBody.system = systemPrompt
      }

      if (temperature !== 1) {
        requestBody.temperature = temperature
      }

      const response = await fetch(`${profile.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.authToken,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: 'API_ERROR',
          message: errorData.error?.message || `API 错误: ${response.status}`
        }
      }

      // 读取流式响应
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let inputTokens = 0
      let outputTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)

              if (json.type === 'content_block_delta') {
                const text = json.delta?.text || ''
                fullContent += text
                // 发送增量到前端
                event.sender.send('ai:stream-chunk', { text })
              } else if (json.type === 'message_delta') {
                outputTokens = json.usage?.output_tokens || 0
              } else if (json.type === 'message_start') {
                inputTokens = json.message?.usage?.input_tokens || 0
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 发送完成信号
      event.sender.send('ai:stream-end', {
        content: fullContent,
        inputTokens,
        outputTokens
      })

      return {
        success: true,
        data: {
          content: fullContent,
          inputTokens,
          outputTokens
        }
      }
    } catch (error) {
      console.error('AI stream error:', error)
      event.sender.send('ai:stream-error', { message: error.message })
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || '网络错误'
      }
    }
  })

  /**
   * 压缩对话历史
   * @param {Array} messages - 消息数组
   * @returns {Object} - {success, data: {summary, tokens}}
   */
  createIPCHandler(ipcMain, 'ai:compact', async (messages) => {
    const { profile, model } = getAIConfig(configManager)

    if (!profile || !profile.authToken) {
      return {
        success: false,
        error: 'NO_API_KEY',
        message: '请先配置 API Key'
      }
    }

    try {
      // 构建压缩请求
      const compactPrompt = `请将以下对话历史压缩成一个简洁的摘要，保留关键信息和上下文。摘要应该让 AI 能够继续对话而不丢失重要背景。

对话历史：
${messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n')}

请直接输出摘要，不要加任何前缀或解释。`

      const response = await fetch(`${profile.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.authToken,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: compactPrompt }]
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: 'API_ERROR',
          message: errorData.error?.message || `API 错误: ${response.status}`
        }
      }

      const data = await response.json()
      const summary = data.content?.[0]?.text || ''

      return {
        success: true,
        data: {
          summary,
          tokens: countTokens(summary)
        }
      }
    } catch (error) {
      console.error('AI compact error:', error)
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || '网络错误'
      }
    }
  })

  /**
   * 计算消息的 token 数
   * @param {Array} messages - 消息数组
   * @returns {Object} - {tokens, shouldCompact}
   */
  createIPCHandler(ipcMain, 'ai:countTokens', (messages) => {
    const tokens = countMessagesTokens(messages)
    return {
      tokens,
      maxTokens: MAX_TOKENS,
      threshold: COMPACT_THRESHOLD,
      shouldCompact: shouldCompact(tokens, MAX_TOKENS, COMPACT_THRESHOLD),
      percentage: Math.round((tokens / MAX_TOKENS) * 100)
    }
  })
}

module.exports = { setupAIHandlers }
