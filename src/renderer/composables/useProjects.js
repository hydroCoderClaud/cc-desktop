/**
 * 项目目录身份组合式函数
 * 管理 Agent/能力管理需要的目录列表和当前目录上下文
 */
import { ref } from 'vue'
import { useIPC } from './useIPC'
import { ensureArray, isValidProject } from './useValidation'

export function useProjects() {
  const { invoke } = useIPC()

  // State
  const projects = ref([])
  const currentProject = ref(null)
  const loading = ref(false)
  const error = ref(null)

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

    // Methods
    loadProjects,
    selectProject,
    openProject,
    selectFirstProject
  }
}
