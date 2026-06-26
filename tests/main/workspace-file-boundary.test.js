import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import XLSX from 'xlsx'
import { setupProjectFilesHandlers } from '../../src/main/ipc-handlers/project-files-handlers.js'
import AgentFileManager from '../../src/main/managers/agent-file-manager.js'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler)
    }
  }
}

describe('workspace file write boundaries', () => {
  let tmpRoot
  let workspaceRoot
  let outsidePath

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-file-boundary-'))
    workspaceRoot = path.join(tmpRoot, 'workspace')
    outsidePath = path.join(tmpRoot, 'outside.txt')
    fs.mkdirSync(workspaceRoot, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects project create and rename targets outside the project root', async () => {
    const ipcMain = createMockIpcMain()
    setupProjectFilesHandlers(ipcMain)

    const createFile = ipcMain.handlers.get('project:createFile')
    const renameFile = ipcMain.handlers.get('project:renameFile')
    expect(createFile).toBeTypeOf('function')
    expect(renameFile).toBeTypeOf('function')

    const createResult = await createFile(null, {
      rootPath: workspaceRoot,
      parentPath: '',
      name: '../outside.txt',
      isDirectory: false
    })
    expect(createResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)

    const sourcePath = path.join(workspaceRoot, 'source.txt')
    fs.writeFileSync(sourcePath, 'source', 'utf-8')

    const renameResult = await renameFile(null, {
      rootPath: workspaceRoot,
      oldPath: 'source.txt',
      newName: '../outside.txt'
    })
    expect(renameResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)
    expect(fs.existsSync(sourcePath)).toBe(true)
  })

  it('rejects agent create and rename targets outside the session cwd', async () => {
    const fileManager = new AgentFileManager({
      sessions: new Map([['s1', { id: 's1', cwd: workspaceRoot }]])
    })

    const createResult = await fileManager.createFile('s1', '', '../outside.txt', false)
    expect(createResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)

    const sourcePath = path.join(workspaceRoot, 'source.txt')
    fs.writeFileSync(sourcePath, 'source', 'utf-8')

    const renameResult = await fileManager.renameFile('s1', 'source.txt', '../outside.txt')
    expect(renameResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)
    expect(fs.existsSync(sourcePath)).toBe(true)
  })

  it('returns a compatible attachment view for text and image files', async () => {
    const fileManager = new AgentFileManager({
      sessions: new Map([['s1', { id: 's1', cwd: workspaceRoot }]])
    })

    const textPath = path.join(workspaceRoot, 'note.txt')
    fs.writeFileSync(textPath, 'hello attachment', 'utf-8')

    const textResult = await fileManager.readFile('s1', 'note.txt')
    expect(textResult.type).toBe('text')
    expect(textResult.content).toBe('hello attachment')
    expect(textResult.attachment).toMatchObject({
      kind: 'document',
      subKind: 'txt',
      mimeType: 'text/plain',
      filename: 'note.txt',
      localPath: textPath
    })

    const imagePath = path.join(workspaceRoot, 'pixel.png')
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
      'hex'
    )
    fs.writeFileSync(imagePath, pngBytes)

    const imageResult = await fileManager.readFile('s1', 'pixel.png')
    expect(imageResult.type).toBe('image')
    expect(imageResult.content.startsWith('data:image/png;base64,')).toBe(true)
    expect(imageResult.attachment).toMatchObject({
      kind: 'image',
      subKind: 'png',
      mimeType: 'image/png',
      filename: 'pixel.png',
      localPath: imagePath
    })
  })

  it('returns a compatible attachment view for document-like files', async () => {
    const fileManager = new AgentFileManager({
      sessions: new Map([['s1', { id: 's1', cwd: workspaceRoot }]])
    })

    const docxPath = path.join(workspaceRoot, 'report.docx')
    fs.writeFileSync(docxPath, 'fake docx content', 'utf-8')

    const docxResult = await fileManager.readFile('s1', 'report.docx')
    expect(docxResult.attachment).toMatchObject({
      kind: 'document',
      subKind: 'docx',
      filename: 'report.docx',
      localPath: docxPath
    })

    const pdfPath = path.join(workspaceRoot, 'paper.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake pdf content', 'utf-8')

    const pdfResult = await fileManager.readFile('s1', 'paper.pdf')
    expect(pdfResult.type).toBe('pdf')
    expect(pdfResult.attachment).toMatchObject({
      kind: 'document',
      subKind: 'pdf',
      mimeType: 'application/pdf',
      filename: 'paper.pdf',
      localPath: pdfPath
    })

    const xlsxPath = path.join(workspaceRoot, 'table.xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name', 'value'], ['A', 1]]), 'Sheet1')
    XLSX.writeFile(workbook, xlsxPath)

    const xlsxResult = await fileManager.readFile('s1', 'table.xlsx')
    expect(xlsxResult.type).toBe('excel')
    expect(xlsxResult.meta).toMatchObject({ sheetNames: ['Sheet1'] })
    expect(xlsxResult.attachment).toMatchObject({
      kind: 'document',
      subKind: 'xlsx',
      filename: 'table.xlsx',
      localPath: xlsxPath
    })
  })
})
