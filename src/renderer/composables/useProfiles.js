/**
 * API Profile 管理组合式函数
 */
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'

export function useProfiles() {
  const { invoke, silentInvoke } = useIPC()

  const profiles = ref([])
  const loading = ref(false)
  const error = ref(null)

  /**
   * 默认 Profile
   */
  const defaultProfile = computed(() => {
    return profiles.value.find(p => p.isDefault) || null
  })

  /**
   * 加载所有 Profiles
   */
  const loadProfiles = async () => {
    loading.value = true
    error.value = null

    try {
      profiles.value = await invoke('listAPIProfiles')
    } catch (err) {
      error.value = err.message
      console.error('Failed to load profiles:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取单个 Profile
   */
  const getProfile = async (profileId) => {
    try {
      return await invoke('getAPIProfile', profileId)
    } catch (err) {
      console.error('Failed to get profile:', err)
      throw err
    }
  }

  /**
   * 添加 Profile
   */
  const addProfile = async (profileData) => {
    try {
      const result = await invoke('addAPIProfile', profileData)
      await loadProfiles()
      return result
    } catch (err) {
      console.error('Failed to add profile:', err)
      throw err
    }
  }

  /**
   * 更新 Profile
   */
  const updateProfile = async (profileId, updates) => {
    try {
      const result = await invoke('updateAPIProfile', { profileId, updates })
      await loadProfiles()
      return result
    } catch (err) {
      console.error('Failed to update profile:', err)
      throw err
    }
  }

  /**
   * 删除 Profile
   */
  const deleteProfile = async (profileId) => {
    try {
      const result = await invoke('deleteAPIProfile', profileId)
      await loadProfiles()
      return result
    } catch (err) {
      console.error('Failed to delete profile:', err)
      throw err
    }
  }

  /**
   * 设置默认 Profile
   */
  const setDefault = async (profileId) => {
    try {
      const result = await invoke('setDefaultProfile', profileId)
      await loadProfiles()
      return result
    } catch (err) {
      console.error('Failed to set default profile:', err)
      throw err
    }
  }

  /**
   * 测试连接
   */
  const testConnection = async (apiConfig) => {
    try {
      return await invoke('testConnection', apiConfig)
    } catch (err) {
      console.error('Connection test failed:', err)
      throw err
    }
  }

  /**
   * 获取官方模型列表
   */
  const fetchOfficialModels = async (apiConfig) => {
    try {
      return await invoke('fetchOfficialModels', apiConfig)
    } catch (err) {
      console.error('Failed to fetch official models:', err)
      throw err
    }
  }

  return {
    profiles,
    loading,
    error,
    defaultProfile,
    loadProfiles,
    getProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    setDefault,
    testConnection,
    fetchOfficialModels
  }
}
