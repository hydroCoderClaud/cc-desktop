/**
 * IPC 通信封装
 * 提供统一的 IPC 调用接口和错误处理
 */
import { ref } from 'vue'

/**
 * 创建 IPC 调用封装
 */
export function useIPC() {
  const loading = ref(false)
  const error = ref(null)

  /**
   * 调用 electronAPI 方法
   * @param {string} method - 方法名
   * @param  {...any} args - 参数
   * @returns {Promise<any>}
   */
  const invoke = async (method, ...args) => {
    loading.value = true
    error.value = null

    try {
      if (!window.electronAPI) {
        throw new Error('electronAPI not available')
      }

      if (typeof window.electronAPI[method] !== 'function') {
        throw new Error(`Method ${method} not found in electronAPI`)
      }

      const result = await window.electronAPI[method](...args)
      return result
    } catch (err) {
      error.value = err.message || String(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 静默调用（不更新 loading 状态）
   */
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

  return {
    loading,
    error,
    invoke,
    silentInvoke
  }
}

/**
 * 创建带自动重试的 IPC 调用
 */
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

  return {
    invoke: invokeWithRetry,
    loading,
    error
  }
}
