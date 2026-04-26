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
    getAPIProfile: (id) => id ? { id, baseUrl: `https://${id}.example.com`, selectedModelId: `${id}-model` } : null,
    getDefaultProfile: () => ({ id: 'default-profile', baseUrl: 'https://default.example.com', selectedModelId: 'default-model' }),
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

  it('create: 使用所选 API Profile 的默认模型初始化 lastSelectedModelId', () => {
    const nb = mgr.create({ name: '模型初始化', apiProfileId: 'profile-a' })
    const meta = JSON.parse(fs.readFileSync(path.join(nb.notebookPath, 'notebook.json'), 'utf-8'))

    expect(meta.apiProfileId).toBe('profile-a')
    expect(meta.lastSelectedModelId).toBe('profile-a-model')
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

  it('get: 打开旧笔记本时保留 notebook 自身的 apiProfileId，不被旧 session 覆盖', () => {
    const updateAgentConversation = vi.fn()
    const liveSession = { id: 'sess-1', apiProfileId: 'profile-b', apiBaseUrl: 'https://profile-b.example.com' }
    const agentSessionManager = {
      create: vi.fn(() => ({ id: 'sess-1' })),
      reopen: vi.fn(() => ({ id: 'sess-1', apiProfileId: 'profile-b' })),
      sessions: new Map([['sess-1', liveSession]])
    }
    mgr = makeManager(baseDir, agentSessionManager)
    mgr.setSessionDatabase({ updateAgentConversation })

    const nb = mgr.create({ name: '旧笔记本', apiProfileId: 'profile-a' })
    const result = mgr.get(nb.id)
    const meta = JSON.parse(fs.readFileSync(path.join(nb.notebookPath, 'notebook.json'), 'utf-8'))

    expect(result.apiProfileId).toBe('profile-a')
    expect(result.lastSelectedModelId).toBe('profile-a-model')
    expect(meta.apiProfileId).toBe('profile-a')
    expect(meta.lastSelectedModelId).toBe('profile-a-model')
    expect(liveSession.apiProfileId).toBe('profile-a')
    expect(liveSession.apiBaseUrl).toBe('https://profile-a.example.com')
    expect(updateAgentConversation).toHaveBeenCalledWith('sess-1', {
      apiProfileId: 'profile-a',
      apiBaseUrl: 'https://profile-a.example.com'
    })
    expect(agentSessionManager.reopen).toHaveBeenCalledWith('sess-1')
  })

  it('get: notebook 缺少 apiProfileId 时，使用历史 session 回填', () => {
    const updateAgentConversation = vi.fn()
    const liveSession = { id: 'sess-1', apiProfileId: 'profile-b', apiBaseUrl: 'https://profile-b.example.com' }
    const agentSessionManager = {
      create: vi.fn(() => ({ id: 'sess-1' })),
      reopen: vi.fn(() => ({ id: 'sess-1', apiProfileId: 'profile-b' })),
      sessions: new Map([['sess-1', liveSession]])
    }
    mgr = makeManager(baseDir, agentSessionManager)
    mgr.setSessionDatabase({ updateAgentConversation })

    const nb = mgr.create({ name: '回填测试' })
    mgr.updateApiProfile(nb.id, null)

    const result = mgr.get(nb.id)
    const meta = JSON.parse(fs.readFileSync(path.join(nb.notebookPath, 'notebook.json'), 'utf-8'))

    expect(result.apiProfileId).toBe('profile-b')
    expect(result.lastSelectedModelId).toBe('profile-b-model')
    expect(meta.apiProfileId).toBe('profile-b')
    expect(meta.lastSelectedModelId).toBe('profile-b-model')
    expect(updateAgentConversation).not.toHaveBeenCalled()
    expect(agentSessionManager.reopen).toHaveBeenCalledWith('sess-1')
  })

  it('get: notebook 缺少 lastSelectedModelId 时，按当前 profile 默认模型回填', () => {
    const liveSession = { id: 'sess-1', apiProfileId: 'profile-a', apiBaseUrl: 'https://profile-a.example.com' }
    const agentSessionManager = {
      create: vi.fn(() => ({ id: 'sess-1' })),
      reopen: vi.fn(() => ({ id: 'sess-1', apiProfileId: 'profile-a' })),
      sessions: new Map([['sess-1', liveSession]])
    }
    mgr = makeManager(baseDir, agentSessionManager)

    const nb = mgr.create({ name: '旧模型回填', apiProfileId: 'profile-a' })
    const metaFile = path.join(nb.notebookPath, 'notebook.json')
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
    delete meta.lastSelectedModelId
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))

    const result = mgr.get(nb.id)
    const refreshedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))

    expect(result.lastSelectedModelId).toBe('profile-a-model')
    expect(refreshedMeta.lastSelectedModelId).toBe('profile-a-model')
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

  it('updateApiProfile: 更新 notebook.json 中的 apiProfileId', () => {
    const nb = mgr.create({ name: 'API切换测试', apiProfileId: 'profile-a' })

    const result = mgr.updateApiProfile(nb.id, 'profile-b')
    const meta = JSON.parse(fs.readFileSync(path.join(nb.notebookPath, 'notebook.json'), 'utf-8'))

    expect(result.success).toBe(true)
    expect(result.apiProfileId).toBe('profile-b')
    expect(result.lastSelectedModelId).toBe('profile-b-model')
    expect(meta.apiProfileId).toBe('profile-b')
    expect(meta.lastSelectedModelId).toBe('profile-b-model')
  })

  it('updateSelectedModel: 更新 notebook.json 中的 lastSelectedModelId', () => {
    const nb = mgr.create({ name: '模型切换测试', apiProfileId: 'profile-a' })

    const result = mgr.updateSelectedModel(nb.id, 'glm-5.1')
    const meta = JSON.parse(fs.readFileSync(path.join(nb.notebookPath, 'notebook.json'), 'utf-8'))

    expect(result.success).toBe(true)
    expect(result.lastSelectedModelId).toBe('glm-5.1')
    expect(meta.lastSelectedModelId).toBe('glm-5.1')
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

  it('importFile: forceCopy 时复制文件到 sources 子目录并添加索引', async () => {
    const nb = mgr.create({ name: 'import测试' })
    const tmpFile = path.join(os.tmpdir(), 'test-doc.pdf')
    fs.writeFileSync(tmpFile, 'dummy pdf content')

    const src = await mgr.importFile(nb.id, tmpFile, undefined, { forceCopy: true })
    expect(src.name).toBe('test-doc.pdf')
    expect(src.type).toBe('document')
    expect(src.path).toBe('sources/document/test-doc.pdf')

    // 验证物理文件是否存在
    const targetPath = path.join(nb.notebookPath, 'sources/document/test-doc.pdf')
    expect(fs.existsSync(targetPath)).toBe(true)
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('dummy pdf content')

    fs.unlinkSync(tmpFile)
  })

  it('importFile: forceCopy 重名时自动重命名', async () => {
    const nb = mgr.create({ name: '重名测试' })
    const tmpFile = path.join(os.tmpdir(), 'dup.txt')
    fs.writeFileSync(tmpFile, 'v1')

    await mgr.importFile(nb.id, tmpFile, undefined, { forceCopy: true })
    fs.writeFileSync(tmpFile, 'v2')
    const src2 = await mgr.importFile(nb.id, tmpFile, undefined, { forceCopy: true })

    expect(src2.path).toBe('sources/document/dup_1.txt')
    expect(fs.existsSync(path.join(nb.notebookPath, 'sources/document/dup_1.txt'))).toBe(true)

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

  it('sanitizeSources: 保留仅 URL 的来源索引', () => {
    const nb = mgr.create({ name: 'source-url保留测试' })
    mgr.addSource(nb.id, { name: '网页来源', type: 'web', url: 'https://example.com' })

    const removed = mgr.sanitizeSources(nb.id)
    const sources = mgr.listSources(nb.id)
    expect(removed).toBe(0)
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('https://example.com')
  })

  it('sanitizeSources: 删除指向不存在文件的来源索引', () => {
    const nb = mgr.create({ name: 'source清理测试' })
    mgr.addSource(nb.id, { name: '有效来源', type: 'markdown', path: 'sources/markdown/valid.md' })
    mgr.addSource(nb.id, { name: '失效来源', type: 'markdown', path: 'sources/markdown/missing.md' })
    fs.mkdirSync(path.join(nb.notebookPath, 'sources', 'markdown'), { recursive: true })
    fs.writeFileSync(path.join(nb.notebookPath, 'sources/markdown/valid.md'), '# ok')

    const removed = mgr.sanitizeSources(nb.id)
    const sources = mgr.listSources(nb.id)
    expect(removed).toBe(1)
    expect(sources).toHaveLength(1)
    expect(sources[0].name).toBe('有效来源')
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
    expect(src.name).toBe('图片成果')
    expect(src.type).toBe('image')
    expect(src.path).toBe('sources/image/generate-image-1.png')
    expect(fs.existsSync(path.join(nb.notebookPath, src.path))).toBe(true)
    expect(fs.readFileSync(path.join(nb.notebookPath, src.path), 'utf-8')).toBe('image-binary')
  })

  it('saveChatImageToSource: 写入 sources/image 并新增索引', async () => {
    const nb = mgr.create({ name: '聊天图片到来源' })
    const dataUrl = 'data:image/png;base64,' + Buffer.from('png-binary').toString('base64')

    const source = await mgr.saveChatImageToSource(nb.id, { filename: 'chat-shot', dataUrl })
    expect(source.type).toBe('image')
    expect(source.path).toBe('sources/image/chat-shot.png')
    expect(fs.readFileSync(path.join(nb.notebookPath, source.path), 'utf-8')).toBe('png-binary')
  })

  it('saveChatMarkdownToSource: 写入 sources/markdown 并新增索引', () => {
    const nb = mgr.create({ name: '聊天文本到来源' })

    const source = mgr.saveChatMarkdownToSource(nb.id, { filename: 'chat-note', content: '# hello' })
    expect(source.type).toBe('markdown')
    expect(source.path).toBe('sources/markdown/chat-note.md')
    expect(fs.readFileSync(path.join(nb.notebookPath, source.path), 'utf-8')).toBe('# hello')
  })

  it('saveChatImageToAchievement: 写入 achievements/fromchat 并新增 done 索引', async () => {
    const nb = mgr.create({ name: '聊天图片到成果' })
    const dataUrl = 'data:image/png;base64,' + Buffer.from('chat-image').toString('base64')

    const achievement = await mgr.saveChatImageToAchievement(nb.id, {
      filename: 'chat-image',
      dataUrl,
      sourceIds: ['src-a']
    })

    expect(achievement.type).toBe('fromchat')
    expect(achievement.status).toBe('done')
    expect(achievement.path).toBe('achievements/fromchat/chat-image.png')
    expect(achievement.sourceIds).toEqual(['src-a'])
    expect(fs.readFileSync(path.join(nb.notebookPath, achievement.path), 'utf-8')).toBe('chat-image')
  })

  it('saveChatMarkdownToAchievement: 重名时自动避让', () => {
    const nb = mgr.create({ name: '聊天文本到成果' })

    const first = mgr.saveChatMarkdownToAchievement(nb.id, { filename: 'chat-note', content: '# first' })
    const second = mgr.saveChatMarkdownToAchievement(nb.id, { filename: 'chat-note', content: '# second' })

    expect(first.path).toBe('achievements/fromchat/chat-note.md')
    expect(second.path).toBe('achievements/fromchat/chat-note_1.md')
    expect(second.type).toBe('fromchat')
    expect(second.status).toBe('done')
    expect(fs.readFileSync(path.join(nb.notebookPath, second.path), 'utf-8')).toBe('# second')
  })

  it('finalizeAchievementText: 为生成中的 achievement 落盘并标记完成', () => {
    const nb = mgr.create({ name: '生成文本回填成果' })
    const achievement = mgr.addAchievement(nb.id, {
      name: '草稿成果',
      type: 'md',
      path: 'achievements/notes/result.md'
    })

    const updated = mgr.finalizeAchievementText(nb.id, {
      achievementId: achievement.id,
      content: '# final result',
      sourceIds: ['src-1']
    })

    expect(updated.status).toBe('done')
    expect(updated.sourceIds).toEqual(['src-1'])
    expect(fs.readFileSync(path.join(nb.notebookPath, achievement.path), 'utf-8')).toBe('# final result')
  })

  it('addPathToSource: 复制外部文件到 sources 并写入索引', async () => {
    const nb = mgr.create({ name: '路径添加到来源' })
    const tmpFile = path.join(os.tmpdir(), `notebook-add-path-source-${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, 'path-source-content')

    const source = await mgr.addPathToSource(nb.id, tmpFile)
    expect(source.path.startsWith('sources/')).toBe(true)
    expect(fs.readFileSync(path.join(nb.notebookPath, source.path), 'utf-8')).toBe('path-source-content')
  })

  it('addPathToAchievement: 复制外部文件到 achievements/fromchat 并写入 done 索引', () => {
    const nb = mgr.create({ name: '路径添加到成果' })
    const tmpFile = path.join(os.tmpdir(), `notebook-add-path-achievement-${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, 'path-achievement-content')

    const achievement = mgr.addPathToAchievement(nb.id, tmpFile, { preferredName: '自定义成果名' })
    expect(achievement.name).toBe('自定义成果名')
    expect(achievement.type).toBe('fromchat')
    expect(achievement.status).toBe('done')
    expect(achievement.path).toBe('achievements/fromchat/' + path.basename(tmpFile))
    expect(fs.readFileSync(path.join(nb.notebookPath, achievement.path), 'utf-8')).toBe('path-achievement-content')
  })

  it('addPathToAchievement: 目录路径应报错', () => {
    const nb = mgr.create({ name: '路径目录成果报错' })
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-add-path-dir-'))

    expect(() => mgr.addPathToAchievement(nb.id, tmpDir)).toThrow('暂不支持添加目录到成果')
  })

  it('addPathToSource / addPathToAchievement: 文件不存在应报错', async () => {
    const nb = mgr.create({ name: '路径不存在报错' })
    const missingPath = path.join(os.tmpdir(), `notebook-missing-${Date.now()}.txt`)

    await expect(mgr.addPathToSource(nb.id, missingPath)).rejects.toThrow(`文件不存在：${missingPath}`)
    expect(() => mgr.addPathToAchievement(nb.id, missingPath)).toThrow(`文件不存在：${missingPath}`)
  })

  it('sanitizeIndexes: 同时清理失效来源与成果索引，并保留生成中的成果', () => {
    const nb = mgr.create({ name: '统一整理测试' })
    mgr.addSource(nb.id, { name: '失效来源', type: 'markdown', path: 'sources/markdown/missing.md' })
    const missingAchievement = mgr.addAchievement(nb.id, {
      name: '失效成果',
      type: 'fromchat',
      path: 'achievements/fromchat/missing.md'
    })
    mgr.updateAchievement(nb.id, missingAchievement.id, { status: 'done' })
    mgr.addAchievement(nb.id, {
      name: '生成中成果',
      type: 'fromchat',
      path: 'achievements/fromchat/generating.md'
    })

    const result = mgr.sanitizeIndexes(nb.id)
    expect(result.success).toBe(true)
    expect(result.sourcesRemoved).toBe(1)
    expect(result.achievementsRemoved).toBe(1)
    expect(mgr.listSources(nb.id)).toHaveLength(0)
    const achievements = mgr.listAchievements(nb.id)
    expect(achievements).toHaveLength(1)
    expect(achievements[0].status).toBe('generating')
  })

  it('exportSource: 导出来源文件并自动避让重名', () => {
    const nb = mgr.create({ name: '来源导出测试' })
    const sourceDir = path.join(nb.notebookPath, 'sources', 'markdown')
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'notes.md'), '# source')
    const source = mgr.addSource(nb.id, {
      name: 'notes.md',
      type: 'markdown',
      path: 'sources/markdown/notes.md'
    })

    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-export-'))
    fs.writeFileSync(path.join(exportDir, 'notes.md'), 'existing')

    const result = mgr.exportSource(nb.id, source.id, exportDir)
    expect(result.success).toBe(true)
    expect(path.basename(result.path)).toBe('notes_1.md')
    expect(fs.readFileSync(result.path, 'utf-8')).toBe('# source')
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

  // ── readFileContent 安全测试 ─────────────────────────────────────────────

  it('readFileContent: 拒绝越界路径遍历', async () => {
    const nb = mgr.create({ name: 'read 越界测试' })
    await expect(mgr.readFileContent(nb.id, '../outside.txt'))
      .rejects.toThrow('不允许读取笔记本目录之外的文件')
  })

  it('readFileContent: 允许读取笔记本内相对路径', async () => {
    const nb = mgr.create({ name: 'read 内部测试' })
    const relPath = 'sources/text/test.txt'
    const fullPath = path.join(nb.notebookPath, relPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, 'test content')

    const result = await mgr.readFileContent(nb.id, relPath)
    expect(result.content).toBe('test content')
  })
})
