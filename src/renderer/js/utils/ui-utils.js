/**
 * UI Utility Functions
 * Shared functions for alert display, password toggling, etc.
 */

/**
 * Show alert message
 * @param {string} message - Message to display
 * @param {string} type - Alert type: 'success', 'error', 'warning', 'info'
 * @param {string} alertId - ID of the alert element (default: 'alert')
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showAlert(message, type = 'success', alertId = 'alert', duration = 3000) {
  const alertEl = document.getElementById(alertId);
  if (!alertEl) {
    console.warn('[UI Utils] Alert element not found:', alertId);
    return;
  }

  alertEl.className = `alert alert-${type} visible`;
  alertEl.textContent = message;

  setTimeout(() => {
    alertEl.classList.remove('visible');
  }, duration);
}

/**
 * Show modal alert (for use within modals)
 * @param {string} message - Message to display
 * @param {string} type - Alert type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showModalAlert(message, type = 'success', duration = 3000) {
  const alertEl = document.getElementById('modalAlert');
  if (!alertEl) {
    // Fallback to main alert if modal alert not found
    showAlert(message, type);
    return;
  }

  alertEl.className = `alert alert-${type} visible`;
  alertEl.textContent = message;
  alertEl.style.display = 'block';

  setTimeout(() => {
    alertEl.classList.remove('visible');
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 300);
  }, duration);
}

/**
 * Toggle password visibility
 * @param {string} inputId - ID of the password input element
 */
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) {
    console.warn('[UI Utils] Input element not found:', inputId);
    return;
  }

  const buttonId = 'toggle' + inputId.charAt(0).toUpperCase() + inputId.slice(1);
  const button = document.getElementById(buttonId);

  if (input.type === 'password') {
    input.type = 'text';
    if (button) {
      button.textContent = '🙈';
      button.title = '隐藏';
    }
  } else {
    input.type = 'password';
    if (button) {
      button.textContent = '👁️';
      button.title = '显示/隐藏';
    }
  }
}

/**
 * HTML escape function to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return '未知';

  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  // 小于1小时
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  }

  // 小于1天
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  }

  // 超过1天
  return date.toLocaleDateString('zh-CN');
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showAlert,
    showModalAlert,
    togglePasswordVisibility,
    escapeHtml,
    formatDate
  };
}
