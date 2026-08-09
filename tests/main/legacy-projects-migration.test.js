import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const requireCjs = createRequire(import.meta.url)
const { migrateLegacyClaudeProjects } = requireCjs('../../src/main/utils/legacy-projects-migration.js')

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

function quietLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  }
}

describe('legacy Claude projects migration', () => {
  it('copies missing legacy project files without overwriting existing target files', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-legacy-projects-'))
    const sourceProjectsDir = path.join(tempRoot, 'legacy', 'projects')
    const targetProjectsDir = path.join(tempRoot, 'hydro', 'projects')
    const migrationStatePath = path.join(tempRoot, 'hydro', '.legacy-projects-migration.json')

    try {
      writeFile(path.join(sourceProjectsDir, 'alpha', 'session-1.json'), 'legacy-session-1')
      writeFile(path.join(sourceProjectsDir, 'alpha', 'nested', 'session-2.json'), 'legacy-session-2')
      writeFile(path.join(sourceProjectsDir, 'beta', 'session-3.json'), 'legacy-session-3')
      writeFile(path.join(targetProjectsDir, 'alpha', 'session-1.json'), 'existing-session-1')
      writeFile(path.join(targetProjectsDir, 'beta', 'session-3.json'), 'existing-session-3')

      const result = migrateLegacyClaudeProjects({
        sourceProjectsDir,
        targetProjectsDir,
        migrationStatePath,
        logger: quietLogger()
      })

      expect(result.status).toBe('completed')
      expect(result.copiedDirs).toBeGreaterThan(0)
      expect(result.copiedFiles).toBeGreaterThan(0)
      expect(result.skippedFiles).toBeGreaterThan(0)
      expect(fs.readFileSync(path.join(targetProjectsDir, 'alpha', 'session-1.json'), 'utf-8')).toBe('existing-session-1')
      expect(fs.readFileSync(path.join(targetProjectsDir, 'alpha', 'nested', 'session-2.json'), 'utf-8')).toBe('legacy-session-2')
      expect(fs.readFileSync(path.join(targetProjectsDir, 'beta', 'session-3.json'), 'utf-8')).toBe('existing-session-3')
      expect(JSON.parse(fs.readFileSync(migrationStatePath, 'utf-8')).status).toBe('completed')
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('marks migration as skipped when the legacy projects directory is absent', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-legacy-projects-missing-'))
    const sourceProjectsDir = path.join(tempRoot, 'legacy', 'projects')
    const targetProjectsDir = path.join(tempRoot, 'hydro', 'projects')
    const migrationStatePath = path.join(tempRoot, 'hydro', '.legacy-projects-migration.json')

    try {
      const result = migrateLegacyClaudeProjects({
        sourceProjectsDir,
        targetProjectsDir,
        migrationStatePath,
        logger: quietLogger()
      })

      expect(result.status).toBe('skipped_no_source')
      expect(fs.existsSync(targetProjectsDir)).toBe(false)
      expect(JSON.parse(fs.readFileSync(migrationStatePath, 'utf-8')).status).toBe('skipped_no_source')
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('skips when migration was already completed for the same source and target', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-legacy-projects-done-'))
    const sourceProjectsDir = path.join(tempRoot, 'legacy', 'projects')
    const targetProjectsDir = path.join(tempRoot, 'hydro', 'projects')
    const migrationStatePath = path.join(tempRoot, 'hydro', '.legacy-projects-migration.json')

    try {
      writeFile(path.join(sourceProjectsDir, 'alpha', 'session-1.json'), 'legacy-session-1')
      writeFile(migrationStatePath, JSON.stringify({
        status: 'completed',
        sourceProjectsDir,
        targetProjectsDir
      }))

      const result = migrateLegacyClaudeProjects({
        sourceProjectsDir,
        targetProjectsDir,
        migrationStatePath,
        logger: quietLogger()
      })

      expect(result.status).toBe('skipped_already_migrated')
      expect(fs.existsSync(targetProjectsDir)).toBe(false)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
