import { describe, expect, it } from 'vitest'
import { ImageAttachmentProcessor } from '../../src/main/managers/attachment-processors/image-attachment-processor.js'

describe('ImageAttachmentProcessor', () => {
  it('matches and normalizes image inputs', () => {
    const processor = new ImageAttachmentProcessor()
    expect(processor.match({ ext: '.png' })).toBe(true)

    const attachment = processor.normalize({
      filePath: 'C:/tmp/pixel.png',
      name: 'pixel.png',
      size: 42,
      ext: '.png'
    })

    expect(attachment).toMatchObject({
      kind: 'image',
      subKind: 'png',
      mimeType: 'image/png',
      filename: 'pixel.png'
    })
  })

  it('builds legacy image payload for agent input', () => {
    const processor = new ImageAttachmentProcessor()
    const attachment = processor.normalize({
      filePath: 'C:/tmp/pixel.png',
      name: 'pixel.png',
      size: 42,
      ext: '.png'
    })

    const extracted = processor.extractForAgent(attachment, {
      dataUrl: 'data:image/png;base64,QUJD'
    })

    expect(extracted.attachments).toHaveLength(1)
    expect(extracted.images).toHaveLength(1)
    expect(extracted.images[0]).toMatchObject({
      base64: 'QUJD',
      mediaType: 'image/png',
      attachmentId: attachment.id
    })
  })
})
