/**
 * NotebookManager.prepareGeneration 单元测试
 * 覆盖：工具查找、路径计算、Prompt 模板组装、占位符替换、Achievement 创建、错误回滚
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000001' }))

const { NotebookManager } = await import('../../src/main/managers/notebook-manager.js')

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpDir() {
  const dir = path.join(os.tmpdir(), 'nb-gen-test-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function makeManager(baseDir) {
  const configManager = {
    _cfg: { settings: { notebook: { baseDir, notebooks: [] } } },
    getConfig() { return this._cfg },
    save() {},
    userDataPath: baseDir
  }
  const mgr = new NotebookManager(configManager, null)
  return mgr
}

/** 创建一个有来源的笔记本并返回 { mgr, nb, sourceId } */
function setupNotebookWithSource(baseDir) {
  const mgr = makeManager(baseDir)
  const nb = mgr.create({ name: 'gen-test' })
  const src = mgr.addSource(nb.id, { name: 'report.pdf', type: 'pdf', path: 'sources/pdf/report.pdf' })
  mgr.updateSource(nb.id, src.id, { selected: true })
  return { mgr, nb, sourceId: src.id }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('NotebookManager.prepareGeneration', () => {
  let baseDir

  beforeEach(() => {
    baseDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  // ── 基本流程 ──────────────────────────────────────────────────────────────

  it('使用兜底模板生成 prompt 并创建 achievement', () => {
    const { mgr, nb, sourceId } = setupNotebookWithSource(baseDir)

    const result = mgr.prepareGeneration(nb.id, 'notes', [sourceId])

    // 返回结果
    expect(result.achievementId).toMatch(/^ach-/)
    expect(result.prompt).toContain('笔记总结')
    expect(result.prompt).toContain('report.pdf')

    // achievement 已写入
    const achievements = mgr.listAchievements(nb.id)
    expect(achievements).toHaveLength(1)
    expect(achievements[0].status).toBe('generating')
    expect(achievements[0].path).toContain('achievements/notes/')
    expect(achievements[0].path).toMatch(/\.md$/)
  })

  it('无来源时 prompt 包含"对话上下文"', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'no-source' })

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    expect(result.prompt).toContain('对话上下文')
    expect(result.achievementId).toMatch(/^ach-/)
  })

  // ── 路径计算 ──────────────────────────────────────────────────────────────

  it('outputType 扩展名决定正确的文件后缀', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'ext-test' })

    // notes 工具 outputType=md → .md
    const result = mgr.prepareGeneration(nb.id, 'notes', [])
    expect(result.prompt).toBeDefined()
    const ach = mgr.listAchievements(nb.id).at(-1)
    expect(ach.path).toContain('.md')
    expect(ach.path).toContain('achievements/notes/')

    // 手动添加一个 pdf 工具验证其他扩展名
    mgr.addTool({ id: 'test-pdf', name: 'PDF', outputType: 'pdf' })
    const result2 = mgr.prepareGeneration(nb.id, 'test-pdf', [])
    const ach2 = mgr.listAchievements(nb.id).at(-1)
    expect(ach2.path).toContain('.pdf')
    expect(ach2.path).toContain('achievements/test-pdf/')
  })

  it('outputType 兼容旧语义值与边界值', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'legacy-ext-test' })

    mgr.addTool({ id: 'legacy-markdown', name: 'Legacy Markdown', outputType: 'markdown' })
    mgr.addTool({ id: 'dot-pdf', name: 'Dot PDF', outputType: '.PDF' })
    mgr.addTool({ id: 'blank-ext', name: 'Blank Ext', outputType: '   ' })
    mgr.addTool({ id: 'dot-only', name: 'Dot Only', outputType: '.' })

    const ach1 = (mgr.prepareGeneration(nb.id, 'legacy-markdown', []), mgr.listAchievements(nb.id).at(-1))
    expect(ach1.path).toContain('.md')
    expect(ach1.type).toBe('md')

    const ach2 = (mgr.prepareGeneration(nb.id, 'dot-pdf', []), mgr.listAchievements(nb.id).at(-1))
    expect(ach2.path).toContain('.pdf')
    expect(ach2.type).toBe('pdf')

    const ach3 = (mgr.prepareGeneration(nb.id, 'blank-ext', []), mgr.listAchievements(nb.id).at(-1))
    expect(ach3.path).toContain('.txt')
    expect(ach3.type).toBe('txt')

    const ach4 = (mgr.prepareGeneration(nb.id, 'dot-only', []), mgr.listAchievements(nb.id).at(-1))
    expect(ach4.path).toContain('.txt')
    expect(ach4.type).toBe('txt')
  })

  it('prepareGeneration 不提前创建成果子目录', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'no-empty-achievement-dir' })

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    expect(result.prompt).toBeDefined()
    expect(fs.existsSync(path.join(nb.notebookPath, 'achievements', 'notes'))).toBe(false)
  })

  // ── Prompt 模板 ───────────────────────────────────────────────────────────

  it('有 sessionDatabase 时使用模板并替换占位符', () => {
    const { mgr, nb, sourceId } = setupNotebookWithSource(baseDir)

    // 注入 mock sessionDatabase
    mgr.setSessionDatabase({
      getPromptByMarketId: (marketId) => {
        if (marketId === 'sys-notebook-notes') {
          return { id: 1, content: '基于 {{sources}} 生成笔记，保存到 {{expected_path}}' }
        }
        return null
      }
    })

    const result = mgr.prepareGeneration(nb.id, 'notes', [sourceId])

    expect(result.prompt).toContain('report.pdf')
    expect(result.prompt).toMatch(/achievements.notes/)
    expect(result.prompt).not.toContain('{{sources}}')
    expect(result.prompt).not.toContain('{{expected_path}}')
  })

  it('runtimePlaceholders 被替换', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'rt-test' })

    // 手动给 notes 工具添加 runtimePlaceholders
    const tools = mgr.listTools()
    const notes = tools.find(t => t.id === 'notes')
    mgr.updateTool('notes', { runtimePlaceholders: { PDF_CMD: 'npx md-to-pdf' } })

    mgr.setSessionDatabase({
      getPromptByMarketId: () => ({ id: 1, content: '用 {{PDF_CMD}} 转换 {{sources}}' })
    })

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    expect(result.prompt).toContain('npx md-to-pdf')
    expect(result.prompt).not.toContain('{{PDF_CMD}}')
  })

  it('模板加载失败时走兜底 prompt', () => {
    const { mgr, nb } = setupNotebookWithSource(baseDir)

    mgr.setSessionDatabase({
      getPromptByMarketId: () => { throw new Error('DB error') }
    })

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    // 兜底 prompt 包含工具名
    expect(result.prompt).toContain('笔记总结')
    expect(result.achievementId).toMatch(/^ach-/)
  })

  it('版本升级时重新安装并刷新 prompt 模板', async () => {
    const mgr = makeManager(baseDir)

    mgr.capabilityManager = {
      checkComponentInstalled: vi.fn((type, id) => {
        if (type === 'prompt' && id === 'sys-notebook-notes') return 'installed'
        return false
      }),
      installCapability: vi.fn(async () => ({ success: true }))
    }

    mgr.sessionDatabase = {
      getPromptByMarketId: vi.fn(() => ({ id: 1, name: '旧模板', version: '1.0.0' }))
    }

    mgr.addTool({
      id: 'upgrade-test',
      name: '升级测试工具',
      outputType: 'md',
      version: '1.0.0',
      promptTemplateId: 'sys-notebook-notes'
    })

    await mgr.installTool({
      id: 'upgrade-test',
      name: '升级测试工具',
      outputType: 'md',
      version: '1.1.0',
      promptTemplateId: 'sys-notebook-notes'
    })

    expect(mgr.capabilityManager.installCapability).toHaveBeenCalledWith(
      {
        type: 'prompt',
        componentId: 'sys-notebook-notes',
        version: '1.1.0',
        name: '旧模板'
      },
      { scope: 'notebook' }
    )
  })

  it('同版本重装时也刷新 prompt 模板', async () => {
    const mgr = makeManager(baseDir)

    mgr.capabilityManager = {
      checkComponentInstalled: vi.fn((type, id) => {
        if (type === 'prompt' && id === 'sys-notebook-notes') return 'installed'
        return false
      }),
      installCapability: vi.fn(async () => ({ success: true }))
    }

    mgr.sessionDatabase = {
      getPromptByMarketId: vi.fn(() => ({ id: 1, name: '旧模板', version: '1.0.1' }))
    }

    mgr.addTool({
      id: 'reinstall-test',
      name: '重装测试工具',
      outputType: 'html',
      version: '1.0.1',
      promptTemplateId: 'sys-notebook-notes'
    })

    await mgr.installTool({
      id: 'reinstall-test',
      name: '重装测试工具',
      outputType: 'html',
      version: '1.0.1',
      promptTemplateId: 'sys-notebook-notes'
    })

    expect(mgr.capabilityManager.installCapability).toHaveBeenCalledWith(
      {
        type: 'prompt',
        componentId: 'sys-notebook-notes',
        version: '1.0.1',
        name: '旧模板'
      },
      { scope: 'notebook' }
    )
  })

  // ── 错误场景 ──────────────────────────────────────────────────────────────

  it('工具不存在时抛出错误且不创建 achievement', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'err-test' })

    expect(() => mgr.prepareGeneration(nb.id, 'nonexistent', [])).toThrow('工具不存在')
    expect(mgr.listAchievements(nb.id)).toHaveLength(0)
  })

  it('笔记本不存在时抛出错误', () => {
    const mgr = makeManager(baseDir)

    expect(() => mgr.prepareGeneration('nb-notexist', 'notes', [])).toThrow('笔记本不存在')
  })

  // ── sourceIds 过滤 ────────────────────────────────────────────────────────

  it('只传入指定的 sourceIds 到 prompt', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'filter-test' })
    const src1 = mgr.addSource(nb.id, { name: 'a.txt', type: 'text', path: 'sources/text/a.txt' })
    const src2 = mgr.addSource(nb.id, { name: 'b.txt', type: 'text', path: 'sources/text/b.txt' })

    // 只传 src1
    const result = mgr.prepareGeneration(nb.id, 'notes', [src1.id])

    expect(result.prompt).toContain('a.txt')
    expect(result.prompt).not.toContain('b.txt')
  })

  it('prompt 和返回值中包含绝对路径', () => {
    const { mgr, nb } = setupNotebookWithSource(baseDir)

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    // 返回了绝对路径（OS 原生格式）
    expect(result.expectedAbsPath).toContain(baseDir)
    expect(result.expectedAbsPath).toMatch(/achievements/)
    expect(result.expectedAbsPath).toMatch(/\.md$/)

    // prompt 中包含绝对路径
    expect(result.prompt).toContain(result.expectedAbsPath)
  })

  it('sourceIds 为空时使用已勾选的来源', () => {
    const mgr = makeManager(baseDir)
    const nb = mgr.create({ name: 'selected-test' })
    const src1 = mgr.addSource(nb.id, { name: 'selected.txt', type: 'text', path: 'sources/text/selected.txt' })
    const src2 = mgr.addSource(nb.id, { name: 'unselected.txt', type: 'text', path: 'sources/text/unselected.txt' })
    mgr.updateSource(nb.id, src1.id, { selected: true })
    mgr.updateSource(nb.id, src2.id, { selected: false })

    const result = mgr.prepareGeneration(nb.id, 'notes', [])

    expect(result.prompt).toContain('selected.txt')
    expect(result.prompt).not.toContain('unselected.txt')
  })
})
