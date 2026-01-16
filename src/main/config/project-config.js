/**
 * 项目配置管理
 * 管理最近打开的项目列表
 */

const path = require('path')
const { v4: uuidv4 } = require('uuid')

/**
 * 项目配置管理 mixin
 * 提供项目管理相关的方法，需要绑定到 ConfigManager 实例
 */
const projectConfigMixin = {
  /**
   * 添加最近打开的项目
   * @param {string} name - 项目名称
   * @param {string} projectPath - 项目路径
   * @returns {Object} 添加的项目对象
   */
  addRecentProject(name, projectPath) {
    // 检查是否已存在
    const existingIndex = this.config.recentProjects.findIndex(
      p => p.path === projectPath
    )

    let project
    if (existingIndex !== -1) {
      // 已存在，更新时间并移到最前面
      project = this.config.recentProjects[existingIndex]
      project.lastOpened = new Date().toISOString()
      this.config.recentProjects.splice(existingIndex, 1)
    } else {
      // 新项目
      project = {
        id: uuidv4(),
        name: name || path.basename(projectPath),
        path: projectPath,
        lastOpened: new Date().toISOString(),
        icon: '📁',
        pinned: false
      }
    }

    // 添加到列表开头
    this.config.recentProjects.unshift(project)

    // 限制数量
    const maxProjects = this.config.settings?.maxRecentProjects || 10
    this.config.recentProjects = this.config.recentProjects.slice(0, maxProjects)

    this.save()
    return project
  },

  /**
   * 移除项目
   * @param {string} projectId - 项目 ID
   * @returns {boolean} 是否成功
   */
  removeRecentProject(projectId) {
    this.config.recentProjects = this.config.recentProjects.filter(
      p => p.id !== projectId
    )
    return this.save()
  },

  /**
   * 重命名项目
   * @param {string} projectId - 项目 ID
   * @param {string} newName - 新名称
   * @returns {boolean} 是否成功
   */
  renameProject(projectId, newName) {
    const project = this.config.recentProjects.find(p => p.id === projectId)
    if (project) {
      project.name = newName
      return this.save()
    }
    return false
  },

  /**
   * 更新项目属性
   * @param {string} projectId - 项目 ID
   * @param {Object} updates - 更新的属性
   * @returns {boolean} 是否成功
   */
  updateProject(projectId, updates) {
    const project = this.config.recentProjects.find(p => p.id === projectId)
    if (project) {
      // 不允许更新 id 和 path
      const { id, path: projectPath, ...safeUpdates } = updates
      Object.assign(project, safeUpdates)
      return this.save()
    }
    return false
  },

  /**
   * 切换项目固定状态
   * @param {string} projectId - 项目 ID
   * @returns {boolean} 是否成功
   */
  togglePinProject(projectId) {
    const project = this.config.recentProjects.find(p => p.id === projectId)
    if (project) {
      project.pinned = !project.pinned

      // 重新排序：固定的在前面
      this.config.recentProjects.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.lastOpened) - new Date(a.lastOpened)
      })

      return this.save()
    }
    return false
  },

  /**
   * 获取最近项目列表
   * @returns {Array} 项目列表
   */
  getRecentProjects() {
    return this.config.recentProjects || []
  },

  /**
   * 获取单个项目
   * @param {string} projectId - 项目 ID
   * @returns {Object|null} 项目对象
   */
  getProject(projectId) {
    return this.config.recentProjects?.find(p => p.id === projectId) || null
  },

  /**
   * 根据路径获取项目
   * @param {string} projectPath - 项目路径
   * @returns {Object|null} 项目对象
   */
  getProjectByPath(projectPath) {
    return this.config.recentProjects?.find(p => p.path === projectPath) || null
  },

  /**
   * 更新项目的最近使用时间（选中项目时调用）
   * @param {string} projectId - 项目 ID
   * @returns {boolean} 是否成功
   */
  touchProject(projectId) {
    const project = this.config.recentProjects.find(p => p.id === projectId)
    if (project) {
      project.lastOpened = new Date().toISOString()
      // 重新排序（不影响固定项目的相对位置）
      this.config.recentProjects.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.lastOpened) - new Date(a.lastOpened)
      })
      return this.save()
    }
    return false
  },

  /**
   * 获取固定的项目列表
   * @returns {Array} 固定的项目列表
   */
  getPinnedProjects() {
    return this.config.recentProjects?.filter(p => p.pinned) || []
  },

  /**
   * 获取未固定的项目列表
   * @returns {Array} 未固定的项目列表
   */
  getUnpinnedProjects() {
    return this.config.recentProjects?.filter(p => !p.pinned) || []
  }
}

module.exports = {
  projectConfigMixin
}
