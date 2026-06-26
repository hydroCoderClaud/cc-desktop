const path = require('path')

const DOCUMENT_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.html', '.htm'])

function inferAttachmentKind(type, ext) {
  if (type === 'image') return 'image'
  if (type === 'video' || type === 'audio') return 'media'
  if (type === 'html' || type === 'text') return 'document'
  if (ext && DOCUMENT_EXTS.has(ext)) return 'document'
  return 'document'
}

function inferAttachmentSubKind(type, ext) {
  if (type === 'image') return ext?.replace('.', '') || 'image'
  if (type === 'video') return ext?.replace('.', '') || 'video'
  if (type === 'audio') return ext?.replace('.', '') || 'audio'
  return ext?.replace('.', '') || 'file'
}

function inferAttachmentMimeType(type, ext) {
  if (type === 'image') return ext === '.svg' ? 'image/svg+xml' : `image/${ext?.replace('.', '') || 'png'}`
  if (type === 'video') return `video/${ext?.replace('.', '') || 'mp4'}`
  if (type === 'audio') return `audio/${ext?.replace('.', '') || 'mpeg'}`
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.doc') return 'application/msword'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.xls') return 'application/vnd.ms-excel'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.ppt') return 'application/vnd.ms-powerpoint'
  if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (type === 'html') return 'text/html'
  if (type === 'text') return 'text/plain'
  return 'application/octet-stream'
}

function buildAttachmentBase({
  filePath,
  name,
  size,
  ext,
  type,
  mimeType,
  source = 'desktop',
  channel = null,
  kind,
  subKind
}) {
  return {
    id: filePath || `${name || 'attachment'}-${size || 0}-${Date.now()}`,
    kind: kind || inferAttachmentKind(type, ext),
    subKind: subKind || inferAttachmentSubKind(type, ext),
    mimeType: mimeType || inferAttachmentMimeType(type, ext),
    filename: name || path.basename(filePath || '') || 'attachment',
    sizeBytes: size || 0,
    source,
    channel,
    localPath: filePath || null,
    remoteRef: null,
    preview: null,
    transcript: null,
    meta: {
      ext: ext || null,
      legacyType: type || null
    }
  }
}

module.exports = {
  buildAttachmentBase,
  inferAttachmentKind,
  inferAttachmentSubKind,
  inferAttachmentMimeType
}
