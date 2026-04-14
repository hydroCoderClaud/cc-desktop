import { normalizePathForDisplay } from './message-render-utils'

const FILE_URI_PREFIX = 'file://'

const toArray = (value) => Array.isArray(value) ? value : []

export const decodeFileUriToPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith(FILE_URI_PREFIX)) return null

  try {
    const url = new URL(value)
    const pathname = decodeURIComponent(url.pathname || '')
    if (/^\/[A-Za-z]:/.test(pathname)) {
      return pathname.slice(1).replace(/\//g, '\\')
    }
    return pathname || null
  } catch {
    return null
  }
}

const normalizeMimeType = (value) => {
  return typeof value === 'string' && value.trim() ? value.trim() : 'image/png'
}

const toImageArtifact = (block, index) => {
  const data = typeof block?.data === 'string' ? block.data.trim() : ''
  if (!data) return null

  const mimeType = normalizeMimeType(block.mimeType || block.mime_type)
  const name = typeof block.name === 'string' && block.name.trim()
    ? block.name.trim()
    : `image-${index + 1}.${mimeType.split('/')[1] || 'png'}`

  return {
    key: `${mimeType}:${name}:${index}`,
    name,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data}`,
    base64: data
  }
}

const toResourceArtifact = (resource, platform) => {
  const uri = typeof resource?.uri === 'string' ? resource.uri : ''
  if (!uri) return null

  const filePath = decodeFileUriToPath(uri)
  const displayPath = filePath ? normalizePathForDisplay(filePath, platform) : null

  return {
    key: uri,
    uri,
    name: typeof resource?.name === 'string' && resource.name.trim() ? resource.name.trim() : '',
    title: typeof resource?.title === 'string' && resource.title.trim() ? resource.title.trim() : '',
    mimeType: typeof resource?.mimeType === 'string' && resource.mimeType.trim() ? resource.mimeType.trim() : '',
    description: typeof resource?.description === 'string' && resource.description.trim() ? resource.description.trim() : '',
    filePath: displayPath
  }
}

const collectTextBlocks = (blocks) => {
  return blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map(block => block.text.trim())
}

export const parseMcpToolResult = (output, { platform = 'win32' } = {}) => {
  const textParts = []
  const images = []
  const resourceLinks = []
  const seenImageKeys = new Set()
  const seenResourceUris = new Set()

  const pushImage = (block) => {
    const image = toImageArtifact(block, images.length)
    if (!image || seenImageKeys.has(image.key)) return
    seenImageKeys.add(image.key)
    images.push(image)
  }

  const pushResource = (resource) => {
    const link = toResourceArtifact(resource, platform)
    if (!link || seenResourceUris.has(link.uri)) return
    seenResourceUris.add(link.uri)
    resourceLinks.push(link)
  }

  if (typeof output === 'string' && output.trim()) {
    textParts.push(output.trim())
  } else if (output && typeof output === 'object') {
    const toolResult = output.type === 'tool_result' ? output : null
    const contentBlocks = toolResult
      ? toArray(toolResult.content)
      : Array.isArray(output.content)
        ? output.content
        : []
    const structuredContent = toolResult?.structuredContent || output.structuredContent || null

    if (output.type === 'resource_link') {
      pushResource(output)
    }

    if (output.type === 'image') {
      pushImage(output)
    }

    collectTextBlocks(contentBlocks).forEach(text => textParts.push(text))

    for (const block of contentBlocks) {
      if (!block || typeof block !== 'object') continue

      if (block.type === 'resource_link') {
        pushResource(block)
      } else if (block.type === 'image') {
        pushImage(block)
      }
    }

    if (structuredContent?.type === 'image_result') {
      toArray(structuredContent.files).forEach(file => pushResource(file))
    }

    if (typeof output.text === 'string' && output.text.trim()) {
      textParts.push(output.text.trim())
    }
  }

  const filePaths = resourceLinks
    .map(link => link.filePath)
    .filter(Boolean)

  return {
    images,
    resourceLinks,
    filePaths,
    textParts,
    text: textParts.join('\n\n').trim(),
    hasRenderableContent: images.length > 0 || resourceLinks.length > 0 || textParts.length > 0
  }
}

export const extractToolResultFilePaths = (output, options = {}) => {
  return parseMcpToolResult(output, options).filePaths
}
