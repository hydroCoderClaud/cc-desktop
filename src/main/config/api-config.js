/**
 * API 配置管理 mixin
 * 管理 API Profiles
 */

const { v4: uuidv4 } = require('uuid')
const { resolveProfileModel } = require('../utils/model-resolver')

function resolveProviderDefaultModelId(configManager, serviceProvider) {
  if (!serviceProvider || typeof configManager?.getServiceProviderDefinition !== 'function') {
    return ''
  }

  const provider = configManager.getServiceProviderDefinition(serviceProvider)
  const defaultModels = Array.isArray(provider?.defaultModels) ? provider.defaultModels : []
  return typeof defaultModels[0] === 'string' ? defaultModels[0].trim() : ''
}

/**
 * API 配置管理 mixin
 * 提供 API Profile 相关的方法，需要绑定到 ConfigManager 实例
 */
const apiConfigMixin = {
  /**
   * 获取所有 API Profiles
   */
  getAPIProfiles() {
    return this.config.apiProfiles || []
  },

  /**
   * 获取指定 Profile
   */
  getAPIProfile(profileId) {
    return this.config.apiProfiles?.find(p => p.id === profileId) || null
  },

  /**
   * 添加新 Profile
   */
  addAPIProfile(profileData) {
    if (!this.config.apiProfiles) {
      this.config.apiProfiles = []
    }

    // Get global timeout as default value
    const globalTimeout = this.getTimeout()

    const newProfile = {
      id: uuidv4(),
      name: profileData.name || 'New Profile',
      authToken: profileData.authToken || '',
      authType: profileData.authType || 'api_key',
      serviceProvider: profileData.serviceProvider || 'official',
      description: profileData.description || '',
      baseUrl: profileData.baseUrl || 'https://api.anthropic.com',
      selectedModelId: profileData.selectedModelId || '',
      selectedModelTier: profileData.selectedModelTier || 'sonnet',
      modelMapping: profileData.modelMapping || null,
      requestTimeout: profileData.requestTimeout || globalTimeout.request,
      disableNonessentialTraffic: profileData.disableNonessentialTraffic !== false,
      useProxy: profileData.useProxy || false,
      httpsProxy: profileData.httpsProxy || '',
      httpProxy: profileData.httpProxy || '',
      isDefault: false,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      icon: profileData.icon || '🔵'
    }

    if (!newProfile.selectedModelId) {
      newProfile.selectedModelId = resolveProviderDefaultModelId(this, newProfile.serviceProvider) || resolveProfileModel(newProfile)
    }

    // 如果是第一个 Profile，自动设为默认
    if (this.config.apiProfiles.length === 0) {
      newProfile.isDefault = true
      this.config.defaultProfileId = newProfile.id
    }

    this.config.apiProfiles.push(newProfile)
    this.save()

    return newProfile
  },

  /**
   * 更新 Profile
   */
  updateAPIProfile(profileId, updates) {
    const profile = this.getAPIProfile(profileId)
    if (!profile) {
      return false
    }

    // 更新字段（不允许通过此方法修改 isDefault）
    const { isDefault, ...safeUpdates } = updates
    Object.assign(profile, safeUpdates)
    if (!profile.selectedModelId) {
      profile.selectedModelId = resolveProviderDefaultModelId(this, profile.serviceProvider) || resolveProfileModel(profile)
    }
    profile.lastUsed = new Date().toISOString()

    return this.save()
  },

  /**
   * 删除 Profile
   */
  deleteAPIProfile(profileId) {
    const index = this.config.apiProfiles?.findIndex(p => p.id === profileId)

    if (index === -1 || index === undefined) {
      return false
    }

    // 先检查要删除的是否是默认配置
    const profileToDelete = this.config.apiProfiles[index]
    const wasDefault = profileToDelete.isDefault || this.config.defaultProfileId === profileId

    // 删除配置
    this.config.apiProfiles.splice(index, 1)

    // 如果删除的是默认配置，需要设置新的默认配置
    if (wasDefault && this.config.apiProfiles.length > 0) {
      this.config.apiProfiles[0].isDefault = true
      this.config.defaultProfileId = this.config.apiProfiles[0].id
    } else if (this.config.apiProfiles.length === 0) {
      // 如果没有配置了，清空 defaultProfileId
      this.config.defaultProfileId = null
    }

    return this.save()
  },

  /**
   * 设置默认 Profile
   */
  setDefaultProfile(profileId) {
    const profile = this.getAPIProfile(profileId)
    if (!profile) {
      return false
    }

    // 取消所有 Profile 的默认状态
    this.config.apiProfiles.forEach(p => p.isDefault = false)

    // 设置新的默认
    profile.isDefault = true
    this.config.defaultProfileId = profileId

    return this.save()
  },

  /**
   * 获取默认 Profile（用于启动时推荐）
   */
  getDefaultProfile() {
    if (!this.config.defaultProfileId) {
      // 如果没有设置默认 Profile，返回标记为默认的或第一个
      const defaultProfile = this.config.apiProfiles?.find(p => p.isDefault)
      if (defaultProfile) {
        this.config.defaultProfileId = defaultProfile.id
        this.save()
        return defaultProfile
      }

      if (this.config.apiProfiles && this.config.apiProfiles.length > 0) {
        this.config.defaultProfileId = this.config.apiProfiles[0].id
        this.config.apiProfiles[0].isDefault = true
        this.save()
        return this.config.apiProfiles[0]
      }

      return null
    }

    const profile = this.getAPIProfile(this.config.defaultProfileId)

    // 如果默认 Profile 不存在，回退到标记为默认的或第一个
    if (!profile) {
      const fallback = this.config.apiProfiles?.find(p => p.isDefault)
        || this.config.apiProfiles?.[0]

      if (fallback) {
        this.config.defaultProfileId = fallback.id
        this.save()
        return fallback
      }

      return null
    }

    return profile
  },

  /**
   * 获取默认 Profile ID
   */
  getDefaultProfileId() {
    return this.config.defaultProfileId
  }
}

module.exports = {
  apiConfigMixin
}
