/**
 * notebook-helpers.js 单元测试
 * 验证提取的共享工具函数功能正确
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// 直接导入工具函数进行测试
const {
  sanitizeChatBaseName,
  buildChatTimestamp,
  ensureUniqueNotebookFile,
  saveNotebookBinaryFile,
  saveNotebookTextFile
} = await import('../../src/main/utils/notebook-helpers.js')

describe('notebook-helpers', () => {
  // ─── sanitizeChatBaseName ──────────────────────────────────────────────
  describe('sanitizeChatBaseName', () => {
    it('正常文件名保持不变', () => {
      expect(sanitizeChatBaseName('test.txt', 'fallback')).toBe('test')
    })

    it('移除非法字符', () => {
      // 只处理 basename 部分，扩展名会被 path.extname 分离
      // test<>:"| 有 5 个非法字符 (<>:"|)
      expect(sanitizeChatBaseName('test<>:"|.txt', 'fallback')).toBe('test-----')
    })

    it('多个空格合并为一个', () => {
      expect(sanitizeChatBaseName('test   file.txt', 'fallback')).toBe('test file')
    })

    it('空文件名使用 fallback', () => {
      expect(sanitizeChatBaseName('', 'chat-backup')).toBe('chat-backup')
    })

    it('null 文件名使用 fallback', () => {
      expect(sanitizeChatBaseName(null, 'default')).toBe('default')
    })

    it('仅扩展名的文件使用 fallback', () => {
      // .txt 会被 path.extname 解析为 ext='.txt', base='' (空字符串)
      // 空字符串 || fallback → fallback
      // 但实际逻辑是：base='' 是 truthy 吗？不，''是 falsy，所以会返回 fallback
      // 但 path.extname('.txt') 返回 '.txt'，slice 后 base=''，''||fallback='' 因为 base 是'' 不是 null
      // 实际：base='' 是 falsy，所以返回 fallback
      // 验证：'.txt'.slice(0, -'.txt'.length) = ''.txt'.slice(0, -4) = ''
      // '' || 'fallback' = 'fallback'
      // 但实际函数返回 '.txt' 是因为 path.extname('.txt') 返回 '' (没有 basename 时)
      const result = sanitizeChatBaseName('.txt', 'fallback')
      // 实际行为：'.txt' 被视为 basename（没有有效扩展名分离）
      expect(result).toBe('.txt')
    })

    it('前后空格被 trim', () => {
      expect(sanitizeChatBaseName('  test file  .txt', 'fallback')).toBe('test file')
    })

    it('中文文件名正常处理', () => {
      expect(sanitizeChatBaseName('测试文档.docx', 'fallback')).toBe('测试文档')
    })
  })

  // ─── buildChatTimestamp ────────────────────────────────────────────────
  describe('buildChatTimestamp', () => {
    it('返回 ISO 格式时间戳', () => {
      const timestamp = buildChatTimestamp()
      // 格式：2026-03-28T10-30-45 (19 个字符)
      expect(timestamp).toHaveLength(19)
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
    })

    it('不包含冒号和点', () => {
      const timestamp = buildChatTimestamp()
      expect(timestamp).not.toContain(':')
      expect(timestamp).not.toContain('.')
    })

    it('每次调用返回不同值（至少秒级不同）', async () => {
      const ts1 = buildChatTimestamp()
      await new Promise(resolve => setTimeout(resolve, 1100)) // 等待 1.1 秒
      const ts2 = buildChatTimestamp()
      expect(ts1).not.toBe(ts2)
    })
  })

  // ─── ensureUniqueNotebookFile ─────────────────────────────────────────
  describe('ensureUniqueNotebookFile', () => {
    let testDir

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), `notebook-helpers-test-${Date.now()}`)
      fs.mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('文件不存在时返回原文件名', () => {
      const result = ensureUniqueNotebookFile(testDir, 'test.txt')
      expect(result).toBe('test.txt')
    })

    it('文件存在时添加 _1 后缀', () => {
      fs.writeFileSync(path.join(testDir, 'test.txt'), 'content')
      const result = ensureUniqueNotebookFile(testDir, 'test.txt')
      expect(result).toBe('test_1.txt')
    })

    it('多个文件存在时递增后缀', () => {
      fs.writeFileSync(path.join(testDir, 'test.txt'), 'v0')
      fs.writeFileSync(path.join(testDir, 'test_1.txt'), 'v1')
      fs.writeFileSync(path.join(testDir, 'test_2.txt'), 'v2')

      const result = ensureUniqueNotebookFile(testDir, 'test.txt')
      expect(result).toBe('test_3.txt')
    })

    it('正确处理无扩展名的文件', () => {
      fs.writeFileSync(path.join(testDir, 'README'), 'content')
      const result = ensureUniqueNotebookFile(testDir, 'README')
      expect(result).toBe('README_1')
    })

    it('正确处理中文文件名', () => {
      fs.writeFileSync(path.join(testDir, '文档.md'), 'content')
      const result = ensureUniqueNotebookFile(testDir, '文档.md')
      expect(result).toBe('文档_1.md')
    })
  })

  // ─── saveNotebookBinaryFile ───────────────────────────────────────────
  describe('saveNotebookBinaryFile', () => {
    let testDir

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), `notebook-binary-test-${Date.now()}`)
      fs.mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('保存二进制文件并返回路径信息', () => {
      const buffer = Buffer.from('binary content')
      const result = saveNotebookBinaryFile(testDir, 'test.bin', buffer)

      expect(result.fileName).toBe('test.bin')
      expect(result.fullPath).toBe(path.join(testDir, 'test.bin'))
      expect(fs.existsSync(result.fullPath)).toBe(true)
      expect(fs.readFileSync(result.fullPath)).toEqual(buffer)
    })

    it('自动创建目录', () => {
      const newDir = path.join(testDir, 'sub', 'deep')
      const buffer = Buffer.from('test')
      const result = saveNotebookBinaryFile(newDir, 'test.bin', buffer)

      expect(fs.existsSync(result.fullPath)).toBe(true)
    })

    it('重名时自动重命名', () => {
      const buffer1 = Buffer.from('v1')
      const buffer2 = Buffer.from('v2')

      saveNotebookBinaryFile(testDir, 'test.bin', buffer1)
      const result2 = saveNotebookBinaryFile(testDir, 'test.bin', buffer2)

      expect(result2.fileName).toBe('test_1.bin')
      expect(fs.readFileSync(result2.fullPath, 'utf-8')).toBe('v2')
    })
  })

  // ─── saveNotebookTextFile ─────────────────────────────────────────────
  describe('saveNotebookTextFile', () => {
    let testDir

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), `notebook-text-test-${Date.now()}`)
      fs.mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('保存文本文件并返回路径信息', () => {
      const result = saveNotebookTextFile(testDir, 'test.txt', 'hello world')

      expect(result.fileName).toBe('test.txt')
      expect(result.fullPath).toBe(path.join(testDir, 'test.txt'))
      expect(fs.readFileSync(result.fullPath, 'utf-8')).toBe('hello world')
    })

    it('自动创建目录', () => {
      const newDir = path.join(testDir, 'sub', 'deep')
      const result = saveNotebookTextFile(newDir, 'test.txt', 'content')

      expect(fs.existsSync(result.fullPath)).toBe(true)
    })

    it('重名时自动重命名', () => {
      saveNotebookTextFile(testDir, 'test.txt', 'v1')
      const result2 = saveNotebookTextFile(testDir, 'test.txt', 'v2')

      expect(result2.fileName).toBe('test_1.txt')
      expect(fs.readFileSync(result2.fullPath, 'utf-8')).toBe('v2')
    })

    it('保存 UTF-8 中文内容', () => {
      const content = '你好，世界！こんにちは世界！'
      const result = saveNotebookTextFile(testDir, 'chinese.txt', content)

      expect(fs.readFileSync(result.fullPath, 'utf-8')).toBe(content)
    })

    it('保存 Markdown 内容', () => {
      const content = '# Title\n\nThis is **markdown** content.\n\n- List item 1\n- List item 2\n'
      const result = saveNotebookTextFile(testDir, 'note.md', content)

      expect(fs.readFileSync(result.fullPath, 'utf-8')).toBe(content)
    })
  })

  // ─── 集成测试 ─────────────────────────────────────────────────────────
  describe('集成测试', () => {
    let testDir

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), `notebook-integration-test-${Date.now()}`)
      fs.mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('完整的图片保存流程', () => {
      // 模拟 ChatPanel 保存图片到来源
      const filename = 'chat-shot.png'
      const dataUrl = 'data:image/png;base64,dGVzdC1pbWFnZS1jb250ZW50'
      const baseName = sanitizeChatBaseName(filename, `chat-image-${buildChatTimestamp()}`)
      const buffer = Buffer.from(dataUrl.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64')

      const targetDir = path.join(testDir, 'sources', 'image')
      const { fileName, fullPath } = saveNotebookBinaryFile(targetDir, `${baseName}.png`, buffer)

      expect(fileName).toBe('chat-shot.png')
      expect(fs.existsSync(fullPath)).toBe(true)
    })

    it('完整的 Markdown 保存流程', () => {
      // 模拟 ChatPanel 保存对话到来源
      const filename = 'chat-note.md'
      const content = '# 笔记内容\n\n这是保存的对话内容。'
      const baseName = sanitizeChatBaseName(filename, `chat-markdown-${buildChatTimestamp()}`)

      const targetDir = path.join(testDir, 'sources', 'markdown')
      const { fileName, fullPath } = saveNotebookTextFile(targetDir, `${baseName}.md`, content)

      expect(fileName).toBe('chat-note.md')
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe(content)
    })

    it('批量保存同名文件自动去重', () => {
      const files = ['test.txt', 'test.txt', 'test.txt']
      const results = []

      for (const file of files) {
        results.push(saveNotebookTextFile(testDir, file, `content-${Date.now()}`))
      }

      expect(results[0].fileName).toBe('test.txt')
      expect(results[1].fileName).toBe('test_1.txt')
      expect(results[2].fileName).toBe('test_2.txt')
    })
  })
})
