/**
 * Project 文件浏览状态管理
 * 基于通用 useWorkspaceFiles + Project adapter
 */

import { formatFileSize, useWorkspaceFiles } from './useWorkspaceFiles'

const projectFilesAdapter = {
  listDir: (rootPath, relativePath, showHidden) =>
    window.electronAPI.listProjectDir({ rootPath, relativePath, showHidden }),
  readFile: (rootPath, relativePath) =>
    window.electronAPI.readProjectFile({ rootPath, relativePath }),
  decoratePreview: (rootPath, relativePath, preview) => ({
    rootPath,
    relativePath,
    ...(preview || {})
  }),
  openFile: async (rootPath, relativePath) => {
    const absolutePath = await window.electronAPI.resolvePath(rootPath, relativePath)
    if (absolutePath) {
      await window.electronAPI.openPath(absolutePath)
    }
  },
  searchFiles: (rootPath, keyword, showHidden) =>
    window.electronAPI.searchProjectFiles({ rootPath, keyword, showHidden }),
  openInExplorer: (rootPath) =>
    window.electronAPI.openFolder(rootPath),
  createFile: (rootPath, parentPath, name, isDirectory) =>
    window.electronAPI.createProjectFile({ rootPath, parentPath, name, isDirectory }),
  renameFile: (rootPath, oldPath, newName) =>
    window.electronAPI.renameProjectFile({ rootPath, oldPath, newName }),
  deleteFile: (rootPath, path) =>
    window.electronAPI.deleteProjectFile({ rootPath, path })
}

export { formatFileSize }

export function useProjectFiles() {
  const workspaceFiles = useWorkspaceFiles(projectFilesAdapter)

  return {
    ...workspaceFiles,
    rootPath: workspaceFiles.sourceId,
    setRootPath: workspaceFiles.setSourceId
  }
}
