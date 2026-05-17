/**
 * Agent 文件浏览状态管理
 * 基于通用 useWorkspaceFiles + Agent adapter
 */

import { formatFileSize, useWorkspaceFiles } from './useWorkspaceFiles'

const agentFilesAdapter = {
  listDir: (sessionId, relativePath, showHidden) =>
    window.electronAPI.listAgentDir({ sessionId, relativePath, showHidden }),
  readFile: (sessionId, relativePath) =>
    window.electronAPI.readAgentFile({ sessionId, relativePath }),
  decoratePreview: (sessionId, relativePath, preview) => ({
    sessionId,
    relativePath,
    ...(preview || {})
  }),
  openFile: (sessionId, relativePath) =>
    window.electronAPI.openAgentFile({ sessionId, relativePath }),
  searchFiles: (sessionId, keyword, showHidden) =>
    window.electronAPI.searchAgentFiles({ sessionId, keyword, showHidden }),
  openInExplorer: (sessionId) =>
    window.electronAPI.openAgentOutputDir(sessionId),
  createFile: (sessionId, parentPath, name, isDirectory) =>
    window.electronAPI.createAgentFile({ sessionId, parentPath, name, isDirectory }),
  renameFile: (sessionId, oldPath, newName) =>
    window.electronAPI.renameAgentFile({ sessionId, oldPath, newName }),
  deleteFile: (sessionId, path) =>
    window.electronAPI.deleteAgentFile({ sessionId, path })
}

export { formatFileSize }

export function useAgentFiles() {
  const workspaceFiles = useWorkspaceFiles(agentFilesAdapter)

  return {
    ...workspaceFiles,
    sessionId: workspaceFiles.sourceId,
    setSessionId: workspaceFiles.setSourceId
  }
}
