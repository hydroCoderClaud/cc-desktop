/**
 * NotebookManager 单元测试
 * 覆盖：创建/列举/重命名/删除笔记本，sources/achievements CRUD，回滚逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

// uuid 固定值方便断言
vi.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000001' }))

const { NotebookManager } = await import('../../src/main/managers/notebook-manager.js')

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpDir() {
  const dir = path.join(os.tmpdir(), 'nb-test-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function makeManager(baseDir, agentSessionManager = null) {
  const configManager = {
    getConfig: () => ({ settings: { notebook: { baseDir, notebooks: [] } } }),
    _cfg: null,
    save() {},
  }
  // 让 _saveRegistry 真正写入内存
  configManager.getConfig = () => configManager._cfg
  configManager._cfg = { settings: { notebook: { baseDir, notebooks: [] } } }
  configManager.save = () => {}
  return new NotebookManager(configManager, agentSessionManager)
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('NotebookManager', () => {
  let baseDir
  let mgr

  beforeEach(() => {
    baseDir = makeTmpDir()
    mgr = makeManager(baseDir)
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  // ── create ──────────────────────────────────────────────────────────────

  it('create: 创建笔记本目录结构和索引文件', () => {
    const nb = mgr.create({ name: '测试笔记本' })
    expect(nb.id).toMatch(/^nb-/)
    expect(fs.existsSync(nb.notebookPath)).toBe(true)
    expect(fs.existsSync(path.join(nb.notebookPath, 'notebook.json'))).toBe(true)
    expect(fs.existsSync(path.join(nb.notebookPath, 'sources.json'))).toBe(true)
    expect(fs.existsSync(path.join(nb.notebookPath, 'achievements.json'))).toBe(true)
  })

  it('create: 名称为空时抛出错误', () => {
    expect(() => mgr.create({ name: '' })).toThrow('名称不能为空')
  })

  it('create: 目录已存在时抛出错误', () => {
    mgr.create({ name: 'dup' })
    expect(() => mgr.create({ name: 'dup' })).toThrow('目录已存在')
  })

  it('create: 失败时回滚已创建的目录', () => {
    // 让 _saveRegistry 抛出，触发回滚
    mgr._saveRegistry = () => { throw new Error('模拟注册失败') }
    expect(() => mgr.create({ name: '回滚测试' })).toThrow('模拟注册失败')
    const notebookPath = path.join(baseDir, '回滚测试')
    expect(fs.existsSync(notebookPath)).toBe(false)
  })

  // ── list / get ───────────────────────────────────────────────────────────

  it('list: 返回已创建的笔记本', () => {
    mgr.create({ name: 'A' })
    mgr.create({ name: 'B' })
    const list = mgr.list()
    expect(list).toHaveLength(2)
    expect(list.map(n => n.name)).toEqual(expect.arrayContaining(['A', 'B']))
  })

  it('get: 返回笔记本含 sources 和 achievements', () => {
    const nb = mgr.create({ name: 'get测试' })
    const result = mgr.get(nb.id)
    expect(result.sources).toEqual([])
    expect(result.achievements).toEqual([])
  })

  it('get: 不存在时抛出错误', () => {
    expect(() => mgr.get('nb-notexist')).toThrow('笔记本不存在')
  })

  // ── rename ───────────────────────────────────────────────────────────────

  it('rename: 更新名称不移动目录', () => {
    const nb = mgr.create({ name: '旧名' })
    const result = mgr.rename(nb.id, '新名')
    expect(result.name).toBe('新名')
    expect(result.path).toBe(nb.path) // 物理路径不变
    expect(fs.existsSync(nb.notebookPath)).toBe(true)
  })

  it('rename: 名称为空时抛出错误', () => {
    const nb = mgr.create({ name: '测试' })
    expect(() => mgr.rename(nb.id, '')).toThrow('名称不能为空')
  })

  // ── delete ───────────────────────────────────────────────────────────────

  it('delete: 删除目录并从注册表移除', async () => {
    const nb = mgr.create({ name: '待删除' })
    await mgr.delete(nb.id)
    expect(fs.existsSync(nb.notebookPath)).toBe(false)
    expect(mgr.list()).toHaveLength(0)
  })

  it('delete: 不存在时抛出错误', async () => {
    await expect(mgr.delete('nb-notexist')).rejects.toThrow('笔记本不存在')
  })

  it('delete: 目录删除失败时回滚注册表', async () => {
    const nb = mgr.create({ name: '回滚删除' })
    // 让 rmdirSync 抛出
    const orig = fs.rmdirSync
    fs.rmdirSync = (p) => { if (p === nb.notebookPath) throw new Error('文件锁') ; orig(p) }
    await expect(mgr.delete(nb.id)).rejects.toThrow('删除失败')
    expect(mgr.list()).toHaveLength(1) // 注册表已回滚
    fs.rmdirSync = orig
  })

  // ── import ─────────────────────────────────────────────────────────────

  it('importFile: 复制文件到 sources 子目录并添加索引', async () => {
    const nb = mgr.create({ name: 'import测试' })
    const tmpFile = path.join(os.tmpdir(), 'test-doc.pdf')
    fs.writeFileSync(tmpFile, 'dummy pdf content')

    const src = await mgr.importFile(nb.id, tmpFile)
    expect(src.name).toBe('test-doc.pdf')
    expect(src.type).toBe('pdf')
    expect(src.path).toBe('sources/pdf/test-doc.pdf')

    // 验证物理文件是否存在
    const targetPath = path.join(nb.notebookPath, 'sources/pdf/test-doc.pdf')
    expect(fs.existsSync(targetPath)).toBe(true)
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('dummy pdf content')

    fs.unlinkSync(tmpFile)
  })

  it('importFile: 重名时自动重命名', async () => {
    const nb = mgr.create({ name: '重名测试' })
    const tmpFile = path.join(os.tmpdir(), 'dup.txt')
    fs.writeFileSync(tmpFile, 'v1')

    await mgr.importFile(nb.id, tmpFile)
    fs.writeFileSync(tmpFile, 'v2')
    const src2 = await mgr.importFile(nb.id, tmpFile)

    expect(src2.path).toBe('sources/text/dup_1.txt')
    expect(fs.existsSync(path.join(nb.notebookPath, 'sources/text/dup_1.txt'))).toBe(true)

    fs.unlinkSync(tmpFile)
  })

  // ── sources CRUD ─────────────────────────────────────────────────────────

  it('addSource / listSources / updateSource / deleteSource', () => {
    const nb = mgr.create({ name: 'src测试' })

    const src = mgr.addSource(nb.id, { name: '文档A', type: 'pdf' })
    expect(src.id).toMatch(/^src-/)
    expect(mgr.listSources(nb.id)).toHaveLength(1)

    mgr.updateSource(nb.id, src.id, { selected: false, summary: '摘要' })
    const updated = mgr.listSources(nb.id)[0]
    expect(updated.selected).toBe(false)
    expect(updated.summary).toBe('摘要')

    mgr.deleteSource(nb.id, src.id)
    expect(mgr.listSources(nb.id)).toHaveLength(0)
  })

  it('updateSource: 不存在时抛出错误', () => {
    const nb = mgr.create({ name: 'src错误' })
    expect(() => mgr.updateSource(nb.id, 'src-notexist', {})).toThrow('来源不存在')
  })

  // ── achievements CRUD ────────────────────────────────────────────────────

  it('addAchievement / listAchievements / updateAchievement / deleteAchievement', () => {
    const nb = mgr.create({ name: 'ach测试' })

    const ach = mgr.addAchievement(nb.id, { name: '报告1', type: 'report' })
    expect(ach.status).toBe('generating')
    expect(ach.selected).toBe(false)
    expect(mgr.listAchievements(nb.id)).toHaveLength(1)

    mgr.updateAchievement(nb.id, ach.id, { status: 'done', path: '/tmp/report.pdf' })
    const updated = mgr.listAchievements(nb.id)[0]
    expect(updated.status).toBe('done')

    mgr.deleteAchievement(nb.id, ach.id)
    expect(mgr.listAchievements(nb.id)).toHaveLength(0)
  })

  it('achievement -> source: 始终复制到 sources 目录并写入索引', async () => {
    const nb = mgr.create({ name: '成果转来源测试' })
    const achievementDir = path.join(nb.notebookPath, 'achievements', 'generate-image')
    fs.mkdirSync(achievementDir, { recursive: true })
    const achievementPath = path.join(achievementDir, 'generate-image-1.png')
    fs.writeFileSync(achievementPath, 'image-binary')

    const ach = mgr.addAchievement(nb.id, {
      name: '图片成果',
      type: 'image',
      path: 'achievements/generate-image/generate-image-1.png'
    })
    mgr.updateAchievement(nb.id, ach.id, { status: 'done' })

    const src = await mgr.addAchievementToSource(nb.id, ach.id)
    expect(src.type).toBe('image')
    expect(src.path).toBe('sources/image/generate-image-1.png')
    expect(fs.existsSync(path.join(nb.notebookPath, src.path))).toBe(true)
    expect(fs.readFileSync(path.join(nb.notebookPath, src.path), 'utf-8')).toBe('image-binary')
  })

  it('exportAchievement: 重名时自动重命名', () => {
    const nb = mgr.create({ name: '成果导出测试' })
    const achievementDir = path.join(nb.notebookPath, 'achievements', 'notes')
    fs.mkdirSync(achievementDir, { recursive: true })
    const achievementPath = path.join(achievementDir, 'notes-1.md')
    fs.writeFileSync(achievementPath, '# hello')

    const ach = mgr.addAchievement(nb.id, {
      name: '笔记成果',
      type: 'markdown',
      path: 'achievements/notes/notes-1.md'
    })
    mgr.updateAchievement(nb.id, ach.id, { status: 'done' })

    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-export-'))
    fs.writeFileSync(path.join(exportDir, 'notes-1.md'), 'existing')

    const result = mgr.exportAchievement(nb.id, ach.id, exportDir)
    expect(result.success).toBe(true)
    expect(path.basename(result.path)).toBe('notes-1_1.md')
    expect(fs.readFileSync(result.path, 'utf-8')).toBe('# hello')
  })

  it('writeFileContent: 可写回 notebook 内相对路径文本文件', () => {
    const nb = mgr.create({ name: 'write文本测试' })
    const relPath = 'sources/text/editable.txt'
    const fullPath = path.join(nb.notebookPath, relPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, 'before')

    const result = mgr.writeFileContent(nb.id, relPath, 'after')
    expect(result.success).toBe(true)
    expect(fs.readFileSync(fullPath, 'utf-8')).toBe('after')
  })

  it('writeFileContent: 拒绝越界路径', () => {
    const nb = mgr.create({ name: 'write越界测试' })
    expect(() => mgr.writeFileContent(nb.id, '../outside.txt', 'x')).toThrow('不允许写入笔记本目录之外的文件')
  })

  // ── 中文路径 ─────────────────────────────────────────────────────────────

  it('中文路径：创建和删除正常工作', async () => {
    const nb = mgr.create({ name: '中文笔记本名称测试' })
    expect(fs.existsSync(nb.notebookPath)).toBe(true)
    await mgr.delete(nb.id)
    expect(fs.existsSync(nb.notebookPath)).toBe(false)
  })
})
