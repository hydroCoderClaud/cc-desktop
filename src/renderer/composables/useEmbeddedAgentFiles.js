import { useWorkspaceFiles } from './useWorkspaceFiles'

export function useEmbeddedAgentFiles(agentApiRef) {
  const adapter = {
    listDir: async (sessionId, relativePath, showHidden) => {
      if (!agentApiRef.value?.listAgentDir) {
        return { entries: [], cwd: null, error: 'Embedded agent file API unavailable' }
      }
      return agentApiRef.value.listAgentDir(sessionId, relativePath, showHidden)
    },
    readFile: async (sessionId, relativePath) => {
      if (!agentApiRef.value?.readAgentFile) {
        return { error: 'Embedded agent file API unavailable' }
      }
      return agentApiRef.value.readAgentFile(sessionId, relativePath)
    },
    decoratePreview: (sessionId, relativePath, preview) => ({
      sessionId,
      relativePath,
      ...(preview || {})
    }),
    openFile: async (sessionId, relativePath) => {
      if (!agentApiRef.value?.openAgentFile) return
      await agentApiRef.value.openAgentFile({ sessionId, relativePath })
    },
    searchFiles: async (sessionId, keyword, showHidden) => {
      if (!agentApiRef.value?.searchAgentFiles) {
        return { results: [] }
      }
      return agentApiRef.value.searchAgentFiles({ sessionId, keyword, showHidden })
    },
    openInExplorer: async (sessionId) => {
      if (!agentApiRef.value?.openAgentOutputDir) return
      await agentApiRef.value.openAgentOutputDir(sessionId)
    },
    createFile: async (sessionId, parentPath, name, isDirectory) => {
      if (!agentApiRef.value?.createAgentFile) {
        return { error: 'Unsupported operation' }
      }
      return agentApiRef.value.createAgentFile({ sessionId, parentPath, name, isDirectory })
    },
    renameFile: async (sessionId, oldPath, newName) => {
      if (!agentApiRef.value?.renameAgentFile) {
        return { error: 'Unsupported operation' }
      }
      return agentApiRef.value.renameAgentFile({ sessionId, oldPath, newName })
    },
    deleteFile: async (sessionId, path) => {
      if (!agentApiRef.value?.deleteAgentFile) {
        return { error: 'Unsupported operation' }
      }
      return agentApiRef.value.deleteAgentFile({ sessionId, path })
    }
  }

  const workspaceFiles = useWorkspaceFiles(adapter)

  return {
    ...workspaceFiles,
    sessionId: workspaceFiles.sourceId,
    setSessionId: workspaceFiles.setSourceId
  }
}
