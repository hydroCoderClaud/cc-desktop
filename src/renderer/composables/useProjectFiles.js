/**
 * Project 文件浏览状态管理
 * 管理当前 Developer 模式工程工作目录文件树和文件预览
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

export function useProjectFiles() {
  // 当前根目录
  const rootPath = ref(null)

  // 当前工作目录 (为了与 Agent 文件保持一致，这里也就是 rootPath)
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

  // 显示隐藏文件
  const showHidden = ref(false)

  // 搜索状态
  const searchKeyword = ref('')
  const searchResults = ref([])
  const searchLoading = ref(false)
  let searchTimer = null

  // 错误信息
  const error = ref('')

  /**
   * 加载目录内容
   */
  const loadDir = async (relativePath = '') => {
    if (!rootPath.value) return

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
      const result = await window.electronAPI.listProjectDir({
        rootPath: rootPath.value,
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
      await loadDir(dirPath)
    }
  }

  /**
   * 展开父目录并选中文件
   */
  const revealFile = async (relativePath, { select = true } = {}) => {
    if (!relativePath) return
    const parts = relativePath.replace(/\\/g, '/').split('/')
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/')
      if (!expandedDirs.has(dirPath)) {
        await toggleDir(dirPath)
      }
    }
    if (select) selectedFile.value = relativePath
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
    if (!rootPath.value || !filePath) return

    selectedFile.value = filePath
    previewLoading.value = true
    filePreview.value = null

    try {
      const result = await window.electronAPI.readProjectFile({
        rootPath: rootPath.value,
        relativePath: filePath
      })
      filePreview.value = {
        ...result,
        rootPath: rootPath.value,
        relativePath: filePath
      }
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
    if (!rootPath.value || !filePath) return
    const absolutePath = await window.electronAPI.resolvePath(rootPath.value, filePath)
    if (absolutePath) {
      await window.electronAPI.openPath(absolutePath)
    }
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
    dirCache.clear()
    expandedDirs.clear()
    selectedFile.value = null
    filePreview.value = null
    await loadDir('')
  }

  /**
   * 刷新
   */
  const refresh = async () => {
    const currentPreviewFile = selectedFile.value
    dirCache.clear()
    expandedDirs.clear()
    await loadDir('')
    if (currentPreviewFile) {
      await selectFile(currentPreviewFile)
    }
  }

  /**
   * 搜索文件
   */
  const searchFiles = (keyword) => {
    searchKeyword.value = keyword
    if (searchTimer) clearTimeout(searchTimer)

    if (!keyword || !keyword.trim()) {
      searchResults.value = []
      searchLoading.value = false
      return
    }

    searchLoading.value = true
    searchTimer = setTimeout(async () => {
      if (!rootPath.value) return
      try {
        const result = await window.electronAPI.searchProjectFiles({
          rootPath: rootPath.value,
          keyword: keyword.trim(),
          showHidden: showHidden.value
        })
        searchResults.value = result.results || []
      } catch (err) {
        searchResults.value = []
      } finally {
        searchLoading.value = false
      }
    }, 300)
  }

  /**
   * 清空搜索
   */
  const clearSearch = () => {
    searchKeyword.value = ''
    searchResults.value = []
    searchLoading.value = false
    if (searchTimer) clearTimeout(searchTimer)
  }

  /**
   * 打开资源管理器
   */
  const openInExplorer = async () => {
    if (!rootPath.value) return
    await window.electronAPI.openFolder(rootPath.value)
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
    clearSearch()
  }

  /**
   * 设置工程路径
   */
  const setRootPath = async (path) => {
    if (rootPath.value === path) return
    rootPath.value = path
    reset()
    if (path) {
      await loadDir('')
    }
  }

  return {
    rootPath,
    cwd,
    entries,
    expandedDirs,
    selectedFile,
    filePreview,
    loading,
    previewLoading,
    error,

    showHidden,
    searchKeyword,
    searchResults,
    searchLoading,
    loadDir,
    toggleDir,
    getDirEntries,
    selectFile,
    openFile,
    closePreview,
    toggleShowHidden,
    refresh,
    openInExplorer,
    searchFiles,
    clearSearch,
    revealFile,
    setRootPath,
    reset
  }
}
