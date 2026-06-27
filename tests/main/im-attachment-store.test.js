import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  sanitizeAttachmentFilename,
  saveInboundAttachment,
} from '../../src/main/managers/im-attachment-store.js'

const tempRoots = []

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'im-attachment-store-'))
  tempRoots.push(root)
  return root
}

describe('im attachment store', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sanitizes filenames before saving inbound attachments', async () => {
    const root = makeTempRoot()
    const saved = await saveInboundAttachment({
      cwd: root,
      filename: '../bad<name>.pdf',
      buffer: Buffer.from('pdf'),
    })

    expect(path.basename(saved.filePath)).toBe('bad_name_.pdf')
    expect(saved.filename).toBe('bad_name_.pdf')
    expect(fs.readFileSync(saved.filePath, 'utf-8')).toBe('pdf')
    expect(saved.filePath.startsWith(path.join(root, 'im_attachments'))).toBe(true)
  })

  it('keeps duplicate inbound filenames without overwriting existing files', async () => {
    const root = makeTempRoot()
    const first = await saveInboundAttachment({
      cwd: root,
      filename: 'report.pdf',
      buffer: Buffer.from('one'),
    })
    const second = await saveInboundAttachment({
      cwd: root,
      filename: 'report.pdf',
      buffer: Buffer.from('two'),
    })

    expect(path.basename(first.filePath)).toBe('report.pdf')
    expect(path.basename(second.filePath)).toBe('report-1.pdf')
    expect(fs.readFileSync(first.filePath, 'utf-8')).toBe('one')
    expect(fs.readFileSync(second.filePath, 'utf-8')).toBe('two')
  })

  it('returns a fallback filename when sanitizing an empty value', () => {
    expect(sanitizeAttachmentFilename('   ', 'fallback.txt')).toBe('fallback.txt')
  })
})
