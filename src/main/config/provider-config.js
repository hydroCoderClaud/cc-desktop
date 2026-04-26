/**
 * 服务商定义配置管理
 * 管理内置和自定义服务商的定义
 */

const { SERVICE_PROVIDERS, LATEST_MODEL_ALIASES } = require('../utils/constants')

const BUILTIN_PROVIDER_MODELS = {
  official: [LATEST_MODEL_ALIASES.sonnet, LATEST_MODEL_ALIASES.opus, LATEST_MODEL_ALIASES.haiku],
  proxy: [LATEST_MODEL_ALIASES.sonnet, LATEST_MODEL_ALIASES.opus, LATEST_MODEL_ALIASES.haiku]
}

function normalizeModelIds(modelIds) {
  if (!Array.isArray(modelIds)) return []

  const normalized = []
  const seen = new Set()

  for (const modelId of modelIds) {
    const value = typeof modelId === 'string' ? modelId.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function normalizeProviderModelMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return null

  const normalized = {}

  for (const tier of ['opus', 'sonnet', 'haiku']) {
    const value = typeof mapping[tier] === 'string' ? mapping[tier].trim() : ''
    if (value) {
      normalized[tier] = value
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeProviderDefinition(definition) {
  const providerId = typeof definition?.id === 'string' ? definition.id.trim() : ''
  const builtinModels = BUILTIN_PROVIDER_MODELS[providerId] || []

  return {
    id: providerId,
    name: definition?.name || providerId,
    baseUrl: definition?.baseUrl || '',
    defaultModelMapping: normalizeProviderModelMapping(definition?.defaultModelMapping),
    defaultModels: normalizeModelIds(definition?.defaultModels || builtinModels)
  }
}

/**
 * 初始化默认服务商定义
 * @returns {Array} 默认服务商列表
 */
function getDefaultProviders() {
  return Object.keys(SERVICE_PROVIDERS).map(id => normalizeProviderDefinition({
    id,
    name: SERVICE_PROVIDERS[id].label,
    baseUrl: SERVICE_PROVIDERS[id].baseUrl || '',
    defaultModelMapping: null,
    defaultModels: BUILTIN_PROVIDER_MODELS[id] || []
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
        baseUrl: def.baseUrl,
        defaultModelMapping: def.defaultModelMapping,
        defaultModels: normalizeModelIds(def.defaultModels)
      }
    })

    return providers
  },

  /**
   * 获取所有服务商定义（从配置文件加载，如果为空则初始化默认值）
   */
  getServiceProviderDefinitions() {
    const existingDefinitions = Array.isArray(this.config.serviceProviderDefinitions)
      ? this.config.serviceProviderDefinitions
      : []

    const definitionMap = new Map()

    for (const definition of existingDefinitions) {
      const normalized = normalizeProviderDefinition({
        ...definition
      })
      definitionMap.set(normalized.id, normalized)
    }

    for (const profile of Array.isArray(this.config.apiProfiles) ? this.config.apiProfiles : []) {
      const providerId = typeof profile?.serviceProvider === 'string' ? profile.serviceProvider.trim() : ''
      if (!providerId || definitionMap.has(providerId)) continue

      definitionMap.set(providerId, normalizeProviderDefinition({
        id: providerId,
        name: providerId,
        baseUrl: '',
        defaultModelMapping: null,
        defaultModels: []
      }))
    }

    const normalizedDefinitions = Array.from(definitionMap.values())
    const hasChanged = JSON.stringify(normalizedDefinitions) !== JSON.stringify(existingDefinitions)

    if (hasChanged || existingDefinitions.length === 0) {
      this.config.serviceProviderDefinitions = normalizedDefinitions
      this.save()
    }

    return normalizedDefinitions
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
      ...normalizeProviderDefinition(definition),
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

    // 更新定义
    const nextDefinition = normalizeProviderDefinition({
      ...this.config.serviceProviderDefinitions[index],
      ...safeUpdates
    })
    Object.assign(this.config.serviceProviderDefinitions[index], nextDefinition)

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
  getDefaultProviders,
  normalizeModelIds,
  providerConfigMixin
}
