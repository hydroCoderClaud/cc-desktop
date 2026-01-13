/**
 * 自定义模型管理组合式函数
 */
import { ref } from 'vue'
import { useIPC } from './useIPC'

export function useCustomModels() {
  const { invoke } = useIPC()

  const models = ref([])
  const loading = ref(false)
  const error = ref(null)
  const currentProfileId = ref(null)

  /**
   * 加载指定 Profile 的自定义模型
   */
  const loadModels = async (profileId) => {
    loading.value = true
    error.value = null
    currentProfileId.value = profileId

    try {
      models.value = await invoke('getCustomModels', profileId)
    } catch (err) {
      error.value = err.message
      console.error('Failed to load custom models:', err)
      models.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 添加自定义模型
   */
  const addModel = async (profileId, model) => {
    try {
      const result = await invoke('addCustomModel', { profileId, model })
      await loadModels(profileId)
      return result
    } catch (err) {
      console.error('Failed to add custom model:', err)
      throw err
    }
  }

  /**
   * 更新自定义模型
   */
  const updateModel = async (profileId, modelId, updates) => {
    try {
      const result = await invoke('updateCustomModel', { profileId, modelId, updates })
      await loadModels(profileId)
      return result
    } catch (err) {
      console.error('Failed to update custom model:', err)
      throw err
    }
  }

  /**
   * 删除自定义模型
   */
  const deleteModel = async (profileId, modelId) => {
    try {
      const result = await invoke('deleteCustomModel', { profileId, modelId })
      await loadModels(profileId)
      return result
    } catch (err) {
      console.error('Failed to delete custom model:', err)
      throw err
    }
  }

  /**
   * 批量更新自定义模型
   */
  const updateAllModels = async (profileId, modelsList) => {
    try {
      const result = await invoke('updateCustomModels', { profileId, models: modelsList })
      await loadModels(profileId)
      return result
    } catch (err) {
      console.error('Failed to update custom models:', err)
      throw err
    }
  }

  return {
    models,
    loading,
    error,
    currentProfileId,
    loadModels,
    addModel,
    updateModel,
    deleteModel,
    updateAllModels
  }
}
