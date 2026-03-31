import { ref } from 'vue'

export function useNotebookChatAssets({
  currentNotebook,
  selectedSources,
  refreshSources,
  refreshAchievements,
  message,
  t
}) {
  const previewImageData = ref(null)

  const buildChatAssetName = (chatMessage, suffix) => {
    const firstLine = (chatMessage?.content || '')
      .split('\n')
      .map(line => line.trim())
      .find(Boolean)
    const base = (firstLine || suffix || 'chat')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48)
    return base || suffix || 'chat'
  }

  const getSelectedSourceIdsForChat = () => selectedSources.value.map(s => s.id)

  const handleSaveChatImageToSource = async ({ dataUrl, message: chatMessage, filename } = {}) => {
    if (!currentNotebook.value?.id) return
    try {
      await window.electronAPI.notebookSaveChatImageToSource({
        notebookId: currentNotebook.value.id,
        filename: filename || buildChatAssetName(chatMessage, 'chat-image'),
        dataUrl
      })
      await refreshSources()
      message.success(t('notebook.chat.saveImageToSourceSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to save chat image to source:', err)
      message.error(t('notebook.chat.saveImageToSourceFailed', { error: err.message }))
    }
  }

  const handleSaveChatImageToAchievement = async ({ dataUrl, message: chatMessage, filename } = {}) => {
    if (!currentNotebook.value?.id) return
    try {
      await window.electronAPI.notebookSaveChatImageToAchievement({
        notebookId: currentNotebook.value.id,
        filename: filename || buildChatAssetName(chatMessage, 'chat-image'),
        dataUrl,
        sourceIds: getSelectedSourceIdsForChat()
      })
      await refreshAchievements()
      message.success(t('notebook.chat.saveImageToAchievementSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to save chat image to achievement:', err)
      message.error(t('notebook.chat.saveImageToAchievementFailed', { error: err.message }))
    }
  }

  const handleCopyChatContentToSource = async ({ content, message: chatMessage } = {}) => {
    if (!currentNotebook.value?.id) return
    try {
      await window.electronAPI.notebookSaveChatMarkdownToSource({
        notebookId: currentNotebook.value.id,
        filename: buildChatAssetName(chatMessage, 'chat-markdown'),
        content
      })
      await refreshSources()
      message.success(t('notebook.chat.copyContentToSourceSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to copy chat content to source:', err)
      message.error(t('notebook.chat.copyContentToSourceFailed', { error: err.message }))
    }
  }

  const handleCopyChatContentToAchievement = async ({ content, message: chatMessage } = {}) => {
    if (!currentNotebook.value?.id) return
    try {
      await window.electronAPI.notebookSaveChatMarkdownToAchievement({
        notebookId: currentNotebook.value.id,
        filename: buildChatAssetName(chatMessage, 'chat-markdown'),
        content,
        sourceIds: getSelectedSourceIdsForChat()
      })
      await refreshAchievements()
      message.success(t('notebook.chat.copyContentToAchievementSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to copy chat content to achievement:', err)
      message.error(t('notebook.chat.copyContentToAchievementFailed', { error: err.message }))
    }
  }

  const handleAddPathToSource = async ({ filePath } = {}) => {
    if (!currentNotebook.value?.id || !filePath) return
    try {
      await window.electronAPI.notebookAddPathToSource({
        notebookId: currentNotebook.value.id,
        filePath
      })
      await refreshSources()
      message.success(t('notebook.chat.addLinkToSourceSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to add linked file to source:', err)
      message.error(t('notebook.chat.addLinkToSourceFailed', { error: err.message }))
    }
  }

  const handleAddPathToAchievement = async ({ filePath } = {}) => {
    if (!currentNotebook.value?.id || !filePath) return
    try {
      await window.electronAPI.notebookAddPathToAchievement({
        notebookId: currentNotebook.value.id,
        filePath
      })
      await refreshAchievements()
      message.success(t('notebook.chat.addLinkToAchievementSuccess'))
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to add linked file to achievement:', err)
      message.error(t('notebook.chat.addLinkToAchievementFailed', { error: err.message }))
    }
  }

  const closePreviewImage = () => {
    previewImageData.value = null
  }

  const handlePreviewImage = (previewData) => {
    if (previewData?.content) {
      previewImageData.value = previewData
      return
    }
    if (previewData?.path) window.electronAPI.openPath(previewData.path).catch(() => {})
  }

  const handlePreviewLink = (linkData) => {
    if (linkData?.url) window.electronAPI.openExternal(linkData.url).catch(() => {})
  }

  const handlePreviewPath = async (filePath) => {
    if (!filePath) return
    try {
      const fileData = await window.electronAPI.readAbsolutePath({
        filePath,
        sessionId: currentNotebook.value?.sessionId,
        confirmed: true
      })
      if (fileData?.error) {
        message.error(fileData.error)
        return
      }
      const effectivePath = fileData.path || fileData.filePath || filePath
      await window.electronAPI.openPath(effectivePath)
    } catch (err) {
      console.error('[NotebookChatAssets] Failed to preview path:', err)
      message.error('文件预览失败')
    }
  }

  return {
    previewImageData,
    handleSaveChatImageToSource,
    handleSaveChatImageToAchievement,
    handleCopyChatContentToSource,
    handleCopyChatContentToAchievement,
    handleAddPathToSource,
    handleAddPathToAchievement,
    closePreviewImage,
    handlePreviewImage,
    handlePreviewLink,
    handlePreviewPath
  }
}
