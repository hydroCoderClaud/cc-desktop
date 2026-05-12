import './styles.css'
import { setPageTitle } from '@/utils/page-bootstrap'

setPageTitle('embeddedAppDemo')

(function bootstrapEmbeddedAgentMinimal() {
  const bridgeStatusEl = document.getElementById('bridgeStatus')
  const clientStatusEl = document.getElementById('clientStatus')
  const sessionStatusEl = document.getElementById('sessionStatus')
  const appIdInput = document.getElementById('appIdInput')
  const cwdInput = document.getElementById('cwdInput')
  const sessionMetaEl = document.getElementById('sessionMeta')
  const messageInput = document.getElementById('messageInput')
  const messageList = document.getElementById('messageList')
  const eventLog = document.getElementById('eventLog')
  const themeValueEl = document.getElementById('themeValue')
  const schemeValueEl = document.getElementById('schemeValue')
  const localeValueEl = document.getElementById('localeValue')

  const connectBtn = document.getElementById('connectBtn')
  const newSessionBtn = document.getElementById('newSessionBtn')
  const sendBtn = document.getElementById('sendBtn')
  const cancelBtn = document.getElementById('cancelBtn')
  const closeBtn = document.getElementById('closeBtn')
  const clearEventsBtn = document.getElementById('clearEventsBtn')

  const state = {
    connected: false,
    clientId: null,
    sessionId: null,
    unsubscribeEvents: null,
    currentAssistantMessageEl: null
  }

  function appendEvent(kind, payload) {
    const stamp = new Date().toLocaleTimeString()
    const block = `[${stamp}] ${kind}\n${JSON.stringify(payload, null, 2)}\n\n`
    eventLog.textContent = block + eventLog.textContent
  }

  function setTheme(snapshot) {
    if (!snapshot) return
    document.documentElement.setAttribute('data-theme', snapshot.theme || 'light')
    document.documentElement.setAttribute('data-color-scheme', snapshot.colorScheme || 'claude')
    document.documentElement.setAttribute('data-locale', snapshot.locale || 'zh-CN')
    themeValueEl.textContent = snapshot.theme || 'light'
    schemeValueEl.textContent = snapshot.colorScheme || 'claude'
    localeValueEl.textContent = snapshot.locale || 'zh-CN'
  }

  function updateStatus() {
    bridgeStatusEl.textContent = window.hydroAgent ? 'available' : 'missing'
    clientStatusEl.textContent = state.connected
      ? `connected (${state.clientId || 'unknown'})`
      : 'disconnected'
    sessionStatusEl.textContent = state.sessionId || 'none'
    sessionMetaEl.textContent = state.sessionId
      ? `Session: ${state.sessionId}`
      : 'No session'
  }

  function addMessage(role, text) {
    const wrapper = document.createElement('div')
    wrapper.className = `message-item ${role}`

    const roleEl = document.createElement('div')
    roleEl.className = 'message-role'
    roleEl.textContent = role

    const textEl = document.createElement('div')
    textEl.className = 'message-text'
    textEl.textContent = text || ''

    wrapper.appendChild(roleEl)
    wrapper.appendChild(textEl)
    messageList.appendChild(wrapper)
    messageList.scrollTop = messageList.scrollHeight
    return textEl
  }

  function ensureEmbeddedBridge() {
    if (!window.hydroAgent) {
      appendEvent('bootstrap:error', {
        message: 'window.hydroAgent is not available. Open this page inside Hydro Desktop.'
      })
      return false
    }
    return true
  }

  async function connect() {
    if (!ensureEmbeddedBridge()) return

    const appId = appIdInput.value.trim()
    if (!appId) {
      appendEvent('connect:error', { message: 'appId is required' })
      return
    }

    const result = await window.hydroAgent.connect({
      appId,
      clientMeta: {
        page: 'embedded-agent-demo',
        version: '0.1.0'
      }
    })

    state.connected = true
    state.clientId = result.clientId || null
    updateStatus()
    appendEvent('connect:ok', result)
  }

  async function createSession() {
    if (!state.connected) {
      appendEvent('session:error', { message: 'connect first' })
      return
    }

    const options = {
      cwd: cwdInput.value.trim(),
      title: 'Embedded Minimal Demo'
    }

    const session = await window.hydroAgent.createSession(options)
    state.sessionId = session.id
    state.currentAssistantMessageEl = null

    if (state.unsubscribeEvents) {
      state.unsubscribeEvents()
    }

    state.unsubscribeEvents = window.hydroAgent.onEvent(session.id, async (event) => {
      appendEvent(event.channel, event.payload)

      if (event.channel === 'agent:message') {
        const content = event.payload?.message?.content
          || event.payload?.content
          || event.payload?.text
          || ''
        state.currentAssistantMessageEl = addMessage('agent', content)
      }

      if (event.channel === 'agent:stream') {
        const chunk = event.payload?.delta
          || event.payload?.textDelta
          || event.payload?.text
          || ''
        if (!state.currentAssistantMessageEl) {
          state.currentAssistantMessageEl = addMessage('agent', '')
        }
        state.currentAssistantMessageEl.textContent += chunk
      }

      if (event.channel === 'agent:result') {
        state.currentAssistantMessageEl = null
      }

      if (event.channel === 'agent:interactionRequest') {
        const interactionId = event.payload?.interactionId
        const kind = event.payload?.kind

        if (interactionId && kind === 'ask_user_question') {
          await window.hydroAgent.respondInteraction(session.id, interactionId, {
            answers: ['示例页自动确认：继续执行']
          })
          appendEvent('interaction:auto-response', {
            interactionId,
            note: 'auto-responded by minimal demo'
          })
        }
      }
    })

    updateStatus()
    appendEvent('session:created', session)
  }

  async function sendMessage() {
    if (!state.sessionId) {
      appendEvent('send:error', { message: 'create a session first' })
      return
    }

    const text = messageInput.value.trim()
    if (!text) return

    addMessage('user', text)
    await window.hydroAgent.sendMessage(state.sessionId, {
      message: text
    })
    messageInput.value = ''
  }

  async function cancelSession() {
    if (!state.sessionId) return
    await window.hydroAgent.cancel(state.sessionId)
    appendEvent('session:cancel', { sessionId: state.sessionId })
  }

  async function closeSession() {
    if (!state.sessionId) return
    await window.hydroAgent.close(state.sessionId)
    appendEvent('session:close', { sessionId: state.sessionId })
    state.sessionId = null
    state.currentAssistantMessageEl = null
    updateStatus()
  }

  function bindThemeBridge() {
    if (!window.hydroHostTheme) return
    setTheme(window.hydroHostTheme.getSnapshot())
    window.hydroHostTheme.onThemeChanged((snapshot) => {
      setTheme(snapshot)
      appendEvent('theme:changed', snapshot)
    })
  }

  connectBtn.addEventListener('click', () => {
    connect().catch((error) => appendEvent('connect:error', { message: error.message }))
  })

  newSessionBtn.addEventListener('click', () => {
    createSession().catch((error) => appendEvent('session:error', { message: error.message }))
  })

  sendBtn.addEventListener('click', () => {
    sendMessage().catch((error) => appendEvent('send:error', { message: error.message }))
  })

  cancelBtn.addEventListener('click', () => {
    cancelSession().catch((error) => appendEvent('cancel:error', { message: error.message }))
  })

  closeBtn.addEventListener('click', () => {
    closeSession().catch((error) => appendEvent('close:error', { message: error.message }))
  })

  clearEventsBtn.addEventListener('click', () => {
    eventLog.textContent = ''
  })

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      sendMessage().catch((error) => appendEvent('send:error', { message: error.message }))
    }
  })

  updateStatus()
  bindThemeBridge()
  appendEvent('bootstrap', {
    bridgeAvailable: !!window.hydroAgent,
    themeBridgeAvailable: !!window.hydroHostTheme
  })
})()
