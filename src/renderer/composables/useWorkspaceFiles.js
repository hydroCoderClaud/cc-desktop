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

/**
 * 通用工作目录文件浏览状态管理
 * 通过 adapter 适配不同宿主（project / agent / embedded agent）
 */
export function useWorkspaceFiles(adapter) {
  const sourceId = ref(null)
  const cwd = ref('')
  const entries = ref([])
  const expandedDirs = reactive(new Set())
  const dirCache = reactive(new Map())
  const selectedFile = ref(null)
  const filePreview = ref(null)
  const loading = ref(false)
  const previewLoading = ref(false)
  const showHidden = ref(false)
  const searchKeyword = ref('')
  const searchResults = ref([])
  const searchLoading = ref(false)
  const error = ref('')
  let searchTimer = null

  const ensureSourceId = () => sourceId.value
  const normalizeRelativePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const isSameOrChildPath = (candidate, target) => {
    const normalizedCandidate = normalizeRelativePath(candidate)
    const normalizedTarget = normalizeRelativePath(target)
    return normalizedCandidate === normalizedTarget || normalizedCandidate.startsWith(`${normalizedTarget}/`)
  }
  const getParentDirPath = (relativePath) => {
    const normalized = normalizeRelativePath(relativePath)
    const lastSlash = normalized.lastIndexOf('/')
    return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
  }
  const getCachedDirKey = (dirPath) => {
    const normalizedDirPath = normalizeRelativePath(dirPath)
    for (const key of dirCache.keys()) {
      if (normalizeRelativePath(key) === normalizedDirPath) return key
    }
    return dirPath
  }

  const loadDir = async (relativePath = '') => {
    if (!ensureSourceId()) return []

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
      const result = await adapter.listDir(sourceId.value, relativePath, showHidden.value)
      if (result?.error) {
        error.value = result.error
        return []
      }

      if (result?.cwd) {
        cwd.value = result.cwd
      }

      const dirEntries = result?.entries || []
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

  const toggleDir = async (dirPath) => {
    if (expandedDirs.has(dirPath)) {
      expandedDirs.delete(dirPath)
    } else {
      expandedDirs.add(dirPath)
      await loadDir(dirPath)
    }
  }

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

  const getDirEntries = (dirPath) => dirCache.get(dirPath) || []

  const selectFile = async (relativePath) => {
    if (!ensureSourceId() || !relativePath) return

    selectedFile.value = relativePath
    previewLoading.value = true
    filePreview.value = null

    try {
      const result = await adapter.readFile(sourceId.value, relativePath)
      const extraMeta = typeof adapter.decoratePreview === 'function'
        ? adapter.decoratePreview(sourceId.value, relativePath, result)
        : null
      filePreview.value = {
        ...(result || {}),
        ...(extraMeta || {})
      }
    } catch (err) {
      filePreview.value = { error: err.message || 'Failed to read file' }
    } finally {
      previewLoading.value = false
    }
  }

  const openFile = async (relativePath) => {
    if (!ensureSourceId() || !relativePath || typeof adapter.openFile !== 'function') return
    await adapter.openFile(sourceId.value, relativePath)
  }

  const closePreview = () => {
    selectedFile.value = null
    filePreview.value = null
  }

  const toggleShowHidden = async () => {
    showHidden.value = !showHidden.value
    dirCache.clear()
    expandedDirs.clear()
    selectedFile.value = null
    filePreview.value = null
    await loadDir('')
  }

  const refresh = async () => {
    const currentPreviewFile = selectedFile.value
    dirCache.clear()
    expandedDirs.clear()
    await loadDir('')
    if (currentPreviewFile) {
      await selectFile(currentPreviewFile)
    }
  }

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
      if (!ensureSourceId()) return
      try {
        const result = await adapter.searchFiles(sourceId.value, keyword.trim(), showHidden.value)
        searchResults.value = result?.results || []
      } catch {
        searchResults.value = []
      } finally {
        searchLoading.value = false
      }
    }, 300)
  }

  const clearSearch = () => {
    searchKeyword.value = ''
    searchResults.value = []
    searchLoading.value = false
    if (searchTimer) clearTimeout(searchTimer)
  }

  const openInExplorer = async () => {
    if (!ensureSourceId() || typeof adapter.openInExplorer !== 'function') return
    await adapter.openInExplorer(sourceId.value)
  }

  const createFile = async (parentPath, name, isDirectory) => {
    if (!ensureSourceId() || typeof adapter.createFile !== 'function') {
      return { error: 'Unsupported operation' }
    }
    return adapter.createFile(sourceId.value, parentPath, name, isDirectory)
  }

  const renameFile = async (oldPath, newName) => {
    if (!ensureSourceId() || typeof adapter.renameFile !== 'function') {
      return { error: 'Unsupported operation' }
    }
    return adapter.renameFile(sourceId.value, oldPath, newName)
  }

  const deleteFile = async (relativePath) => {
    if (!ensureSourceId() || typeof adapter.deleteFile !== 'function') {
      return { error: 'Unsupported operation' }
    }
    return adapter.deleteFile(sourceId.value, relativePath)
  }

  const removeEntry = (relativePath, { isDirectory = false } = {}) => {
    const normalizedPath = normalizeRelativePath(relativePath)
    if (!normalizedPath) return

    const parentPath = getParentDirPath(normalizedPath)
    const parentCacheKey = getCachedDirKey(parentPath)
    const parentEntries = dirCache.get(parentCacheKey) || (parentPath === '' ? entries.value : null)

    if (Array.isArray(parentEntries)) {
      const nextEntries = parentEntries.filter(entry =>
        normalizeRelativePath(entry?.relativePath) !== normalizedPath
      )
      dirCache.set(parentCacheKey, nextEntries)
      if (parentPath === '') {
        entries.value = nextEntries
      }
    }

    for (const key of Array.from(dirCache.keys())) {
      const normalizedKey = normalizeRelativePath(key)
      if (normalizedKey === normalizedPath || (isDirectory && isSameOrChildPath(normalizedKey, normalizedPath))) {
        dirCache.delete(key)
      }
    }

    for (const dirPath of Array.from(expandedDirs)) {
      const normalizedDirPath = normalizeRelativePath(dirPath)
      if (normalizedDirPath === normalizedPath || (isDirectory && isSameOrChildPath(normalizedDirPath, normalizedPath))) {
        expandedDirs.delete(dirPath)
      }
    }

    searchResults.value = searchResults.value.filter(result => {
      const resultPath = normalizeRelativePath(result?.relativePath)
      return resultPath !== normalizedPath && !(isDirectory && isSameOrChildPath(resultPath, normalizedPath))
    })

    if (selectedFile.value) {
      const normalizedSelected = normalizeRelativePath(selectedFile.value)
      if (normalizedSelected === normalizedPath || (isDirectory && isSameOrChildPath(normalizedSelected, normalizedPath))) {
        closePreview()
      }
    }
  }

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

  const setSourceId = async (id) => {
    if (sourceId.value === id) return
    sourceId.value = id
    reset()
    if (id) {
      await loadDir('')
    }
  }

  return {
    sourceId,
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
    createFile,
    renameFile,
    deleteFile,
    removeEntry,
    setSourceId,
    reset
  }
}
