const path = require('path')
const { buildAttachmentBase, inferAttachmentMimeType } = require('./attachment-types')

const DEFAULT_OUTBOUND_FILE_MAX_SIZE = 30 * 1024 * 1024
const SUPPORTED_OUTBOUND_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'])

function normalizeOutboundFilePaths({ filePaths = [], attachments = [] } = {}) {
  const paths = []
  const pushPath = (value) => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) return
    assertSupportedOutboundFilePath(normalized)
    paths.push(normalized)
  }

  if (Array.isArray(filePaths)) {
    filePaths.forEach(pushPath)
  }

  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      if (typeof attachment === 'string') {
        pushPath(attachment)
      } else if (attachment && typeof attachment === 'object') {
        pushPath(attachment.localPath || attachment.filePath || attachment.path)
      }
    }
  }

  return [...new Set(paths)]
}

function isSupportedOutboundDocumentPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return SUPPORTED_OUTBOUND_DOCUMENT_EXTENSIONS.has(ext)
}

function assertSupportedOutboundFilePath(filePath) {
  if (isSupportedOutboundDocumentPath(filePath)) return
  const ext = path.extname(String(filePath || '')).toLowerCase() || '(none)'
  throw new Error(`暂不支持发送该文件类型: ${ext}。当前仅支持 PDF、Word、Excel、PowerPoint 文件`)
}

function buildSavedInboundFileAttachment({
  filePath,
  filename,
  sizeBytes = 0,
  mimeType = '',
  channel,
  remoteRef = null,
  source = 'inbound',
  original = {},
  meta = {},
} = {}) {
  const resolvedPath = typeof filePath === 'string' ? filePath : ''
  const resolvedFilename = filename || path.basename(resolvedPath) || 'attachment'
  const ext = path.extname(resolvedFilename || resolvedPath).toLowerCase()
  const normalized = buildAttachmentBase({
    filePath: resolvedPath,
    name: resolvedFilename,
    size: sizeBytes,
    ext,
    type: 'document',
    mimeType: mimeType || inferAttachmentMimeType('document', ext),
    source,
    channel,
    kind: original.kind || 'document',
    subKind: original.subKind || ext.replace('.', '') || 'file',
  })

  return {
    ...normalized,
    id: original.id || normalized.id,
    remoteRef: remoteRef || original.remoteRef || null,
    meta: {
      ...(normalized.meta || {}),
      ...(original.meta || {}),
      ...meta,
    },
  }
}

module.exports = {
  DEFAULT_OUTBOUND_FILE_MAX_SIZE,
  SUPPORTED_OUTBOUND_DOCUMENT_EXTENSIONS,
  normalizeOutboundFilePaths,
  isSupportedOutboundDocumentPath,
  assertSupportedOutboundFilePath,
  buildSavedInboundFileAttachment,
}
