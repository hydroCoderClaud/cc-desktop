import { ref, readonly } from 'vue'
import { useIPC } from './useIPC'

const embeddedWorkbenchMenuVisible = ref(false)
let visibilityInitialization = null
let settingsCleanup = null

const applyEmbeddedWorkbenchMenuVisibility = (settings) => {
  if (settings?.embeddedApps?.showInMenu !== undefined) {
    embeddedWorkbenchMenuVisible.value = settings.embeddedApps.showInMenu === true
  }
}

const initEmbeddedWorkbenchMenuVisibility = async () => {
  if (visibilityInitialization) return visibilityInitialization

  visibilityInitialization = (async () => {
    try {
      const config = await window.electronAPI?.getConfig?.()
      applyEmbeddedWorkbenchMenuVisibility(config?.settings)
    } catch (err) {
      console.error('[useEmbeddedApps] Failed to load workbench menu visibility:', err)
    }

    if (!settingsCleanup && window.electronAPI?.onSettingsChanged) {
      settingsCleanup = window.electronAPI.onSettingsChanged((settings) => {
        applyEmbeddedWorkbenchMenuVisibility(settings)
      })
    }
  })()

  return visibilityInitialization
}

export function useEmbeddedApps() {
  const { invoke } = useIPC()
  const embeddedApps = ref([])
  const loading = ref(false)

  const loadEmbeddedApps = async () => {
    loading.value = true
    try {
      const result = await invoke('embedded-app:list')
      embeddedApps.value = Array.isArray(result) ? result : []
      return embeddedApps.value
    } finally {
      loading.value = false
    }
  }

  const openEmbeddedApp = async (menuKey) => {
    return invoke('embedded-app:open', menuKey)
  }

  return {
    embeddedApps,
    loading,
    embeddedWorkbenchMenuVisible: readonly(embeddedWorkbenchMenuVisible),
    initEmbeddedWorkbenchMenuVisibility,
    loadEmbeddedApps,
    openEmbeddedApp
  }
}
