/**
 * Shared constants for renderer process
 */

/**
 * Color palette for tags
 * Based on Material Design colors
 */
export const TAG_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#cddc39',
  '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'
]

/**
 * Default tag color
 */
export const DEFAULT_TAG_COLOR = '#888888'

/**
 * Maximum number of visible tags before showing "+N" dropdown
 */
export const MAX_VISIBLE_TAGS = 5

/**
 * Agent color mapping
 * Used for displaying agent color indicators
 */
export const AGENT_COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
  gray: '#6b7280'
}

/**
 * Get agent color by name, with fallback to blue
 * @param {string} color - Color name
 * @returns {string} Hex color code
 */
export const getAgentColor = (color) => AGENT_COLORS[color] || AGENT_COLORS.blue
