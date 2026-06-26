import { describe, expect, it } from 'vitest'
import {
  buildAttachmentBase,
  inferAttachmentKind,
  inferAttachmentSubKind,
  inferAttachmentMimeType
} from '../../src/main/managers/attachment-types.js'

describe('attachment types', () => {
  it('infers document and media attachment fields', () => {
    expect(inferAttachmentKind('image', '.png')).toBe('image')
    expect(inferAttachmentKind('text', '.md')).toBe('document')
    expect(inferAttachmentKind('video', '.mp4')).toBe('media')
    expect(inferAttachmentSubKind('image', '.png')).toBe('png')
    expect(inferAttachmentSubKind('video', '.mp4')).toBe('mp4')
    expect(inferAttachmentMimeType('image', '.svg')).toBe('image/svg+xml')
    expect(inferAttachmentMimeType('text', '.md')).toBe('text/plain')
    expect(inferAttachmentMimeType('video', '.mp4')).toBe('video/mp4')
  })

  it('builds a stable attachment base', () => {
    const attachment = buildAttachmentBase({
      filePath: 'C:/tmp/demo.png',
      name: 'demo.png',
      size: 123,
      ext: '.png',
      type: 'image',
      source: 'desktop'
    })

    expect(attachment).toMatchObject({
      kind: 'image',
      subKind: 'png',
      mimeType: 'image/png',
      filename: 'demo.png',
      sizeBytes: 123,
      source: 'desktop',
      localPath: 'C:/tmp/demo.png'
    })
  })
})
