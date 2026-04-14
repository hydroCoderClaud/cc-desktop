import { parseMcpToolResult } from '../../../utils/mcp-tool-result.js'

const USER_ROLE = 'user'
const ASSISTANT_ROLE = 'assistant'

const getGenerationTurnStart = (messages = []) => {
  const safeMessages = Array.isArray(messages) ? messages : []
  let startIdx = safeMessages.length - 1

  while (startIdx > 0 && safeMessages[startIdx]?.role !== USER_ROLE) {
    startIdx--
  }

  return { safeMessages, startIdx }
}

export function collectGenerationAssistantText(messages = []) {
  const { safeMessages, startIdx } = getGenerationTurnStart(messages)

  const assistantTexts = []

  for (let i = startIdx + 1; i < safeMessages.length; i++) {
    const msg = safeMessages[i] || {}
    if (msg.role === ASSISTANT_ROLE && typeof msg.content === 'string' && msg.content.trim()) {
      assistantTexts.push(msg.content.trim())
    }
  }

  return assistantTexts.join('\n\n').trim()
}

export function collectGenerationResult(messages = [], platform = 'win32') {
  const { safeMessages, startIdx } = getGenerationTurnStart(messages)
  const assistantText = collectGenerationAssistantText(safeMessages)
  const filePaths = []
  let imageCount = 0

  for (let i = startIdx + 1; i < safeMessages.length; i++) {
    const msg = safeMessages[i] || {}
    if (msg.role !== 'tool' || !msg.output) continue

    const parsed = parseMcpToolResult(msg.output, { platform })
    parsed.filePaths.forEach(path => filePaths.push(path))
    imageCount += parsed.images.length
  }

  return {
    assistantText,
    filePaths: [...new Set(filePaths)],
    imageCount
  }
}
