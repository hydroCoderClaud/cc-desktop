/**
 * Session Utilities
 * 会话相关的工具函数和常量
 */

/**
 * 会话状态枚举
 */
export const SessionStatus = {
  STARTING: 'starting',
  RUNNING: 'running',
  EXITED: 'exited',
  ERROR: 'error'
}

/**
 * 会话类型枚举
 */
export const SessionType = {
  SESSION: 'session',    // Claude 会话
  TERMINAL: 'terminal',  // 纯终端
  AGENT_CHAT: 'agent-chat'  // Agent 对话
}

/**
 * 获取会话状态图标
 * @param {string} status - 会话状态
 * @param {string} type - 会话类型 ('session' 或 'terminal')
 * @returns {string} 状态图标
 */
export function getSessionStatusIcon(status, type = SessionType.SESSION) {
  // 纯终端使用不同的图标
  if (type === SessionType.TERMINAL) {
    switch (status) {
      case SessionStatus.RUNNING:
        return '>_'
      case SessionStatus.STARTING:
        return '⏳'
      case SessionStatus.EXITED:
        return '⏹️'
      case SessionStatus.ERROR:
        return '❌'
      default:
        return '>_'
    }
  }

  // Claude 会话图标
  switch (status) {
    case SessionStatus.RUNNING:
      return '▶️'
    case SessionStatus.STARTING:
      return '⏳'
    case SessionStatus.EXITED:
      return '⏹️'
    case SessionStatus.ERROR:
      return '❌'
    default:
      return '💬'
  }
}

/**
 * 创建 Tab 对象
 * @param {Object} session - 会话对象
 * @param {Object} project - 项目对象
 * @returns {Object} Tab 对象
 */
export function createTabFromSession(session, project) {
  return {
    id: `tab-${session.id}`,
    sessionId: session.id,
    type: session.type || SessionType.SESSION,  // 会话类型
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    title: session.title || '',
    status: session.status
  }
}

/**
 * 在 tabs 数组中查找 tab
 * @param {Array} tabs - tabs 数组
 * @param {string} sessionId - 会话 ID
 * @returns {Object|undefined} 找到的 tab 或 undefined
 */
export function findTabBySessionId(tabs, sessionId) {
  return tabs.find(t => t.sessionId === sessionId)
}

/**
 * 从 tabs 数组中移除 tab 并返回应该激活的新 tab ID
 * @param {Array} tabs - tabs 数组 (会被修改)
 * @param {string} tabId - 要移除的 tab ID
 * @param {string} currentActiveId - 当前激活的 tab ID
 * @returns {string} 应该激活的新 tab ID
 */
export function removeTabAndGetNextActive(tabs, tabId, currentActiveId) {
  const index = tabs.findIndex(t => t.id === tabId)
  if (index === -1) {
    return currentActiveId
  }

  tabs.splice(index, 1)

  // 如果移除的不是当前 tab，保持不变
  if (currentActiveId !== tabId) {
    return currentActiveId
  }

  // 如果还有其他 tab，切换到相邻的
  if (tabs.length > 0) {
    const newIndex = Math.min(index, tabs.length - 1)
    return tabs[newIndex].id
  }

  // 没有其他 tab 了，回到欢迎页
  return 'welcome'
}

/**
 * 交换数组中两个元素的位置
 * @param {Array} arr - 数组
 * @param {number} i - 第一个索引
 * @param {number} j - 第二个索引
 */
export function swapArrayItems(arr, i, j) {
  if (i >= 0 && i < arr.length && j >= 0 && j < arr.length) {
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
}
