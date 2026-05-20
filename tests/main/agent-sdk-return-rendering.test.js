import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const useAgentChatPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentChat.js')
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const notebookChatPanelPath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/ChatPanel.vue')
const messageBubblePath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/MessageBubble.vue')
const toolCallCardPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ToolCallCard.vue')

describe('agent sdk return rendering', () => {
  it('tracks visible output and adds result fallback system messages', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')

    expect(source).toContain('currentTurnHasVisibleOutput')
    expect(source).toContain('addSystemMessage')
    expect(source).toContain("t('agent.commandCompleted'")
    expect(source).toContain('summarizeResultText(result?.result)')
  })

  it('listens to system status and passthrough sdk events', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')
    const preloadSource = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain('handleSystemStatus')
    expect(source).toContain('handleOtherMessage')
    expect(source).toContain('isHiddenStructuredSystemStatus')
    expect(source).toContain("subtype.startsWith('task_')")
    expect(source).toContain('if (isHiddenStructuredSystemStatus(value)) {')
    expect(source).toContain('onAgentSystemStatus')
    expect(source).toContain('onAgentOtherMessage')
    expect(preloadSource).toContain("['onAgentOtherMessage', 'agent:otherMessage']")
  })

  it('renders system messages in agent and notebook chat views', () => {
    const agentChatTab = fs.readFileSync(agentChatTabPath, 'utf-8')
    const notebookChatPanel = fs.readFileSync(notebookChatPanelPath, 'utf-8')
    const messageBubble = fs.readFileSync(messageBubblePath, 'utf-8')

    expect(agentChatTab).toContain("msg.role === 'system'")
    expect(notebookChatPanel).toContain("msg.role === 'system'")
    expect(messageBubble).toContain("props.message.role === 'system'")
  })

  it('shows tool progress metadata instead of treating it as plain output', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')
    const toolCallCard = fs.readFileSync(toolCallCardPath, 'utf-8')

    expect(source).toContain('toolMessage.progressText = formatElapsedSeconds(data.elapsedSeconds)')
    expect(source).toContain('toolMessage.inProgress = !toolMessage.output')
    expect(toolCallCard).toContain('message.progressText ||')
  })
})
