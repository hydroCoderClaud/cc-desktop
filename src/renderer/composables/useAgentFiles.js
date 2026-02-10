/**
 * Agent 文件浏览状态管理
 * 管理当前 Agent 会话的工作目录文件树和文件预览
 */

import { ref, reactive } from 'vue'

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

export function useAgentFiles() {
  // 当前会话 ID
  const sessionId = ref(null)

  // 当前工作目录
  const cwd = ref('')

  // 当前目录条目
  const entries = ref([])

  // 已展开目录的 Set
  const expandedDirs = reactive(new Set())

  // 目录缓存: Map<relativePath, entries[]>
  const dirCache = reactive(new Map())

  // 选中文件
  const selectedFile = ref(null)

  // 文件预览数据
  const filePreview = ref(null)

  // 加载状态
  const loading = ref(false)
  const previewLoading = ref(false)

  // 显示隐藏文件（.claude, CLAUDE.md 等）
  const showHidden = ref(false)

  // 错误信息
  const error = ref('')

  /**
   * 加载目录内容
   */
  const loadDir = async (relativePath = '') => {
    if (!sessionId.value) return

    // 检查缓存
    if (dirCache.has(relativePath)) {
      if (relativePath === '') {
        entries.value = dirCache.get(relativePath)
      }
      return dirCache.get(relativePath)
    }

    if (relativePath === '') {
      loading.value = true
      error.value = ''
    }

    try {
      const result = await window.electronAPI.listAgentDir({
        sessionId: sessionId.value,
        relativePath,
        showHidden: showHidden.value
      })

      if (result.error) {
        error.value = result.error
        return []
      }

      if (result.cwd) {
        cwd.value = result.cwd
      }

      const dirEntries = result.entries || []
      dirCache.set(relativePath, dirEntries)

      if (relativePath === '') {
        entries.value = dirEntries
      }

      return dirEntries
    } catch (err) {
      error.value = err.message || 'Failed to load directory'
      return []
    } finally {
      if (relativePath === '') {
        loading.value = false
      }
    }
  }

  /**
   * 展开/折叠目录
   */
  const toggleDir = async (dirPath) => {
    if (expandedDirs.has(dirPath)) {
      expandedDirs.delete(dirPath)
    } else {
      expandedDirs.add(dirPath)
      // 加载子目录
      await loadDir(dirPath)
    }
  }

  /**
   * 获取目录的子条目
   */
  const getDirEntries = (dirPath) => {
    return dirCache.get(dirPath) || []
  }

  /**
   * 选中文件并加载预览
   */
  const selectFile = async (filePath) => {
    if (!sessionId.value || !filePath) return

    selectedFile.value = filePath
    previewLoading.value = true
    filePreview.value = null

    try {
      const result = await window.electronAPI.readAgentFile({
        sessionId: sessionId.value,
        relativePath: filePath
      })
      filePreview.value = result
    } catch (err) {
      filePreview.value = { error: err.message || 'Failed to read file' }
    } finally {
      previewLoading.value = false
    }
  }

  /**
   * 用系统默认应用打开文件
   */
  const openFile = async (filePath) => {
    if (!sessionId.value || !filePath) return
    await window.electronAPI.openAgentFile({
      sessionId: sessionId.value,
      relativePath: filePath
    })
  }

  /**
   * 关闭预览
   */
  const closePreview = () => {
    selectedFile.value = null
    filePreview.value = null
  }

  /**
   * 切换显示隐藏文件
   */
  const toggleShowHidden = async () => {
    showHidden.value = !showHidden.value
    // 清缓存并重载，因为过滤规则变了
    dirCache.clear()
    expandedDirs.clear()
    selectedFile.value = null
    filePreview.value = null
    await loadDir('')
  }

  /**
   * 刷新（清缓存重载）
   */
  const refresh = async () => {
    dirCache.clear()
    expandedDirs.clear()
    selectedFile.value = null
    filePreview.value = null
    await loadDir('')
  }

  /**
   * 打开资源管理器
   */
  const openInExplorer = async () => {
    if (!sessionId.value) return
    await window.electronAPI.openAgentOutputDir(sessionId.value)
  }

  /**
   * 重置状态
   */
  const reset = () => {
    entries.value = []
    expandedDirs.clear()
    dirCache.clear()
    selectedFile.value = null
    filePreview.value = null
    showHidden.value = false
    cwd.value = ''
    error.value = ''
    loading.value = false
    previewLoading.value = false
  }

  /**
   * 设置会话 ID 并加载
   */
  const setSessionId = async (id) => {
    if (sessionId.value === id) return
    sessionId.value = id
    reset()
    if (id) {
      await loadDir('')
    }
  }

  return {
    sessionId,
    cwd,
    entries,
    expandedDirs,
    selectedFile,
    filePreview,
    loading,
    previewLoading,
    error,

    showHidden,
    loadDir,
    toggleDir,
    getDirEntries,
    selectFile,
    openFile,
    closePreview,
    toggleShowHidden,
    refresh,
    openInExplorer,
    setSessionId,
    reset
  }
}
