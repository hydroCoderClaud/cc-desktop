/**
 * Notebook 前端共享工具函数
 */

/**
 * 获取成果类型对应的图标
 * @param {string} type - 成果类型
 * @returns {string} 图标名称
 */
export function getAchievementIcon(type) {
  const map = {
    image: 'image',
    video: 'video',
    audio: 'audio',
    markdown: 'fileText',
    pdf: 'file',
    document: 'fileText',
    code: 'globe',
    web: 'globe',
    text: 'fileText',
    csv: 'table',
    fromchat: 'fileText',
    // 兼容老数据
    presentation: 'presentation',
    mindmap: 'mindmap',
    flashcard: 'heart',
    quiz: 'clipboard',
    infographic: 'image',
    table: 'table'
  }
  return map[type] || 'fileText'
}

/**
 * 获取成果类型对应的颜色
 * @param {string} type - 成果类型
 * @returns {string} 颜色值
 */
export function getAchievementColor(type) {
  const map = {
    image: '#e85d2a',
    video: '#388E3C',
    audio: '#1976D2',
    markdown: '#2da44e',
    pdf: '#dc3545',
    document: '#e53935',
    code: '#0366d6',
    web: 'var(--text-color-muted)',
    text: 'var(--text-color-muted)',
    csv: '#512DA8',
    fromchat: '#5c6bc0',
    // 兼容老数据
    presentation: '#F57C00',
    mindmap: '#7B1FA2',
    flashcard: '#C2185B',
    quiz: '#D84315',
    infographic: '#0097A7',
    table: '#512DA8'
  }
  return map[type] || 'var(--text-color-muted)'
}

/**
 * 获取来源类型对应的图标
 * @param {string} type - 来源类型
 * @returns {string} 图标名称
 */
export function getSourceIcon(type) {
  const map = {
    document: 'fileText',
    spreadsheet: 'table',
    presentation: 'presentation',
    markdown: 'fileText',
    web: 'globe',
    code: 'file',
    data: 'file',
    image: 'image',
    audio: 'audio',
    video: 'video',
    other: 'file',
    // 兼容旧记录
    pdf: 'file',
    text: 'file'
  }
  return map[type] || 'file'
}

/**
 * 获取来源类型对应的颜色
 * @param {string} type - 来源类型
 * @returns {string} 颜色值
 */
export function getSourceColor(type) {
  const map = {
    document: '#e53935',
    spreadsheet: '#2da44e',
    presentation: '#F57C00',
    markdown: '#2da44e',
    web: 'var(--text-color-muted)',
    code: '#0366d6',
    data: '#0097A7',
    image: '#e85d2a',
    audio: '#7B1FA2',
    video: '#388E3C',
    other: 'var(--text-color-muted)',
    // 兼容旧记录
    pdf: '#dc3545',
    text: 'var(--text-color-muted)'
  }
  return map[type] || 'var(--text-color-muted)'
}

export function isAbsolutePath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return false
  return /^[A-Za-z]:[/\\]/.test(pathStr) || pathStr.startsWith('/')
}

export function normalizePathSeparators(pathStr) {
  return (pathStr || '').replace(/\\/g, '/')
}

export function joinNotebookPath(basePath, relativePath) {
  if (!relativePath) return basePath || ''
  if (!basePath || isAbsolutePath(relativePath)) return relativePath
  const normalizedBase = normalizePathSeparators(basePath).replace(/\/+$/, '')
  const normalizedRelative = normalizePathSeparators(relativePath).replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedRelative}`
}

export function getDirname(pathStr) {
  const normalizedPath = normalizePathSeparators(pathStr)
  if (!normalizedPath) return ''
  if (normalizedPath === '/') return '/'

  const trimmedPath = normalizedPath.length > 1
    ? normalizedPath.replace(/\/+$/, '')
    : normalizedPath

  if (/^[A-Za-z]:\/$/.test(trimmedPath)) return trimmedPath

  const lastSlashIndex = trimmedPath.lastIndexOf('/')
  if (lastSlashIndex < 0) return trimmedPath
  if (lastSlashIndex === 0) return '/'
  if (/^[A-Za-z]:$/.test(trimmedPath.slice(0, lastSlashIndex))) {
    return `${trimmedPath.slice(0, lastSlashIndex)}/`
  }
  return trimmedPath.slice(0, lastSlashIndex)
}

export function toFileUrl(pathStr) {
  const normalizedPath = normalizePathSeparators(pathStr)
  if (!normalizedPath) return ''

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    const drive = normalizedPath.slice(0, 2)
    const rest = normalizedPath.slice(2).split('/').map(segment => encodeURIComponent(segment)).join('/')
    return `file:///${drive}${rest}`
  }

  return `file://${normalizedPath.split('/').map((segment, index) => {
    if (index === 0) return segment
    return encodeURIComponent(segment)
  }).join('/')}`
}
