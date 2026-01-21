/**
 * 消息队列 IPC 处理器
 * 管理会话级别的消息队列
 */

const { createIPCHandler } = require('../utils/ipc-utils')

/**
 * 设置消息队列的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {Object} sessionDatabase - SessionDatabase instance
 */
function setupQueueHandlers(ipcMain, sessionDatabase) {
  // 获取会话队列
  createIPCHandler(ipcMain, 'queue:list', (sessionUuid) => {
    return sessionDatabase.getQueue(sessionUuid)
  })

  // 搜索队列
  createIPCHandler(ipcMain, 'queue:search', ({ sessionUuid, keyword }) => {
    return sessionDatabase.searchQueue(sessionUuid, keyword)
  })

  // 添加到队列
  createIPCHandler(ipcMain, 'queue:add', ({ sessionUuid, content }) => {
    return sessionDatabase.addToQueue(sessionUuid, content)
  })

  // 更新队列项
  createIPCHandler(ipcMain, 'queue:update', ({ id, content }) => {
    return sessionDatabase.updateQueueItem(id, content)
  })

  // 删除队列项
  createIPCHandler(ipcMain, 'queue:delete', (id) => {
    return sessionDatabase.deleteQueueItem(id)
  })

  // 标记为已执行
  createIPCHandler(ipcMain, 'queue:markExecuted', (id) => {
    return sessionDatabase.markQueueItemExecuted(id)
  })

  // 获取队列数量
  createIPCHandler(ipcMain, 'queue:count', (sessionUuid) => {
    return sessionDatabase.getQueueCount(sessionUuid)
  })

  // 清空队列
  createIPCHandler(ipcMain, 'queue:clear', (sessionUuid) => {
    return sessionDatabase.clearQueue(sessionUuid)
  })

  // 交换队列项顺序
  createIPCHandler(ipcMain, 'queue:swap', ({ id1, id2 }) => {
    return sessionDatabase.swapQueueOrder(id1, id2)
  })
}

module.exports = { setupQueueHandlers }
