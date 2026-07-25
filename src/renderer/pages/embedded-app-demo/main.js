import './styles.css'
import { setPageTitle } from '@/utils/page-bootstrap'
import {
  buildAutoInteractionResponse,
  extractAssistantMessageText,
  extractStreamText,
  getInteractionRequest
} from './agent-event-format'

setPageTitle('embeddedAppDemo')

function renderFatalError(error) {
  const message = error?.message || String(error || '')
  const stack = error?.stack || ''
  document.body.innerHTML = `
    <div style="padding: 24px; color: #b91c1c; font-family: sans-serif;">
      <h2>Embedded Demo 初始化失败</h2>
      <pre style="white-space: pre-wrap;">${message}\n${stack}</pre>
    </div>
  `
}

try {
  const bridgeStatusEl = document.getElementById('bridgeStatus')
  const clientStatusEl = document.getElementById('clientStatus')
  const sessionStatusEl = document.getElementById('sessionStatus')
  const appIdInput = document.getElementById('appIdInput')
  const cwdInput = document.getElementById('cwdInput')
  const cwdPreview = document.getElementById('cwdPreview')
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
    busy: false,
    clientId: null,
    defaultCwd: '',
    sessionId: null,
    unsubscribeEvents: null,
    currentAssistantMessageEl: null
  }

  function withTimeout(promise, label, timeoutMs = 8000) {
    let timer = null
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    })
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer)
    })
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
      : state.busy
        ? 'connecting...'
      : 'disconnected'
    sessionStatusEl.textContent = state.sessionId || 'none'
    sessionMetaEl.textContent = state.sessionId
      ? `Session: ${state.sessionId}`
      : 'No session'
    if (cwdPreview) {
      cwdPreview.textContent = cwdInput.value.trim() || state.defaultCwd || 'Connect 后显示当前 app 默认目录'
    }
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
        message: 'window.hydroAgent is not available. Open this page inside JSHP Desktop.'
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

    state.busy = true
    updateStatus()
    appendEvent('connect:start', { appId })

    try {
      const result = await withTimeout(window.hydroAgent.connect({
        appId,
        clientMeta: {
          page: 'embedded-agent-demo',
          version: '0.1.0'
        }
      }), 'hydroAgent.connect')

      state.connected = true
      state.clientId = result.clientId || null
      state.defaultCwd = result.defaultCwd || ''
      if (state.defaultCwd && !cwdInput.value.trim()) {
        cwdInput.value = state.defaultCwd
      }
      updateStatus()
      appendEvent('connect:ok', result)
    } finally {
      state.busy = false
      updateStatus()
    }
  }

  async function createSession() {
    if (!state.connected) {
      appendEvent('session:error', { message: 'connect first' })
      return
    }

    const options = {
      cwd: cwdInput.value.trim() || state.defaultCwd,
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
        const content = extractAssistantMessageText(event)
        if (state.currentAssistantMessageEl) {
          state.currentAssistantMessageEl.textContent = content || state.currentAssistantMessageEl.textContent
        } else {
          state.currentAssistantMessageEl = addMessage('agent', content)
        }
      }

      if (event.channel === 'agent:stream') {
        const chunk = extractStreamText(event)
        if (!state.currentAssistantMessageEl) {
          state.currentAssistantMessageEl = addMessage('agent', '')
        }
        state.currentAssistantMessageEl.textContent += chunk
      }

      if (event.channel === 'agent:result') {
        state.currentAssistantMessageEl = null
      }

      if (event.channel === 'agent:interactionRequest') {
        const interaction = getInteractionRequest(event)
        const interactionId = interaction?.interactionId
        const kind = interaction?.kind

        if (interactionId && kind === 'ask_user_question') {
          await window.hydroAgent.respondInteraction(
            session.id,
            interactionId,
            buildAutoInteractionResponse(interaction)
          )
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

  cwdInput.addEventListener('input', updateStatus)

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
} catch (error) {
  renderFatalError(error)
}
