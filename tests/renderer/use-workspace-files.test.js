import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useWorkspaceFiles } from '../../src/renderer/composables/useWorkspaceFiles.js'

const rootEntries = [
  { name: 'src', relativePath: 'src', isDirectory: true },
  { name: 'README.md', relativePath: 'README.md', isDirectory: false }
]

const srcEntries = [
  { name: 'components', relativePath: 'src/components', isDirectory: true },
  { name: 'main.js', relativePath: 'src/main.js', isDirectory: false }
]

const componentEntries = [
  { name: 'Panel.vue', relativePath: 'src/components/Panel.vue', isDirectory: false }
]

function createFiles() {
  const dirs = new Map([
    ['', rootEntries],
    ['src', srcEntries],
    ['src/components', componentEntries]
  ])
  const adapter = {
    listDir: vi.fn(async (_sourceId, relativePath = '') => ({
      cwd: 'C:/workspace/project',
      entries: dirs.get(relativePath) || []
    })),
    readFile: vi.fn(async (_sourceId, relativePath) => ({ content: relativePath })),
    deleteFile: vi.fn(async () => ({ success: true })),
    searchFiles: vi.fn(async () => ({ results: [] }))
  }
  return { files: useWorkspaceFiles(adapter), adapter }
}

describe('useWorkspaceFiles', () => {
  it('removes a deleted file without clearing expanded directories', async () => {
    const { files } = createFiles()

    await files.setSourceId('session-1')
    await files.toggleDir('src')
    await files.toggleDir('src/components')

    files.removeEntry('src/main.js')
    await nextTick()

    expect(files.expandedDirs.has('src')).toBe(true)
    expect(files.expandedDirs.has('src/components')).toBe(true)
    expect(files.getDirEntries('src').map(entry => entry.relativePath)).toEqual(['src/components'])
    expect(files.entries.value.map(entry => entry.relativePath)).toEqual(['src', 'README.md'])
  })

  it('removes deleted directories and their descendant expanded state only', async () => {
    const { files } = createFiles()

    await files.setSourceId('session-1')
    await files.toggleDir('src')
    await files.toggleDir('src/components')

    files.removeEntry('src/components', { isDirectory: true })
    await nextTick()

    expect(files.expandedDirs.has('src')).toBe(true)
    expect(files.expandedDirs.has('src/components')).toBe(false)
    expect(files.getDirEntries('src').map(entry => entry.relativePath)).toEqual(['src/main.js'])
    expect(files.getDirEntries('src/components')).toEqual([])
  })
})
