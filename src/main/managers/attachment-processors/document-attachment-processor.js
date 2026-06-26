const { AttachmentProcessor } = require('../attachment-processor')
const { buildAttachmentBase, inferAttachmentMimeType } = require('../attachment-types')
const { readFileContent } = require('../notebook-file-reader')

class DocumentAttachmentProcessor extends AttachmentProcessor {
  match(input = {}) {
    const ext = typeof input.ext === 'string' ? input.ext.toLowerCase() : ''
    return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.html', '.htm', '.txt', '.md'].includes(ext) ||
      input.type === 'document' ||
      input.type === 'text' ||
      input.type === 'html'
  }

  normalize(input = {}) {
    const ext = typeof input.ext === 'string' ? input.ext.toLowerCase() : ''
    const mimeType = input.mimeType || inferAttachmentMimeType(input.type || 'document', ext)
    return buildAttachmentBase({
      filePath: input.filePath,
      name: input.name,
      size: input.size,
      ext,
      type: input.type || 'document',
      mimeType,
      source: input.source || 'desktop',
      channel: input.channel || null,
      kind: 'document',
      subKind: ext.replace('.', '') || 'document'
    })
  }

  async preparePreview(attachment, input = {}) {
    if (!input.filePath) return attachment

    let previewData
    try {
      previewData = await readFileContent(input.filePath)
    } catch (err) {
      return {
        ...attachment,
        preview: { kind: 'text', content: '' },
        meta: {
          ...(attachment.meta || {}),
          previewError: err.message
        }
      }
    }
    const next = { ...attachment }

    if (previewData?.type === 'text') {
      next.preview = { kind: 'text', content: previewData.content }
      return next
    }

    if (previewData?.type === 'html') {
      next.preview = { kind: 'html', content: previewData.content }
      return next
    }

    if (previewData?.type === 'word') {
      next.preview = { kind: 'word', content: previewData.content }
      return next
    }

    if (previewData?.type === 'excel') {
      next.preview = { kind: 'excel', content: previewData.content }
      next.meta = {
        ...(next.meta || {}),
        ...(previewData.meta || {})
      }
      return next
    }

    if (previewData?.type === 'pdf') {
      next.preview = { kind: 'pdf', content: previewData.content }
      return next
    }

    if (previewData?.type === 'pptx') {
      next.preview = { kind: 'pptx', content: previewData.content }
      return next
    }

    return next
  }

}

module.exports = { DocumentAttachmentProcessor }
