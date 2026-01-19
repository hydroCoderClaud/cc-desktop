/**
 * 提示词管理组合式函数
 */
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'

export function usePrompts() {
  const { invoke } = useIPC()

  const prompts = ref([])
  const tags = ref([])
  const loading = ref(false)
  const error = ref(null)

  // 筛选状态
  const currentScope = ref('all') // 'all' | 'global' | 'project'
  const currentProjectId = ref(null)
  const selectedTagIds = ref([])
  const searchQuery = ref('')
  const showFavoritesOnly = ref(false)

  /**
   * 筛选后的提示词列表
   */
  const filteredPrompts = computed(() => {
    let result = prompts.value

    // 按搜索词筛选
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.content.toLowerCase().includes(query)
      )
    }

    // 按收藏筛选
    if (showFavoritesOnly.value) {
      result = result.filter(p => p.is_favorite)
    }

    // 按标签筛选
    if (selectedTagIds.value.length > 0) {
      result = result.filter(p =>
        p.tags && p.tags.some(t => selectedTagIds.value.includes(t.id))
      )
    }

    return result
  })

  /**
   * 加载提示词列表
   */
  const loadPrompts = async (options = {}) => {
    loading.value = true
    error.value = null

    try {
      const queryOptions = {
        scope: currentScope.value,
        projectId: currentProjectId.value,
        tagIds: selectedTagIds.value.length > 0 ? selectedTagIds.value : undefined,
        ...options
      }

      prompts.value = await invoke('listPrompts', queryOptions)
    } catch (err) {
      error.value = err.message
      console.error('Failed to load prompts:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载所有标签
   */
  const loadTags = async () => {
    try {
      tags.value = await invoke('listPromptTags')
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }

  /**
   * 获取单个提示词
   */
  const getPrompt = async (promptId) => {
    try {
      return await invoke('getPrompt', promptId)
    } catch (err) {
      console.error('Failed to get prompt:', err)
      throw err
    }
  }

  /**
   * 创建提示词
   */
  const createPrompt = async (promptData) => {
    try {
      const result = await invoke('createPrompt', promptData)
      await loadPrompts()
      return result
    } catch (err) {
      console.error('Failed to create prompt:', err)
      throw err
    }
  }

  /**
   * 更新提示词
   */
  const updatePrompt = async (promptId, updates) => {
    try {
      const result = await invoke('updatePrompt', { promptId, updates })
      await loadPrompts()
      return result
    } catch (err) {
      console.error('Failed to update prompt:', err)
      throw err
    }
  }

  /**
   * 删除提示词
   */
  const deletePrompt = async (promptId) => {
    try {
      const result = await invoke('deletePrompt', promptId)
      await loadPrompts()
      return result
    } catch (err) {
      console.error('Failed to delete prompt:', err)
      throw err
    }
  }

  /**
   * 增加使用次数
   */
  const incrementUsage = async (promptId) => {
    try {
      await invoke('incrementPromptUsage', promptId)
      // 本地更新使用次数
      const prompt = prompts.value.find(p => p.id === promptId)
      if (prompt) {
        prompt.usage_count = (prompt.usage_count || 0) + 1
      }
    } catch (err) {
      console.error('Failed to increment usage:', err)
    }
  }

  /**
   * 切换收藏状态
   */
  const toggleFavorite = async (promptId) => {
    try {
      const result = await invoke('togglePromptFavorite', promptId)
      // 本地更新收藏状态
      const prompt = prompts.value.find(p => p.id === promptId)
      if (prompt) {
        prompt.is_favorite = result.is_favorite
      }
      return result
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
      throw err
    }
  }

  // ========================================
  // 标签管理
  // ========================================

  /**
   * 创建标签
   */
  const createTag = async (name, color = '#888888') => {
    try {
      const result = await invoke('createPromptTag', { name, color })
      await loadTags()
      return result
    } catch (err) {
      console.error('Failed to create tag:', err)
      throw err
    }
  }

  /**
   * 更新标签
   */
  const updateTag = async (tagId, updates) => {
    try {
      const result = await invoke('updatePromptTag', { tagId, updates })
      await loadTags()
      return result
    } catch (err) {
      console.error('Failed to update tag:', err)
      throw err
    }
  }

  /**
   * 删除标签
   */
  const deleteTag = async (tagId) => {
    try {
      const result = await invoke('deletePromptTag', tagId)
      await loadTags()
      // 从选中标签中移除
      selectedTagIds.value = selectedTagIds.value.filter(id => id !== tagId)
      return result
    } catch (err) {
      console.error('Failed to delete tag:', err)
      throw err
    }
  }

  /**
   * 给提示词添加标签
   */
  const addTagToPrompt = async (promptId, tagId) => {
    try {
      await invoke('addTagToPrompt', { promptId, tagId })
      await loadPrompts()
    } catch (err) {
      console.error('Failed to add tag to prompt:', err)
      throw err
    }
  }

  /**
   * 从提示词移除标签
   */
  const removeTagFromPrompt = async (promptId, tagId) => {
    try {
      await invoke('removeTagFromPrompt', { promptId, tagId })
      await loadPrompts()
    } catch (err) {
      console.error('Failed to remove tag from prompt:', err)
      throw err
    }
  }

  // ========================================
  // 筛选控制
  // ========================================

  /**
   * 设置作用域筛选
   */
  const setScope = async (scope, projectId = null) => {
    currentScope.value = scope
    currentProjectId.value = projectId
    await loadPrompts()
  }

  /**
   * 设置标签筛选
   */
  const setTagFilter = async (tagIds) => {
    selectedTagIds.value = tagIds
    await loadPrompts()
  }

  /**
   * 切换收藏筛选
   */
  const toggleFavoritesFilter = () => {
    showFavoritesOnly.value = !showFavoritesOnly.value
  }

  /**
   * 重置筛选
   */
  const resetFilters = async () => {
    currentScope.value = 'all'
    currentProjectId.value = null
    selectedTagIds.value = []
    searchQuery.value = ''
    showFavoritesOnly.value = false
    await loadPrompts()
  }

  return {
    // 状态
    prompts,
    tags,
    loading,
    error,
    filteredPrompts,

    // 筛选状态
    currentScope,
    currentProjectId,
    selectedTagIds,
    searchQuery,
    showFavoritesOnly,

    // 提示词操作
    loadPrompts,
    getPrompt,
    createPrompt,
    updatePrompt,
    deletePrompt,
    incrementUsage,
    toggleFavorite,

    // 标签操作
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    addTagToPrompt,
    removeTagFromPrompt,

    // 筛选控制
    setScope,
    setTagFilter,
    toggleFavoritesFilter,
    resetFilters
  }
}
