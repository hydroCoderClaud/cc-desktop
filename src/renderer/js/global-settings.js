/**
 * Global Settings Manager
 * Handles global model configuration and timeout settings
 */

// Default values
const DEFAULTS = {
  globalModels: {
    opus: 'claude-opus-4-5-20251101',
    sonnet: 'claude-sonnet-4-5-20250929',
    haiku: 'claude-haiku-4-5-20251001'
  },
  timeout: {
    test: 30,      // seconds
    request: 120   // seconds
  }
};

/**
 * Initialize the page
 */
async function init() {
  console.log('[Global Settings] Initializing...');
  await loadSettings();
}

/**
 * Load current settings from backend
 */
async function loadSettings() {
  try {
    // Get global models
    const globalModels = await window.electronAPI.getGlobalModels();
    console.log('[Global Settings] Loaded global models:', globalModels);

    // Populate model inputs - show actual config values or empty
    // Don't auto-fill defaults to distinguish config values from fallbacks
    document.getElementById('globalOpus').value = 
      (globalModels && globalModels.opus) || '';
    document.getElementById('globalSonnet').value = 
      (globalModels && globalModels.sonnet) || '';
    document.getElementById('globalHaiku').value = 
      (globalModels && globalModels.haiku) || '';

    // Get timeout settings
    const timeout = await window.electronAPI.getTimeout();
    console.log('[Global Settings] Loaded timeout:', timeout);

    // Populate timeout inputs (convert ms to seconds)
    document.getElementById('testTimeout').value = 
      timeout && timeout.test ? timeout.test / 1000 : DEFAULTS.timeout.test;
    document.getElementById('requestTimeout').value = 
      timeout && timeout.request ? timeout.request / 1000 : DEFAULTS.timeout.request;

  } catch (error) {
    console.error('[Global Settings] Error loading settings:', error);
    showMessage('加载设置失败: ' + error.message, 'error');
    
    // On error, leave fields empty to distinguish from valid config
    document.getElementById('globalOpus').value = '';
    document.getElementById('globalSonnet').value = '';
    document.getElementById('globalHaiku').value = '';
    document.getElementById('testTimeout').value = DEFAULTS.timeout.test;
    document.getElementById('requestTimeout').value = DEFAULTS.timeout.request;
  }
}

/**
 * Save settings to backend
 */
async function saveSettings() {
  try {
    // Collect model values - use defaults for empty fields
    const globalModels = {
      opus: document.getElementById('globalOpus').value.trim() || DEFAULTS.globalModels.opus,
      sonnet: document.getElementById('globalSonnet').value.trim() || DEFAULTS.globalModels.sonnet,
      haiku: document.getElementById('globalHaiku').value.trim() || DEFAULTS.globalModels.haiku
    };

    // Model names should always be valid (either user input or defaults)
    // No validation needed since we use defaults for empty fields

    // Collect timeout values (convert seconds to ms)
    const timeout = {
      test: parseInt(document.getElementById('testTimeout').value) * 1000,
      request: parseInt(document.getElementById('requestTimeout').value) * 1000
    };

    // Validate timeout values
    if (timeout.test < 5000 || timeout.test > 120000) {
      showMessage('连接测试超时必须在 5-120 秒之间', 'error');
      return;
    }

    if (timeout.request < 10000 || timeout.request > 3600000) {
      showMessage('请求超时必须在 10-3600 秒之间（最长 1 小时）', 'error');
      return;
    }

    console.log('[Global Settings] Saving global models:', globalModels);
    console.log('[Global Settings] Saving timeout:', timeout);

    // Save to backend
    await window.electronAPI.updateGlobalModels(globalModels);
    await window.electronAPI.updateTimeout(timeout);

    showMessage('设置已保存', 'success');

    // Reload settings to show actual saved values
    await loadSettings();

  } catch (error) {
    console.error('[Global Settings] Error saving settings:', error);
    showMessage('保存失败: ' + error.message, 'error');
  }
}

/**
 * Reset all settings to defaults
 */
async function resetToDefaults() {
  if (!confirm('确定要恢复默认设置吗？')) {
    return;
  }

  try {
    // Reset global models
    document.getElementById('globalOpus').value = DEFAULTS.globalModels.opus;
    document.getElementById('globalSonnet').value = DEFAULTS.globalModels.sonnet;
    document.getElementById('globalHaiku').value = DEFAULTS.globalModels.haiku;

    // Reset timeout
    document.getElementById('testTimeout').value = DEFAULTS.timeout.test;
    document.getElementById('requestTimeout').value = DEFAULTS.timeout.request;

    // Save to backend
    await window.electronAPI.updateGlobalModels(DEFAULTS.globalModels);
    await window.electronAPI.updateTimeout({
      test: DEFAULTS.timeout.test * 1000,
      request: DEFAULTS.timeout.request * 1000
    });

    showMessage('已恢复默认设置', 'success');

    // Reload settings to show actual saved values
    await loadSettings();

  } catch (error) {
    console.error('[Global Settings] Error resetting to defaults:', error);
    showMessage('恢复默认失败: ' + error.message, 'error');
  }
}

/**
 * Show status message
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(message, type) {
  const messageEl = document.getElementById('statusMessage');
  messageEl.textContent = message;
  messageEl.className = `status-message ${type}`;
  messageEl.style.display = 'block';

  // Auto-hide after 3 seconds
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 3000);
}

/**
 * Use default value for a specific input
 * @param {string} inputId - The ID of the input element
 * @param {string} defaultValue - The default value to use
 */
function useDefault(inputId, defaultValue) {
  document.getElementById(inputId).value = defaultValue;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
