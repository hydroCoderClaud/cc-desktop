import { ref, computed, onMounted } from 'vue'
import { isNewerVersion } from '../utils/version'
import { extractAllEnvVars } from '@/utils/mcp-env-utils'

const NOTEBOOK_TOOL_INSTALL_TIMEOUT_MS = 90 * 1000

function withTimeout(promise, timeoutMs, errorFactory) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(errorFactory()), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function useNotebookTools({
  message,
  t,
  restartNotebookSession
}) {
  const availableTypes = ref([])
  const studioSelectedTags = ref([])
  const showToolConfig = ref(false)
  const editingToolData = ref(null)

  const showPromptEditor = ref(false)
  const editingPromptMarketId = ref('')
  const editingPromptRuntimePlaceholders = ref({})

  const remoteTools = ref([])
  const showMarketModal = ref(false)
  const showMcpEnvConfig = ref(false)
  const pendingInstallTool = ref(null)
  const pendingMcpDep = ref(null)
  const pendingMcpEnvVars = ref([])

  const studioAvailableTags = computed(() => {
    const tags = availableTypes.value.flatMap(tool => tool.tags || [])
    return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  })

  const filteredAvailableTypes = computed(() => {
    if (studioSelectedTags.value.length === 0) return availableTypes.value
    return availableTypes.value.filter(tool =>
      studioSelectedTags.value.some(tag => (tool.tags || []).includes(tag))
    )
  })

  const hasNewTools = computed(() => {
    if (!remoteTools.value.length) return false
    return remoteTools.value.some(rt => {
      const lt = availableTypes.value.find(t => t.id === rt.id && t.installed === true)
      if (!lt) return false
      return isNewerVersion(rt.version, lt.version)
    })
  })

  const normalizeToolTags = (tool) => ({
    ...tool,
    id: String(tool?.id || '').trim(),
    name: String(tool?.name || tool?.id || '').trim(),
    description: String(tool?.description || '').trim(),
    tags: Array.isArray(tool?.tags)
      ? [...new Set(tool.tags.map(tag => String(tag).trim()).filter(Boolean))]
      : []
  })

  const clearStudioTagFilters = () => {
    studioSelectedTags.value = []
  }

  const toggleStudioTag = (tag) => {
    if (studioSelectedTags.value.includes(tag)) {
      studioSelectedTags.value = studioSelectedTags.value.filter(item => item !== tag)
    } else {
      studioSelectedTags.value = [...studioSelectedTags.value, tag]
    }
  }

  const loadTools = async () => {
    try {
      const localTools = await window.electronAPI.notebookListTools()
      const defaultStyles = {
        image: { bgColor: '#E0F7FA', color: '#0097A7' },
        video: { bgColor: '#E8F5E9', color: '#388E3C' },
        notes: { bgColor: '#FFF8E1', color: '#FFA000' },
        pdf: { bgColor: '#FCE4EC', color: '#C2185B' },
        presentation: { bgColor: '#FFF3E0', color: '#F57C00' },
        word: { bgColor: '#E3F2FD', color: '#1976D2' },
        web: { bgColor: '#F3E5F5', color: '#7B1FA2' },
        data: { bgColor: '#EDE7F6', color: '#512DA8' }
      }

      const localMapped = (localTools || []).map(t => normalizeToolTags({
        ...t,
        bgColor: t.bgColor || defaultStyles[t.id]?.bgColor || '#f5f5f5',
        color: t.color || defaultStyles[t.id]?.color || '#666',
        installed: true
      }))

      availableTypes.value = localMapped

      try {
        const remoteRes = await window.electronAPI.notebookFetchRemoteTools()
        if (remoteRes.success && remoteRes.data && remoteRes.data.tools) {
          remoteTools.value = remoteRes.data.tools.map(normalizeToolTags)
          const remoteTagMap = new Map(remoteTools.value.map(tool => [tool.id, tool.tags || []]))
          availableTypes.value = localMapped.map(tool => normalizeToolTags({
            ...tool,
            tags: remoteTagMap.get(tool.id) || tool.tags || []
          }))
        } else {
          remoteTools.value = []
          const errorMsg = remoteRes.error || '返回数据格式错误'
          if (remoteRes.error) message.info(`远程工具同步跳过: ${errorMsg}`)
        }
      } catch (err) {
        console.error('[NotebookTools] Failed to sync remote tools:', err)
        remoteTools.value = []
      }
    } catch (err) {
      console.error('[NotebookTools] Failed to load tools:', err)
    }
  }

  const handleEditTool = (tool) => {
    editingToolData.value = tool
    showToolConfig.value = true
  }

  const handleOpenPromptEditor = (data) => {
    editingPromptMarketId.value = data.promptTemplateId
    editingPromptRuntimePlaceholders.value = data.runtimePlaceholders || {}
    showPromptEditor.value = true
  }

  const handleDownloadTool = async (tool, installOptions = {}) => {
    const loading = message.loading(`正在安装创作工具：${tool.name}...`, { duration: 0 })
    try {
      const res = await withTimeout(
        window.electronAPI.notebookInstallTool({
          tool: JSON.parse(JSON.stringify(tool)),
          options: installOptions
        }),
        NOTEBOOK_TOOL_INSTALL_TIMEOUT_MS,
        () => new Error(t('notebook.market.installTimeout'))
      )
      if (!res.success) throw new Error(res.error)
      if (res.requiresSessionRestart) {
        await restartNotebookSession()
      }
      await loadTools()
      message.success(t('notebook.market.installSuccess', { name: tool.name }))
    } catch (err) {
      console.error('[NotebookTools] Installation failed:', err)
      message.error(t('notebook.market.installFailed', { error: err.message }))
    } finally {
      loading.destroy()
    }
  }

  const handleInstallWithMcpConfig = async (tool) => {
    const mcpDep = tool?.installDependencies?.find(dep => dep.type === 'mcp' && dep.id)
    if (!mcpDep) {
      await handleDownloadTool(tool)
      return
    }

    try {
      const mcpStatus = await window.electronAPI.checkCapabilityInstalled('mcp', mcpDep.id)
      if (mcpStatus === 'installed' || mcpStatus === 'disabled') {
        await handleDownloadTool(tool)
        return
      }

      const marketConfig = await window.electronAPI.getMarketConfig()
      const preview = await window.electronAPI.previewMarketMcpConfig({
        registryUrl: marketConfig.registryUrl,
        mcp: { id: mcpDep.id }
      })
      if (!preview.success) {
        throw new Error(preview.error || 'MCP 配置预览失败')
      }
      const vars = preview.config ? extractAllEnvVars(preview.config) : []
      pendingInstallTool.value = tool
      pendingMcpDep.value = mcpDep
      pendingMcpEnvVars.value = vars
      showMcpEnvConfig.value = true
    } catch (err) {
      console.error('[NotebookTools] MCP preview failed:', err)
      message.error(t('notebook.market.installFailed', { error: err.message }))
    }
  }

  const onMcpEnvConfigConfirm = async (envOverrides) => {
    const tool = pendingInstallTool.value
    const mcpDep = pendingMcpDep.value
    pendingInstallTool.value = null
    pendingMcpDep.value = null
    pendingMcpEnvVars.value = []
    if (!tool || !mcpDep) return

    await handleDownloadTool(tool, {
      dependencyOptions: {
        [`mcp:${mcpDep.id}`]: { envOverrides }
      }
    })
  }

  const onMcpEnvConfigCancel = () => {
    pendingInstallTool.value = null
    pendingMcpDep.value = null
    pendingMcpEnvVars.value = []
  }

  const handleUninstallTool = async (toolId) => {
    try {
      const res = await window.electronAPI.notebookUninstallTool(toolId)
      if (!res.success) throw new Error(res.error)
      await loadTools()
      message.success(t('notebook.market.uninstallSuccess', { name: toolId }))
    } catch (err) {
      console.error('[NotebookTools] Uninstall failed:', err)
      message.error(t('notebook.market.uninstallFailed', { error: err.message }))
    }
  }

  const handleSaveTool = async (updatedTool) => {
    if (!updatedTool || !updatedTool.id) return

    try {
      const plainUpdates = JSON.parse(JSON.stringify(updatedTool))
      await window.electronAPI.notebookUpdateTool({ toolId: updatedTool.id, updates: plainUpdates })
      await loadTools()
      showToolConfig.value = false
      message.success(t('notebook.toolConfig.saveSuccess'))
    } catch (err) {
      console.error('[NotebookTools] Failed to save tool:', err)
      message.error(t('notebook.toolConfig.saveFailed', { error: err.message || '未知错误' }))
    }
  }

  onMounted(() => {
    loadTools()
  })

  return {
    availableTypes,
    studioSelectedTags,
    showToolConfig,
    editingToolData,
    studioAvailableTags,
    filteredAvailableTypes,
    showPromptEditor,
    editingPromptMarketId,
    editingPromptRuntimePlaceholders,
    remoteTools,
    showMarketModal,
    showMcpEnvConfig,
    pendingInstallTool,
    pendingMcpDep,
    pendingMcpEnvVars,
    hasNewTools,
    clearStudioTagFilters,
    toggleStudioTag,
    loadTools,
    handleEditTool,
    handleOpenPromptEditor,
    handleDownloadTool,
    handleInstallWithMcpConfig,
    onMcpEnvConfigConfirm,
    onMcpEnvConfigCancel,
    handleUninstallTool,
    handleSaveTool
  }
}
