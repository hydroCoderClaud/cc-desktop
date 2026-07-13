import { computed, readonly, ref } from 'vue'

export const SettingsSection = Object.freeze({
  MODELS: 'models',
  CHANNELS: 'channels',
  GENERAL: 'general',
  APPEARANCE: 'appearance',
  CAPABILITIES: 'capabilities',
  SESSION_APPS: 'session-apps',
  UPDATES: 'updates'
})

const knownSections = new Set(Object.values(SettingsSection))
const settingsRequest = ref(null)

const normalizeText = (value) => typeof value === 'string' ? value.trim() : ''

const normalizeRequest = (request = {}) => {
  const section = knownSections.has(request.section)
    ? request.section
    : SettingsSection.MODELS
  const context = request.context || {}

  return {
    section,
    context: {
      mode: normalizeText(context.mode) || null,
      cwd: normalizeText(context.cwd) || null,
      sessionAppId: normalizeText(context.sessionAppId) || null
    }
  }
}

export function useSettingsNavigation() {
  const isSettingsOpen = computed(() => settingsRequest.value !== null)

  const openSettings = (request = {}) => {
    settingsRequest.value = normalizeRequest(request)
  }

  const closeSettings = () => {
    settingsRequest.value = null
  }

  return {
    settingsRequest: readonly(settingsRequest),
    isSettingsOpen,
    openSettings,
    closeSettings
  }
}
