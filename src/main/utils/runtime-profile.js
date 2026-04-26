function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return null

  const normalized = {}

  for (const tier of ['opus', 'sonnet', 'haiku']) {
    const value = normalizeModelValue(mapping[tier])
    if (value) {
      normalized[tier] = value
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

function getProviderDefaultModelMapping(profile, configManager) {
  const providerId = normalizeModelValue(profile?.serviceProvider)
  if (!providerId || typeof configManager?.getServiceProviderDefinition !== 'function') {
    return null
  }

  const provider = configManager.getServiceProviderDefinition(providerId)
  return normalizeModelMapping(provider?.defaultModelMapping)
}

function buildRuntimeProfile(profile, configManager) {
  if (!profile || typeof profile !== 'object') return profile

  const modelMapping = getProviderDefaultModelMapping(profile, configManager)

  if (!modelMapping && !Object.prototype.hasOwnProperty.call(profile, 'modelMapping')) {
    return profile
  }

  const runtimeProfile = { ...profile }
  if (modelMapping) {
    runtimeProfile.modelMapping = modelMapping
  } else {
    delete runtimeProfile.modelMapping
  }

  return runtimeProfile
}

module.exports = {
  buildRuntimeProfile,
  getProviderDefaultModelMapping,
  normalizeModelMapping
}
