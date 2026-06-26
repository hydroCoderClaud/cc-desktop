const { AttachmentProcessor } = require('../attachment-processor')
const { buildAttachmentBase, inferAttachmentMimeType } = require('../attachment-types')

class ImageAttachmentProcessor extends AttachmentProcessor {
  match(input = {}) {
    if (input.type === 'image') return true
    if (typeof input.mimeType === 'string' && input.mimeType.startsWith('image/')) return true
    if (typeof input.ext === 'string') return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(input.ext.toLowerCase())
    return false
  }

  normalize(input = {}) {
    const ext = typeof input.ext === 'string' ? input.ext.toLowerCase() : ''
    const mimeType = input.mimeType || inferAttachmentMimeType('image', ext)
    return buildAttachmentBase({
      filePath: input.filePath,
      name: input.name,
      size: input.size,
      ext,
      type: 'image',
      mimeType,
      source: input.source || 'desktop',
      channel: input.channel || null,
      kind: 'image',
      subKind: ext.replace('.', '') || 'image'
    })
  }

  preparePreview(attachment, input = {}) {
    const previewContent = input.dataUrl || input.content || null
    return {
      ...attachment,
      preview: previewContent ? { kind: 'image', content: previewContent } : attachment.preview
    }
  }

  toLegacyImagePayload(attachment, input = {}) {
    const rawBase64 = typeof input.base64 === 'string'
      ? input.base64
      : typeof input.dataUrl === 'string'
        ? input.dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
        : null
    if (!rawBase64) return null
    return {
      base64: rawBase64,
      mediaType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      attachmentId: attachment.id
    }
  }

  extractForAgent(attachment, input = {}) {
    const imagePayload = this.toLegacyImagePayload(attachment, input)
    return {
      attachments: [attachment],
      images: imagePayload ? [imagePayload] : []
    }
  }

  async sendOutbound(attachment, target, handlers = {}) {
    if (handlers.sendImage) {
      return handlers.sendImage(attachment, target)
    }
    return super.sendOutbound(attachment, target, handlers)
  }
}

module.exports = { ImageAttachmentProcessor }
