const USER_ROLE = 'user'
const ASSISTANT_ROLE = 'assistant'

export function collectGenerationAssistantText(messages = []) {
  const safeMessages = Array.isArray(messages) ? messages : []
  let startIdx = safeMessages.length - 1

  while (startIdx > 0 && safeMessages[startIdx]?.role !== USER_ROLE) {
    startIdx--
  }

  const assistantTexts = []

  for (let i = startIdx + 1; i < safeMessages.length; i++) {
    const msg = safeMessages[i] || {}
    if (msg.role === ASSISTANT_ROLE && typeof msg.content === 'string' && msg.content.trim()) {
      assistantTexts.push(msg.content.trim())
    }
  }

  return assistantTexts.join('\n\n').trim()
}
