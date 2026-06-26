import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DocumentAttachmentProcessor } from '../../src/main/managers/attachment-processors/document-attachment-processor.js'
import { readFileContent } from '../../src/main/managers/notebook-file-reader.js'

const tempRoots = []

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'document-attachment-'))
  tempRoots.push(root)
  return root
}

describe('DocumentAttachmentProcessor', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('matches common document inputs', () => {
    const processor = new DocumentAttachmentProcessor()
    expect(processor.match({ ext: '.pdf' })).toBe(true)
    expect(processor.match({ ext: '.docx' })).toBe(true)
    expect(processor.match({ ext: '.xlsx' })).toBe(true)
    expect(processor.match({ ext: '.pptx' })).toBe(true)
  })

  it('normalizes document attachments', () => {
    const processor = new DocumentAttachmentProcessor()
    const attachment = processor.normalize({
      filePath: 'C:/tmp/report.pdf',
      name: 'report.pdf',
      size: 100,
      ext: '.pdf',
      type: 'document'
    })

    expect(attachment).toMatchObject({
      kind: 'document',
      subKind: 'pdf',
      mimeType: 'application/pdf',
      filename: 'report.pdf',
      sizeBytes: 100
    })
  })

  it('keeps PDF files as preview-only document attachments', async () => {
    const root = makeTempRoot()
    const pdfPath = path.join(root, 'sample.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake pdf content', 'utf-8')

    const preview = await readFileContent(pdfPath)
    expect(preview.type).toBe('pdf')
    expect(preview.content).toBe(pdfPath)

    const processor = new DocumentAttachmentProcessor()
    const attachment = processor.normalize({
      filePath: pdfPath,
      name: 'sample.pdf',
      size: fs.statSync(pdfPath).size,
      ext: '.pdf',
      type: 'document'
    })
    const prepared = await processor.preparePreview(attachment, { filePath: pdfPath })

    expect(prepared.preview).toEqual({ kind: 'pdf', content: pdfPath })
  })

  it('prepares text previews without creating an agent extraction payload', async () => {
    const root = makeTempRoot()
    const textPath = path.join(root, 'notes.txt')
    fs.writeFileSync(textPath, 'plain text preview', 'utf-8')

    const processor = new DocumentAttachmentProcessor()
    const attachment = processor.normalize({
      filePath: textPath,
      name: 'notes.txt',
      size: fs.statSync(textPath).size,
      ext: '.txt',
      type: 'document'
    })
    const prepared = await processor.preparePreview(attachment, { filePath: textPath })

    expect(prepared.preview).toEqual({ kind: 'text', content: 'plain text preview' })
  })
})
