const MODEL_TIERS = ['opus', 'sonnet', 'haiku']

function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return null

  const normalized = {}

  for (const tier of MODEL_TIERS) {
    const value = normalizeModelValue(mapping[tier])
    if (value) {
      normalized[tier] = value
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

function mergeModelMappings(baseMapping, overrideMapping) {
  const normalizedBase = normalizeModelMapping(baseMapping)
  const normalizedOverride = normalizeModelMapping(overrideMapping)

  if (!normalizedBase && !normalizedOverride) return null

  const merged = {}

  for (const tier of MODEL_TIERS) {
    const value = normalizedOverride?.[tier] || normalizedBase?.[tier] || ''
    if (value) {
      merged[tier] = value
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
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

  const modelMapping = mergeModelMappings(
    getProviderDefaultModelMapping(profile, configManager),
    profile.modelMapping
  )

  if (!modelMapping && !profile.modelMapping) {
    return profile
  }

  return {
    ...profile,
    modelMapping
  }
}

module.exports = {
  buildRuntimeProfile,
  getProviderDefaultModelMapping,
  mergeModelMappings,
  normalizeModelMapping
}
