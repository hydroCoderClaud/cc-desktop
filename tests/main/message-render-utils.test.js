import { describe, it, expect } from 'vitest'
import { normalizePathForDisplay, renderMessageHtml, renderPlainTextWithLinks } from '../../src/renderer/utils/message-render-utils.js'

describe('renderMessageHtml path handling', () => {
  it('keeps bold-wrapped windows paths clickable', () => {
    const html = renderMessageHtml('**D:\\智水工坊\\合作\\Y颜开\\helloworld.html**', { platform: 'win32' })

    expect(html).toContain('<strong>')
    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\智水工坊\\合作\\Y颜开\\helloworld.html"')
  })

  it('avoids nested anchors for C:/Users style windows paths', () => {
    const html = renderMessageHtml('C:/Users/test/hello.html', { platform: 'win32' })

    expect((html.match(/data-link-type="path"/g) || []).length).toBe(1)
    expect(html).toContain('data-href="C:\\Users\\test\\hello.html"')
    expect(html).not.toContain('data-href="C:<a class=')
  })

  it('normalizes /d/test style msys paths for windows display', () => {
    const html = renderMessageHtml('/d/test/hello.txt', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\test\\hello.txt"')
  })

  it('keeps chinese windows path segments linked when a soft space appears before the next separator', () => {
    const html = renderMessageHtml('D:\\智水工坊\\合作\\Y 颜开\\helloworld.html', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\智水工坊\\合作\\Y 颜开\\helloworld.html"')
    expect(html).not.toContain('</a>颜开')
  })

  it('keeps the last windows filename segment linked when it contains spaces', () => {
    const html = renderMessageHtml('D:\\目录\\文件 名.docx', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\目录\\文件 名.docx"')
    expect(html).not.toContain('</a> 名.docx')
  })

  it('keeps bracketed windows segments linked as one path', () => {
    const html = renderMessageHtml('D:\\目录\\(测试)\\文件.docx', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\目录\\(测试)\\文件.docx"')
  })

  it('trims trailing chinese punctuation without breaking the path link', () => {
    const html = renderMessageHtml('输出路径：D:\\目录\\文件.docx。', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\目录\\文件.docx"')
    expect(html).toContain('</a>。')
  })

  it('keeps forward-slash windows paths linked when the filename contains spaces', () => {
    const html = renderMessageHtml('D:/目录/文件 名.docx', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\目录\\文件 名.docx"')
    expect(html).not.toContain('</a> 名.docx')
  })

  it('decodes file URIs into clickable windows file paths', () => {
    const html = renderMessageHtml('输出文件：file:///C:/Users/test/My%20File.txt', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="C:\\Users\\test\\My File.txt"')
    expect(html).not.toContain('file:///C:/Users/test/My%20File.txt')
  })

  it('keeps macOS file URIs as unix paths', () => {
    const html = renderMessageHtml('file:///Users/test/My%20File.txt', { platform: 'darwin' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="/Users/test/My File.txt"')
    expect(html).not.toContain('file:///Users/test/My%20File.txt')
  })
})

describe('renderPlainTextWithLinks tool-card rendering', () => {
  it('renders json-like windows file paths with spaces as one clickable link', () => {
    const html = renderPlainTextWithLinks('{\n  "file_path": "D:/目录/文件 名.docx"\n}', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\目录\\文件 名.docx"')
  })

  it('renders msys windows paths inside plain text blocks', () => {
    const html = renderPlainTextWithLinks('saved to /d/test/output.html', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="D:\\test\\output.html"')
  })

  it('renders file URIs inside plain text blocks as local file paths', () => {
    const html = renderPlainTextWithLinks('saved to file:///C:/workspace/output/My%20File.html', { platform: 'win32' })

    expect(html).toContain('data-link-type="path"')
    expect(html).toContain('data-href="C:\\workspace\\output\\My File.html"')
    expect(html).not.toContain('file:///C:/workspace/output/My%20File.html')
  })
})

describe('normalizePathForDisplay file URIs', () => {
  it('normalizes windows file URIs for display', () => {
    expect(normalizePathForDisplay('file:///C:/Users/test/My%20File.txt', 'win32')).toBe('C:\\Users\\test\\My File.txt')
  })

  it('normalizes macOS file URIs for display', () => {
    expect(normalizePathForDisplay('file:///Users/test/My%20File.txt', 'darwin')).toBe('/Users/test/My File.txt')
  })
})
