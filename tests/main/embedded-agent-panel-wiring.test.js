import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const panelPath = path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue')
const adapterPath = path.resolve(__dirname, '../../src/renderer/components/embedded-agent/hydro-agent-api-adapter.js')
const hydrologyMainPath = path.resolve(__dirname, '../../src/renderer/pages/hydrology-workbench/main.js')
const hydrologyHtmlPath = path.resolve(__dirname, '../../src/renderer/pages/hydrology-workbench/index.html')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const useAgentChatPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentChat.js')
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')

describe('embedded agent panel wiring', () => {
  it('reuses the existing AgentChatTab instead of custom chat rendering', () => {
    const source = fs.readFileSync(panelPath, 'utf-8')

    expect(source).toContain("AgentChatTab from '@/pages/main/components/AgentChatTab.vue'")
    expect(source).toContain('window.hydroAgent.connect')
    expect(source).toContain('window.hydroAgent.listSessions()')
    expect(source).toContain('findLatestSession')
    expect(source).toContain('reopenSessionIfNeeded')
    expect(source).toContain('reopenAgentSession')
    expect(source).toContain('embedded-agent:last-session:')
    expect(source).toContain('window.localStorage.getItem')
    expect(source).toContain('window.localStorage.setItem')
    expect(source).toContain('createHydroAgentApiAdapter')
    expect(source).toContain('window.electronAPI.getEmbeddedAppPreferences')
    expect(source).toContain('window.electronAPI.updateEmbeddedAppPreferences')
    expect(source).toContain('window.electronAPI.listAPIProfiles')
    expect(source).toContain('switchAgentApiProfile')
    expect(source).toContain('persistAppPreferences')
    expect(source).toContain(':api-profile-id="currentApiProfileId"')
    expect(source).toContain(':model-id="currentModelId"')
    expect(source).toContain('embedded-profile-switcher')
    expect(source).toContain(':agent-api="agentApi"')
    expect(source).toContain('@model-selected="handleModelSelected"')
    expect(source).toContain('@request-clear-session="handleClearSession"')
    expect(source).toContain('contextProvider')
  })

  it('maps AgentChatTab agent API calls onto the embedded hydroAgent bridge', () => {
    const source = fs.readFileSync(adapterPath, 'utf-8')

    expect(source).toContain('createAgentSession: (options) => hydroAgent.createSession(options)')
    expect(source).toContain('switchAgentApiProfile: ({ sessionId, profileId }) => hydroAgent.switchApiProfile(sessionId, profileId)')
    expect(source).toContain('clearAndRecreateAgentSession')
    expect(source).toContain('sendAgentMessage: ({ sessionId, message, model, modelTier, maxTurns }) =>')
    expect(source).toContain('hydroAgent.onEvent(null')
    expect(source).toContain("'agent:message': 'onAgentMessage'")
    expect(source).toContain("'agent:stream': 'onAgentStream'")
  })

  it('lets embedded hosts send current business context through AgentChatTab', () => {
    const source = fs.readFileSync(agentChatTabPath, 'utf-8')
    const composableSource = fs.readFileSync(useAgentChatPath, 'utf-8')

    expect(source).toContain('agentApi:')
    expect(source).toContain('agentApi: props.agentApi')
    expect(source).toContain("defineEmits(['ready', 'preview-image', 'preview-link', 'preview-path', 'agent-done', 'request-clear-session', 'model-selected'])")
    expect(source).toContain("emit('model-selected', { modelId: normalizedModelId })")
    expect(composableSource).toContain('const agentApi = options.agentApi')
    expect(composableSource).toContain('await agentApi.sendAgentMessage(sendOptions)')
    expect(source).toContain('sendMessage: (text) => handleSend(text)')
  })

  it('keeps hydroAgent sendMessage options when bridging embedded requests', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain('payload.options || {}')
    expect(source).toContain('payload.model || payload.modelTier || payload.options?.model')
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:clearAndRecreate'")
  })

  it('mounts the reusable panel inside hydrology workbench', () => {
    const mainSource = fs.readFileSync(hydrologyMainPath, 'utf-8')
    const htmlSource = fs.readFileSync(hydrologyHtmlPath, 'utf-8')

    expect(htmlSource).toContain('id="hydrologyAgentPanel"')
    expect(mainSource).toContain("mountHydrologyAgentPanel")
    expect(mainSource).toContain("appId: 'hydrology-workbench'")
    expect(mainSource).toContain('agentPanel?.notifyContextChanged()')
  })
})
