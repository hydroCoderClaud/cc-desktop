/**
 * 服务商定义配置管理
 * 管理内置和自定义服务商的定义
 */

const { SERVICE_PROVIDERS } = require('../utils/constants')

// 官方/中转服务商（不需要模型映射）
const OFFICIAL_PROVIDERS = ['official', 'proxy']

/**
 * 初始化默认服务商定义
 * @returns {Array} 默认服务商列表
 */
function getDefaultProviders() {
  return Object.keys(SERVICE_PROVIDERS).map(id => ({
    id,
    name: SERVICE_PROVIDERS[id].label,
    needsMapping: SERVICE_PROVIDERS[id].needsMapping,
    baseUrl: SERVICE_PROVIDERS[id].baseUrl || '',
    defaultModelMapping: null
  }))
}

/**
 * 服务商配置管理 mixin
 * 提供服务商相关的方法，需要绑定到 ConfigManager 实例
 */
const providerConfigMixin = {
  /**
   * 获取服务商枚举定义（用于下拉框）
   */
  getServiceProviders() {
    const definitions = this.getServiceProviderDefinitions()
    const providers = {}

    definitions.forEach(def => {
      providers[def.id] = {
        label: def.name,
        needsMapping: def.needsMapping,
        baseUrl: def.baseUrl,
        defaultModelMapping: def.defaultModelMapping
      }
    })

    return providers
  },

  /**
   * 获取所有服务商定义（从配置文件加载，如果为空则初始化默认值）
   */
  getServiceProviderDefinitions() {
    // 如果配置文件中已有服务商定义，直接返回
    if (this.config.serviceProviderDefinitions && this.config.serviceProviderDefinitions.length > 0) {
      return this.config.serviceProviderDefinitions
    }

    // 如果配置为空，初始化默认的内置服务商
    const defaultProviders = getDefaultProviders()

    // 保存到配置文件
    this.config.serviceProviderDefinitions = defaultProviders
    this.save()

    return defaultProviders
  },

  /**
   * 获取单个服务商定义
   */
  getServiceProviderDefinition(id) {
    const provider = this.config.serviceProviderDefinitions?.find(p => p.id === id)
    return provider || null
  },

  /**
   * 添加自定义服务商定义
   */
  addServiceProviderDefinition(definition) {
    if (!this.config.serviceProviderDefinitions) {
      this.config.serviceProviderDefinitions = []
    }

    // 检查 ID 是否已存在
    const existingIndex = this.config.serviceProviderDefinitions.findIndex(
      p => p.id === definition.id
    )
    if (existingIndex !== -1) {
      throw new Error(`服务商 ID "${definition.id}" 已存在`)
    }

    // 创建新的服务商定义
    const newProvider = {
      id: definition.id,
      name: definition.name,
      needsMapping: definition.needsMapping !== false,
      baseUrl: definition.baseUrl || '',
      defaultModelMapping: definition.defaultModelMapping || null,
      createdAt: new Date().toISOString()
    }

    this.config.serviceProviderDefinitions.push(newProvider)
    this.save()

    return newProvider
  },

  /**
   * 更新自定义服务商定义
   */
  updateServiceProviderDefinition(id, updates) {
    if (!this.config.serviceProviderDefinitions) {
      return false
    }

    const index = this.config.serviceProviderDefinitions.findIndex(p => p.id === id)
    if (index === -1) {
      return false
    }

    // 不允许修改 ID
    const { id: newId, ...safeUpdates } = updates

    // 特殊处理：official 和 proxy 的模型映射永久为 null
    if (OFFICIAL_PROVIDERS.includes(id)) {
      safeUpdates.needsMapping = false
      safeUpdates.defaultModelMapping = null
    }

    // 更新定义
    Object.assign(this.config.serviceProviderDefinitions[index], safeUpdates)

    return this.save()
  },

  /**
   * 删除自定义服务商定义
   */
  deleteServiceProviderDefinition(id) {
    if (!this.config.serviceProviderDefinitions) {
      return false
    }

    const index = this.config.serviceProviderDefinitions.findIndex(p => p.id === id)
    if (index === -1) {
      return false
    }

    const provider = this.config.serviceProviderDefinitions[index]

    // 检查是否有 Profile 正在使用此服务商
    const profilesUsingProvider = this.config.apiProfiles?.filter(
      profile => profile.serviceProvider === id
    )

    if (profilesUsingProvider && profilesUsingProvider.length > 0) {
      const profileNames = profilesUsingProvider.map(p => p.name).join(', ')
      throw new Error(`无法删除：以下 Profile 正在使用此服务商: ${profileNames}`)
    }

    // 删除服务商定义
    this.config.serviceProviderDefinitions.splice(index, 1)

    return this.save()
  }
}

module.exports = {
  OFFICIAL_PROVIDERS,
  getDefaultProviders,
  providerConfigMixin
}
