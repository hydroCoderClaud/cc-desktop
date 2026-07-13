/**
 * 跨平台进程树 kill 工具
 *
 * Windows 上 child_process 的 kill() 只杀直接子进程，不杀孙进程（进程树）。
 * 使用 taskkill /T /F 可以递归杀掉整个进程树。
 */

const { execSync } = require('child_process')
const os = require('os')

/**
 * 杀掉指定 PID 的整个进程树（Windows 专用增强）
 * @param {number} pid - 进程 ID
 * @returns {boolean} 是否执行了 tree kill
 */
function killProcessTree(pid) {
  if (!pid) return false

  if (os.platform() === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, {
        stdio: 'ignore',
        timeout: 5000
      })
      return true
    } catch (e) {
      // 进程可能已退出，忽略错误
      return false
    }
  }

  // Unix/macOS: 调用方负责普通 kill；这里只增强 Windows 进程树清理。
  return false
}

module.exports = { killProcessTree }
