import dingtalkIcon from './assets/dingtalk.svg'
import feishuIcon from './assets/feishu.svg'
import wecomIcon from './assets/wecom.svg'
import weixinIcon from './assets/weixin.svg'

/**
 * Unified icon system.
 * System icons are stored as SVG resources and rendered inline for theme support.
 * Brand icons keep their original colored SVG assets.
 * Usage: <Icon name="refresh" :size="20" />
 */

const systemIconModules = import.meta.glob('./assets/system/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})

const getIconNameFromPath = (filePath) => filePath.split('/').pop()?.replace(/\.svg$/i, '') || ''

const parseSvgIcon = (svgSource) => {
  const source = String(svgSource || '')
  const viewBox = source.match(/<svg\b[^>]*\bviewBox=["']([^"']+)["']/i)?.[1] || '0 0 20 20'
  const body = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1]?.trim() || source.trim()
  return { viewBox, body }
}

const systemIconEntries = Object.entries(systemIconModules)
  .map(([filePath, source]) => [getIconNameFromPath(filePath), parseSvgIcon(source)])
  .filter(([name]) => Boolean(name))
  .sort(([left], [right]) => left.localeCompare(right))

export const iconDefinitions = Object.fromEntries(systemIconEntries)

// Backward-compatible fragment map for any direct consumers.
export const iconPaths = Object.fromEntries(
  systemIconEntries.map(([name, definition]) => [name, definition.body])
)

export const iconAssets = {
  dingtalk: dingtalkIcon,
  weixin: weixinIcon,
  wecom: wecomIcon,
  feishu: feishuIcon
}

// Icon name list for validation.
export const iconNames = Array.from(new Set([...Object.keys(iconDefinitions), ...Object.keys(iconAssets)]))

export default iconPaths
