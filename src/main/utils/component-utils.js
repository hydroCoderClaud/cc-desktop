/**
 * 组件管理通用工具函数
 */

const os = require('os')
const path = require('path')
const fs = require('fs')
const { shell } = require('electron')

/**
 * 打开组件文件夹
 * @param {string} source - 来源：'user' | 'project'
 * @param {string} projectPath - 项目路径（source='project' 时需要）
 * @param {string} subdir - 子目录名（如 'skills', 'agents'）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function openComponentFolder(source, projectPath, subdir) {
  let folderPath

  if (source === 'user') {
    folderPath = path.join(os.homedir(), '.claude', subdir)
  } else if (source === 'project' && projectPath) {
    folderPath = path.join(projectPath, '.claude', subdir)
  } else {
    return { success: false, error: 'Invalid source' }
  }

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }

  const result = await shell.openPath(folderPath)
  if (result) {
    return { success: false, error: result }
  }
  return { success: true }
}

module.exports = {
  openComponentFolder
}