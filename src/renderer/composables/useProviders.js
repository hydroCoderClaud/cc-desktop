/**
 * 服务商定义管理组合式函数
 */
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'

export function useProviders() {
  const { invoke } = useIPC()

  const providers = ref([])
  const loading = ref(false)
  const error = ref(null)

  /**
   * 内置服务商
   */
  const builtInProviders = computed(() => {
    return providers.value.filter(p => p.isBuiltIn)
  })

  /**
   * 自定义服务商
   */
  const customProviders = computed(() => {
    return providers.value.filter(p => !p.isBuiltIn)
  })

  /**
   * 加载所有服务商
   */
  const loadProviders = async () => {
    loading.value = true
    error.value = null

    try {
      providers.value = await invoke('listProviders')
    } catch (err) {
      error.value = err.message
      console.error('Failed to load providers:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取单个服务商
   */
  const getProvider = async (id) => {
    try {
      return await invoke('getProvider', id)
    } catch (err) {
      console.error('Failed to get provider:', err)
      throw err
    }
  }

  /**
   * 添加服务商
   */
  const addProvider = async (definition) => {
    try {
      const result = await invoke('addProvider', definition)
      await loadProviders()
      return result
    } catch (err) {
      console.error('Failed to add provider:', err)
      throw err
    }
  }

  /**
   * 更新服务商
   */
  const updateProvider = async (id, updates) => {
    try {
      const result = await invoke('updateProvider', { id, updates })
      await loadProviders()
      return result
    } catch (err) {
      console.error('Failed to update provider:', err)
      throw err
    }
  }

  /**
   * 删除服务商
   */
  const deleteProvider = async (id) => {
    try {
      const result = await invoke('deleteProvider', id)
      await loadProviders()
      return result
    } catch (err) {
      console.error('Failed to delete provider:', err)
      throw err
    }
  }

  /**
   * 检查服务商是否可删除
   */
  const canDelete = (provider) => {
    return !provider.isBuiltIn
  }

  /**
   * 检查服务商是否可编辑（内置和自定义都可编辑）
   */
  const canEdit = (provider) => {
    return true
  }

  return {
    providers,
    builtInProviders,
    customProviders,
    loading,
    error,
    loadProviders,
    getProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    canDelete,
    canEdit
  }
}
