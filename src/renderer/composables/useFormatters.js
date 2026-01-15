/**
 * Shared Formatters and Utilities
 */

/**
 * Format timestamp to date string
 */
export function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format timestamp to time string (HH:mm:ss)
 */
export function formatTime(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Format timestamp to short time string (HH:mm)
 */
export function formatTimeShort(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Scroll element into view with centering
 */
export function scrollToElement(selector, delay = 0) {
  setTimeout(() => {
    const el = document.querySelector(selector)
    if (el) {
      const scrollContainer = el.closest('.n-scrollbar-container')
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const scrollTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
        scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, delay)
}
