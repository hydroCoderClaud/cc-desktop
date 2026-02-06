/**
 * AI 助手 IPC 处理器
 * 提供独立的 AI 对话功能
 */

const { createIPCHandler } = require('../utils/ipc-utils')
const { countTokens, countMessagesTokens, shouldCompact } = require('../utils/token-counter')
const { LATEST_MODEL_ALIASES } = require('../utils/constants')

// 默认值（会被配置覆盖）
const DEFAULT_MAX_TOKENS = 200000
const DEFAULT_COMPACT_THRESHOLD = 50  // 百分比

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

  // 获取模型名：优先使用 profile.modelMapping，否则使用全局模型
  const tier = profile?.selectedModelTier || 'sonnet'
  let model
  if (profile?.modelMapping?.[tier]?.trim()) {
    // 第三方服务：使用 profile 的模型映射
    model = profile.modelMapping[tier].trim()
  } else {
    // 官方/中转服务：优先使用全局模型配置，留空则使用 latest 别名
    const globalModels = configManager.getGlobalModels()
    model = globalModels[tier]?.trim() || LATEST_MODEL_ALIASES[tier] || LATEST_MODEL_ALIASES.sonnet
  }

  return {
    profile,
    model,
    maxTokens: aiConfig.maxTokens || 2048,
    temperature: aiConfig.temperature ?? 1,
    systemPrompt: aiConfig.systemPrompt || '你是一个有帮助的 AI 助手。请简洁、准确地回答问题。'
  }
}

/**
 * 构建 API 请求的公共配置
 * 根据 authType 区分官方/中转服务 和 第三方服务的认证方式
 */
function buildRequestConfig(profile) {
  const authType = profile.authType || 'api_key'
  const headers = {
    'Content-Type': 'application/json'
  }

  if (authType === 'api_key') {
    // 官方 API 或官方格式中转：使用 x-api-key
    headers['x-api-key'] = profile.authToken
    headers['anthropic-version'] = '2023-06-01'
  } else {
    // 第三方服务（auth_token）：使用 Authorization Bearer
    headers['Authorization'] = `Bearer ${profile.authToken}`
  }

  return {
    baseUrl: `${profile.baseUrl || 'https://api.anthropic.com'}/v1/messages`,
    headers
  }
}

/**
 * 从 API 响应中提取文本内容
 * 兼容 Anthropic 格式（含 thinking）和 OpenAI 格式
 */
function extractContentFromResponse(data) {
  if (data.content && Array.isArray(data.content)) {
    // Anthropic 格式: { content: [{ type: "text", text: "..." }, ...] }
    // 找到 type === "text" 的元素（MiniMax 等可能有 thinking 类型在前面）
    const textBlock = data.content.find(c => c.type === 'text') || data.content[0]
    return textBlock?.text || ''
  } else if (data.choices?.[0]?.message?.content) {
    // OpenAI 格式: { choices: [{ message: { content: "..." } }] }
    return data.choices[0].message.content
  }
  return ''
}

/**
 * 从 API 响应中提取 token 使用信息
 * 兼容 Anthropic 和 OpenAI 格式
 */
function extractUsageFromResponse(data) {
  return {
    inputTokens: data.usage?.input_tokens || data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.output_tokens || data.usage?.completion_tokens || 0
  }
}

/**
 * 构建请求体
 */
function buildRequestBody(model, maxTokens, messages, options = {}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages
  }

  if (options.system) {
    body.system = options.system
  }
  if (options.temperature !== undefined && options.temperature !== 1) {
    body.temperature = options.temperature
  }
  if (options.stream) {
    body.stream = true
  }

  return body
}

/**
 * 发送 API 请求（带超时）
 */
async function sendAPIRequest(profile, requestBody, timeout = 120000) {
  const { baseUrl, headers } = buildRequestConfig(profile)

  // 创建 AbortController 用于超时控制
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: 'API_ERROR',
        message: errorData.error?.message || `API 错误: ${response.status}`
      }
    }

    return { success: true, response }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'TIMEOUT',
        message: '请求超时，请稍后重试'
      }
    }
    throw error
  }
}

/**
 * 验证配置
 */
function validateConfig(profile) {
  if (!profile || !profile.authToken) {
    return {
      success: false,
      error: 'NO_API_KEY',
      message: '请先配置 API Key'
    }
  }
  return null
}

/**
 * 设置 AI 助手的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {Object} configManager - ConfigManager instance
 */
function setupAIHandlers(ipcMain, configManager) {

  /**
   * 发送消息到 AI
   */
  createIPCHandler(ipcMain, 'ai:chat', async (messages) => {
    const { profile, model, maxTokens, temperature, systemPrompt } = getAIConfig(configManager)

    const validationError = validateConfig(profile)
    if (validationError) return validationError

    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
      const requestBody = buildRequestBody(model, maxTokens, apiMessages, {
        system: systemPrompt,
        temperature
      })

      const result = await sendAPIRequest(profile, requestBody)
      if (!result.success) return result

      const data = await result.response.json()
      const { inputTokens, outputTokens } = extractUsageFromResponse(data)

      return {
        success: true,
        data: {
          content: extractContentFromResponse(data),
          inputTokens,
          outputTokens,
          model: data.model
        }
      }
    } catch (error) {
      console.error('AI chat error:', error)
      return { success: false, error: 'NETWORK_ERROR', message: error.message || '网络错误' }
    }
  })

  /**
   * 流式发送消息
   */
  ipcMain.handle('ai:stream', async (event, messages) => {
    const { profile, model, maxTokens, temperature, systemPrompt } = getAIConfig(configManager)

    const validationError = validateConfig(profile)
    if (validationError) return validationError

    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
      const requestBody = buildRequestBody(model, maxTokens, apiMessages, {
        system: systemPrompt,
        temperature,
        stream: true
      })

      const result = await sendAPIRequest(profile, requestBody)
      if (!result.success) return result

      // 读取流式响应
      const reader = result.response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let inputTokens = 0
      let outputTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            if (json.type === 'content_block_delta') {
              const text = json.delta?.text || ''
              fullContent += text
              event.sender.send('ai:stream-chunk', { text })
            } else if (json.type === 'message_delta') {
              outputTokens = json.usage?.output_tokens || 0
            } else if (json.type === 'message_start') {
              inputTokens = json.message?.usage?.input_tokens || 0
            }
          } catch (e) { /* 忽略解析错误 */ }
        }
      }

      event.sender.send('ai:stream-end', { content: fullContent, inputTokens, outputTokens })
      return { success: true, data: { content: fullContent, inputTokens, outputTokens } }
    } catch (error) {
      console.error('AI stream error:', error)
      event.sender.send('ai:stream-error', { message: error.message })
      return { success: false, error: 'NETWORK_ERROR', message: error.message || '网络错误' }
    }
  })

  /**
   * 压缩对话历史
   */
  createIPCHandler(ipcMain, 'ai:compact', async (messages) => {
    const { profile, model } = getAIConfig(configManager)

    const validationError = validateConfig(profile)
    if (validationError) return validationError

    try {
      const compactPrompt = `请将以下对话历史压缩成一个简洁的摘要，保留关键信息和上下文。摘要应该让 AI 能够继续对话而不丢失重要背景。

对话历史：
${messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n')}

请直接输出摘要，不要加任何前缀或解释。`

      const requestBody = buildRequestBody(model, 1024, [{ role: 'user', content: compactPrompt }])
      const result = await sendAPIRequest(profile, requestBody)
      if (!result.success) return result

      const data = await result.response.json()
      const summary = extractContentFromResponse(data)

      return { success: true, data: { summary, tokens: countTokens(summary) } }
    } catch (error) {
      console.error('AI compact error:', error)
      return { success: false, error: 'NETWORK_ERROR', message: error.message || '网络错误' }
    }
  })

  /**
   * 计算消息的 token 数
   * @param {Array} messages - 消息数组
   * @returns {Object} - {tokens, shouldCompact}
   */
  createIPCHandler(ipcMain, 'ai:countTokens', (messages) => {
    const aiConfig = configManager.getAIAssistantConfig()
    const maxTokens = aiConfig.contextMaxTokens || DEFAULT_MAX_TOKENS
    const thresholdPercent = aiConfig.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD
    const threshold = thresholdPercent / 100  // 转为小数

    const tokens = countMessagesTokens(messages)
    return {
      tokens,
      maxTokens,
      threshold: thresholdPercent,
      shouldCompact: shouldCompact(tokens, maxTokens, threshold),
      percentage: Math.round((tokens / maxTokens) * 100)
    }
  })
}

module.exports = { setupAIHandlers }
