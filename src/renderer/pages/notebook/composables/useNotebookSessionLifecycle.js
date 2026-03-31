export function useNotebookSessionLifecycle({
  currentNotebook,
  sources,
  achievements,
  activeGenerationAchievementId,
  activeGenerationToken,
  clearStudioTagFilters,
  processAchievements,
  refreshSources,
  refreshAchievements,
  message,
  t
}) {
  const restartNotebookSession = async () => {
    const notebook = currentNotebook.value
    if (!notebook?.id || !notebook?.sessionId) return

    const result = await window.electronAPI.notebookRestartSession(notebook.id)
    if (!result) return

    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0

    currentNotebook.value = result
    sources.value = result.sources || []
    const sourceMetaMap = new Map((result.sources || []).map(s => [s.id, s]))
    achievements.value = processAchievements(result.achievements || [], result.notebookPath, sourceMetaMap)
  }

  const handleCleanupIndexes = async () => {
    if (!currentNotebook.value?.id) return
    const loading = message.loading(t('common.loading'), { duration: 0 })
    try {
      const result = await window.electronAPI.notebookSanitizeIndexes(currentNotebook.value.id)
      await refreshSources()
      await refreshAchievements()
      message.success(t('notebook.nav.cleanupSuccess', {
        sources: result?.sourcesRemoved || 0,
        achievements: result?.achievementsRemoved || 0
      }))
    } catch (err) {
      console.error('[NotebookSessionLifecycle] Failed to cleanup indexes:', err)
      message.error(t('notebook.nav.cleanupFailed', { error: err.message }))
    } finally {
      loading.destroy()
    }
  }

  const loadNotebook = async (notebook) => {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
    clearStudioTagFilters()

    if (currentNotebook.value?.sessionId) {
      try {
        await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
      } catch (err) {
        console.warn('[NotebookSessionLifecycle] Failed to close previous session:', err)
      }
    }

    try {
      const data = await window.electronAPI.notebookGet(notebook.id)
      currentNotebook.value = data
      window.currentNotebookId = data.id
      sources.value = data.sources || []
      const sourceMetaMap = new Map((data.sources || []).map(s => [s.id, s]))
      achievements.value = processAchievements(data.achievements || [], data.notebookPath, sourceMetaMap)
    } catch (err) {
      console.error('[NotebookSessionLifecycle] Failed to load notebook data:', err)
    }
  }

  const handleNotebookCreated = async (nb) => {
    await loadNotebook(nb)
    message.success(t('notebook.createSuccess', { name: nb.name }))
  }

  const handleCloseNotebook = async () => {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
    clearStudioTagFilters()
    if (currentNotebook.value?.sessionId) {
      try {
        await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
      } catch (err) {
        console.warn('[NotebookSessionLifecycle] Failed to close agent session:', err)
      }
    }
    currentNotebook.value = null
    window.currentNotebookId = null
    sources.value = []
    achievements.value = []
  }

  const handleRenamed = ({ id, name }) => {
    if (currentNotebook.value?.id === id) {
      currentNotebook.value = { ...currentNotebook.value, name }
    }
  }

  const handleDeleted = (id) => {
    if (currentNotebook.value?.id === id) {
      activeGenerationAchievementId.value = null
      activeGenerationToken.value = 0
      clearStudioTagFilters()
      currentNotebook.value = null
      window.currentNotebookId = null
      sources.value = []
      achievements.value = []
    }
  }

  return {
    restartNotebookSession,
    handleCleanupIndexes,
    loadNotebook,
    handleNotebookCreated,
    handleCloseNotebook,
    handleRenamed,
    handleDeleted
  }
}
