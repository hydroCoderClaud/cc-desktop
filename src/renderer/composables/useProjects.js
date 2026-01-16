/**
 * 项目管理组合式函数
 * 管理项目列表、选择、编辑等操作
 */
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'
import { ensureArray, isValidProject } from './useValidation'

export function useProjects() {
  const { invoke } = useIPC()

  // State
  const projects = ref([])
  const currentProject = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Edit modal state
  const showProjectModal = ref(false)
  const editingProject = ref(null)

  // API Profiles for edit modal
  const apiProfiles = ref([])

  /**
   * 固定的项目列表
   */
  const pinnedProjects = computed(() => {
    return projects.value.filter(p => p.is_pinned)
  })

  /**
   * 未固定的项目列表
   */
  const unpinnedProjects = computed(() => {
    return projects.value.filter(p => !p.is_pinned)
  })

  /**
   * 加载项目列表
   */
  const loadProjects = async () => {
    loading.value = true
    error.value = null

    try {
      const result = await invoke('getProjects', false)
      projects.value = ensureArray(result, 'projects')
    } catch (err) {
      error.value = err.message
      console.error('Failed to load projects:', err)
      projects.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载 API Profiles（用于项目编辑）
   */
  const loadApiProfiles = async () => {
    try {
      const result = await invoke('listAPIProfiles')
      apiProfiles.value = ensureArray(result, 'apiProfiles')
    } catch (err) {
      console.error('Failed to load API profiles:', err)
      apiProfiles.value = []
    }
  }

  /**
   * 选择项目
   * @param {Object} project - 项目对象
   * @param {Object} options - 选项
   * @param {Function} options.onPathInvalid - 路径无效时的回调
   */
  const selectProject = async (project, options = {}) => {
    if (!project) {
      currentProject.value = null
      return
    }

    if (!isValidProject(project)) {
      console.warn('Invalid project selected:', project)
      return
    }

    // 实时检查路径是否存在
    try {
      const result = await invoke('checkPath', project.path)
      if (result && result.valid !== project.pathValid) {
        if (!result.valid && options.onPathInvalid) {
          options.onPathInvalid()
        }
        await loadProjects()
        const updated = projects.value.find(p => p.id === project.id)
        if (updated) {
          currentProject.value = updated
          return
        }
      }
    } catch (err) {
      console.error('Failed to check path:', err)
    }

    currentProject.value = project
    await loadProjects()
  }

  /**
   * 打开现有项目（文件选择对话框）
   * @returns {Object} 打开结果
   */
  const openProject = async () => {
    try {
      const result = await invoke('openProject')
      if (result.canceled) {
        return { canceled: true }
      }

      await loadProjects()
      // 从 projects.value 中找到项目（带有 pathValid 字段）
      const project = projects.value.find(p => p.id === result.id)
      currentProject.value = project || result

      return {
        ...result,
        project: currentProject.value
      }
    } catch (err) {
      console.error('Failed to open project:', err)
      throw err
    }
  }

  /**
   * 在文件管理器中打开文件夹
   * @param {Object} project - 项目对象
   */
  const openFolder = async (project) => {
    try {
      await invoke('openFolder', project.path)
    } catch (err) {
      console.error('Failed to open folder:', err)
      throw err
    }
  }

  /**
   * 切换项目固定状态
   * @param {Object} project - 项目对象
   */
  const togglePin = async (project) => {
    try {
      await invoke('toggleProjectPinned', project.id)
      await loadProjects()
      return { wasPinned: project.is_pinned }
    } catch (err) {
      console.error('Failed to toggle pin:', err)
      throw err
    }
  }

  /**
   * 隐藏项目
   * @param {Object} project - 项目对象
   */
  const hideProject = async (project) => {
    try {
      await invoke('hideProject', project.id)
      await loadProjects()

      // 如果隐藏的是当前项目，清除选中
      if (currentProject.value?.id === project.id) {
        currentProject.value = null
      }

      return { success: true }
    } catch (err) {
      console.error('Failed to hide project:', err)
      throw err
    }
  }

  /**
   * 打开项目编辑弹窗
   * @param {Object} project - 项目对象
   */
  const openEditModal = async (project) => {
    await loadApiProfiles()
    editingProject.value = project
    showProjectModal.value = true
  }

  /**
   * 关闭项目编辑弹窗
   */
  const closeEditModal = () => {
    showProjectModal.value = false
    editingProject.value = null
  }

  /**
   * 保存项目编辑
   * @param {Object} updates - 更新内容
   */
  const saveProject = async (updates) => {
    if (!editingProject.value) return

    const projectId = editingProject.value.id

    try {
      await invoke('updateProject', {
        projectId,
        updates
      })

      await loadProjects()

      // 更新 currentProject 引用（如果当前选中的是被编辑的项目）
      if (currentProject.value?.id === projectId) {
        const updated = projects.value.find(p => p.id === projectId)
        if (updated) {
          currentProject.value = updated
        }
      }

      closeEditModal()

      return { success: true }
    } catch (err) {
      console.error('Failed to update project:', err)
      throw err
    }
  }

  /**
   * 处理上下文菜单操作
   * @param {string} action - 操作类型
   * @param {Object} project - 项目对象
   * @param {Object} callbacks - 回调函数集合
   */
  const handleContextAction = async (action, project, callbacks = {}) => {
    switch (action) {
      case 'openFolder':
        await openFolder(project)
        break
      case 'pin':
        const pinResult = await togglePin(project)
        if (callbacks.onPinToggled) {
          callbacks.onPinToggled(pinResult)
        }
        break
      case 'edit':
        await openEditModal(project)
        break
      case 'hide':
        await hideProject(project)
        if (callbacks.onHidden) {
          callbacks.onHidden()
        }
        break
    }
  }

  /**
   * 自动选中第一个项目
   */
  const selectFirstProject = () => {
    if (projects.value.length > 0 && !currentProject.value) {
      currentProject.value = projects.value[0]
    }
  }

  return {
    // State
    projects,
    currentProject,
    loading,
    error,
    showProjectModal,
    editingProject,
    apiProfiles,

    // Computed
    pinnedProjects,
    unpinnedProjects,

    // Methods
    loadProjects,
    loadApiProfiles,
    selectProject,
    openProject,
    openFolder,
    togglePin,
    hideProject,
    openEditModal,
    closeEditModal,
    saveProject,
    handleContextAction,
    selectFirstProject
  }
}
