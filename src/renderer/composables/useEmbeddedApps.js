import { ref } from 'vue'
import { useIPC } from './useIPC'

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
    loadEmbeddedApps,
    openEmbeddedApp
  }
}
