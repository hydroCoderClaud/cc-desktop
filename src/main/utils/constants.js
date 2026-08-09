/**
 * Global constants for main process
 */

// Timeout Settings
const TIMEOUTS = {
  API_TEST: 30000,           // 30 seconds for connection test
  API_REQUEST: 120000        // 120 seconds (2 minutes) for actual requests
};

// Legacy provider defaults used only to migrate old configurations into API Profiles.
const SERVICE_PROVIDERS = {
  qwen: {
    label: '千问tokenplan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    defaultModels: [
      'qwen3.7-plus',
      'qwen3.7-max',
      'qwen-image-2.0-pro',
      'wan2.7-image-pro',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'kimi-k2.7-code',
      'glm-5.2'
    ]
  },
  deepseek: {
    label: 'deepseek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModels: [
      'deepseek-v4-flash[1m]',
      'deepseek-v4-pro[1m]'
    ]
  }
};

module.exports = {
  TIMEOUTS,
  SERVICE_PROVIDERS
};
