/**
 * Legacy provider defaults used only while migrating old config files.
 *
 * Provider templates are no longer part of the runtime or UI contract. Keep
 * these constants isolated so existing installations can still migrate their
 * base URL and model list into the owning API Profile once.
 */

const { SERVICE_PROVIDERS } = require('../utils/constants')

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

function normalizeProviderDefinition(definition) {
  const providerId = typeof definition?.id === 'string' ? definition.id.trim() : ''
  const builtinProvider = SERVICE_PROVIDERS[providerId] || {}

  return {
    id: providerId,
    name: definition?.name || builtinProvider.label || providerId,
    baseUrl: definition?.baseUrl || builtinProvider.baseUrl || '',
    defaultModels: normalizeModelIds(definition?.defaultModels || builtinProvider.defaultModels || [])
  }
}

function getDefaultProviders() {
  return Object.keys(SERVICE_PROVIDERS).map(id => normalizeProviderDefinition({
    id,
    name: SERVICE_PROVIDERS[id].label,
    baseUrl: SERVICE_PROVIDERS[id].baseUrl || '',
    defaultModels: SERVICE_PROVIDERS[id].defaultModels || []
  }))
}

module.exports = {
  getDefaultProviders,
  normalizeModelIds
}
