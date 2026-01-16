/**
 * 数据验证工具函数
 */

/**
 * 验证值是否为数组，如果不是则返回空数组
 * @param {*} value - 待验证的值
 * @param {string} [context] - 上下文信息，用于日志
 * @returns {Array} 数组或空数组
 */
export function ensureArray(value, context = '') {
  if (Array.isArray(value)) {
    return value
  }
  if (value !== null && value !== undefined) {
    console.warn(`[Validation] Expected array${context ? ` for ${context}` : ''}, got:`, typeof value)
  }
  return []
}

/**
 * 验证对象是否包含必需的字段
 * @param {Object} obj - 待验证的对象
 * @param {string[]} requiredFields - 必需字段列表
 * @param {string} [context] - 上下文信息，用于日志
 * @returns {boolean} 是否有效
 */
export function hasRequiredFields(obj, requiredFields, context = '') {
  if (!obj || typeof obj !== 'object') {
    console.warn(`[Validation] Invalid object${context ? ` for ${context}` : ''}:`, obj)
    return false
  }

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      console.warn(`[Validation] Missing required field '${field}'${context ? ` in ${context}` : ''}`)
      return false
    }
  }
  return true
}

/**
 * 验证项目对象
 * @param {Object} project - 项目对象
 * @returns {boolean} 是否有效
 */
export function isValidProject(project) {
  return hasRequiredFields(project, ['id', 'path'], 'project')
}

/**
 * 验证会话对象
 * @param {Object} session - 会话对象
 * @returns {boolean} 是否有效
 */
export function isValidSession(session) {
  return hasRequiredFields(session, ['id'], 'session')
}

/**
 * 验证会话事件数据
 * @param {Object} eventData - 事件数据
 * @returns {boolean} 是否有效
 */
export function isValidSessionEvent(eventData) {
  return hasRequiredFields(eventData, ['sessionId'], 'sessionEvent')
}

/**
 * 安全获取对象属性，如果对象无效则返回默认值
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径 (如 'a.b.c')
 * @param {*} defaultValue - 默认值
 * @returns {*} 属性值或默认值
 */
export function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue
  }

  const keys = path.split('.')
  let result = obj

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return defaultValue
    }
    result = result[key]
  }

  return result !== undefined ? result : defaultValue
}

/**
 * 组合式函数 - 提供验证工具
 */
export function useValidation() {
  return {
    ensureArray,
    hasRequiredFields,
    isValidProject,
    isValidSession,
    isValidSessionEvent,
    safeGet
  }
}
