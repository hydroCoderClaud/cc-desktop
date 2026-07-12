import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const {
  encodePath,
  normalizeProjectPath,
  buildProjectPathKey
} = requireCjs('../../src/main/utils/path-utils.js')

describe('project path identity utilities', () => {
  it('normalizes Windows drive paths into a stable path_key', () => {
    expect(normalizeProjectPath('C:/Work/Temp/../Demo/', 'win32')).toBe('C:\\Work\\Demo')
    expect(buildProjectPathKey('C:/Work/Temp/../Demo/', 'win32')).toBe('win32:c:/work/demo')
    expect(buildProjectPathKey('c:\\work\\demo', 'win32')).toBe('win32:c:/work/demo')
  })

  it('keeps real paths distinct when Claude encoded_path collides', () => {
    const hyphenPath = 'C:/Work/a-b'
    const underscorePath = 'C:/Work/a_b'

    expect(encodePath(normalizeProjectPath(hyphenPath, 'win32'))).toBe(
      encodePath(normalizeProjectPath(underscorePath, 'win32'))
    )
    expect(buildProjectPathKey(hyphenPath, 'win32')).toBe('win32:c:/work/a-b')
    expect(buildProjectPathKey(underscorePath, 'win32')).toBe('win32:c:/work/a_b')
  })

  it('normalizes UNC and rejects relative Windows paths', () => {
    expect(normalizeProjectPath('\\\\?\\UNC\\server\\share\\dir\\..\\Demo\\', 'win32')).toBe('\\\\server\\share\\Demo')
    expect(() => normalizeProjectPath('C:relative', 'win32')).toThrow(/absolute Windows path/)
    expect(() => normalizeProjectPath('\\relative-root', 'win32')).toThrow(/absolute Windows path/)
  })

  it('keeps POSIX path keys case-sensitive', () => {
    expect(normalizeProjectPath('/Users/me/../Me/Project/', 'linux')).toBe('/Users/Me/Project')
    expect(buildProjectPathKey('/Users/Me/Project', 'linux')).toBe('posix:/Users/Me/Project')
    expect(buildProjectPathKey('/users/me/project', 'linux')).toBe('posix:/users/me/project')
  })
})
