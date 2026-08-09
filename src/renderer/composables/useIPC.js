/**
 * IPC communication wrapper.
 */
import { ref } from 'vue'

// Browser-only fallback for the profile list page.
const mockData = {
  listAPIProfiles: () => []
}

export function useIPC() {
  const loading = ref(false)
  const error = ref(null)

  const invoke = async (method, ...args) => {
    loading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        console.warn(`[useIPC] electronAPI not available, using mock for: ${method}`)
        if (mockData[method]) return mockData[method](...args)
        throw new Error(`electronAPI not available (mock not found for: ${method})`)
      }

      if (typeof window.electronAPI[method] !== 'function') {
        throw new Error(`Method ${method} not found in electronAPI`)
      }

      return await window.electronAPI[method](...args)
    } catch (err) {
      error.value = err.message || String(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const silentInvoke = async (method, ...args) => {
    try {
      if (!window.electronAPI || typeof window.electronAPI[method] !== 'function') {
        throw new Error(`Method ${method} not available`)
      }
      return await window.electronAPI[method](...args)
    } catch (err) {
      console.error(`IPC call ${method} failed:`, err)
      throw err
    }
  }

  return { loading, error, invoke, silentInvoke }
}

export function useIPCWithRetry(maxRetries = 3) {
  const { invoke, loading, error } = useIPC()

  const invokeWithRetry = async (method, ...args) => {
    let lastError = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await invoke(method, ...args)
      } catch (err) {
        lastError = err
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
    }

    throw lastError
  }

  return { invoke: invokeWithRetry, loading, error }
}
