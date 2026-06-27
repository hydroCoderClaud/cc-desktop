const fs = require('fs')
const path = require('path')

const DEFAULT_ATTACHMENT_DIR = 'im_attachments'

function sanitizeAttachmentFilename(filename, fallback = 'attachment') {
  const raw = typeof filename === 'string' && filename.trim()
    ? filename.trim()
    : fallback
  const basename = path.basename(raw)
  const cleaned = basename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
  return cleaned || fallback
}

async function resolveUniqueAttachmentPath(dir, filename) {
  const safeFilename = sanitizeAttachmentFilename(filename)
  const ext = path.extname(safeFilename)
  const stem = path.basename(safeFilename, ext) || 'attachment'
  let candidate = path.join(dir, safeFilename)
  let index = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${index}${ext}`)
    index += 1
  }

  return candidate
}

async function saveInboundAttachment({
  cwd,
  filename,
  buffer,
  subdir = DEFAULT_ATTACHMENT_DIR,
} = {}) {
  const root = typeof cwd === 'string' && cwd.trim() ? cwd.trim() : ''
  if (!root) {
    throw new Error('cwd is required to save inbound IM attachment')
  }
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('buffer is required to save inbound IM attachment')
  }

  const attachmentDir = path.join(root, subdir)
  await fs.promises.mkdir(attachmentDir, { recursive: true })
  const filePath = await resolveUniqueAttachmentPath(attachmentDir, filename)
  await fs.promises.writeFile(filePath, buffer)

  return {
    filePath,
    filename: path.basename(filePath),
    sizeBytes: buffer.length,
  }
}

module.exports = {
  DEFAULT_ATTACHMENT_DIR,
  sanitizeAttachmentFilename,
  resolveUniqueAttachmentPath,
  saveInboundAttachment,
}
