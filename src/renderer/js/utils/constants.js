/**
 * Global constants for renderer process
 */

// API Configuration Defaults
const API_DEFAULTS = {
  BASE_URL: 'https://api.anthropic.com',
  MODEL: 'claude-sonnet-4-5-20250929',
  AUTH_TYPE: 'api_key'
};

// Proxy Defaults
const PROXY_DEFAULTS = {
  HTTPS_PROXY: 'http://127.0.0.1:7890',
  HTTP_PROXY: 'http://127.0.0.1:7890'
};

// UI Timeouts
const UI_TIMEOUTS = {
  ALERT_DISPLAY: 3000,        // 3 seconds for alert display
  TOAST_DISPLAY: 3000,        // 3 seconds for toast display
  RESIZE_DEBOUNCE: 100        // 100ms debounce for window resize
};

// Profile Icons
const PROFILE_ICONS = [
  '🟣', '🔵', '🟢', '🟡', '🟠', '🔴',
  '⚫', '⚪', '🟤', '🔷', '🔶', '🔸',
  '🌟', '⭐', '✨', '💫', '🚀', '🎯'
];

// Export for use in other modules
// Note: In browser context, these can be accessed via window or as globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_DEFAULTS,
    PROXY_DEFAULTS,
    UI_TIMEOUTS,
    PROFILE_ICONS
  };
}
