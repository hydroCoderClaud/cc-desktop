/**
 * Shared Utility Functions
 * Used across multiple modules (profile-manager, provider-manager, etc.)
 */

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if provider is an official provider (no model mapping needed)
 * @param {string} providerId - Provider ID
 * @returns {boolean}
 */
function isOfficialProvider(providerId) {
  return OFFICIAL_PROVIDERS.includes(providerId);
}
