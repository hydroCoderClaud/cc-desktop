const fs = require('fs')
const path = require('path')

const {
  LEGACY_CLAUDE_CONFIG_DIR,
  getClaudeConfigDir,
  getClaudeProjectsDir
} = require('./claude-config-paths')

const LEGACY_PROJECTS_MIGRATION_STATE_FILE = '.legacy-projects-migration.json'

function getLegacyClaudeProjectsDir() {
  return path.join(LEGACY_CLAUDE_CONFIG_DIR, 'projects')
}

function getLegacyProjectsMigrationStatePath(configManager) {
  if (configManager?.userDataPath) {
    return path.join(configManager.userDataPath, 'legacy-projects-migration.json')
  }
  return path.join(getClaudeConfigDir(configManager), LEGACY_PROJECTS_MIGRATION_STATE_FILE)
}

function readMigrationState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return null
    const raw = fs.readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeMigrationState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

function createMigrationStats() {
  return {
    copiedDirs: 0,
    copiedFiles: 0,
    skippedFiles: 0,
    conflicts: 0,
    errors: []
  }
}

function copyMissingTree(sourcePath, targetPath, stats, relativePath = '') {
  const sourceStat = fs.lstatSync(sourcePath)

  if (sourceStat.isDirectory()) {
    if (fs.existsSync(targetPath)) {
      const targetStat = fs.lstatSync(targetPath)
      if (!targetStat.isDirectory()) {
        stats.conflicts += 1
        stats.errors.push({
          path: relativePath || path.basename(sourcePath),
          message: 'target path exists as a file'
        })
        return
      }
    } else {
      fs.mkdirSync(targetPath, { recursive: true })
      stats.copiedDirs += 1
    }

    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const childSource = path.join(sourcePath, entry.name)
      const childTarget = path.join(targetPath, entry.name)
      const childRelative = relativePath ? path.join(relativePath, entry.name) : entry.name
      copyMissingTree(childSource, childTarget, stats, childRelative)
    }
    return
  }

  if (fs.existsSync(targetPath)) {
    stats.skippedFiles += 1
    return
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
  stats.copiedFiles += 1
}

function shouldSkipMigration(state, sourceProjectsDir, targetProjectsDir) {
  if (!state || typeof state !== 'object') return false
  const sameSource = state.sourceProjectsDir === sourceProjectsDir
  const sameTarget = state.targetProjectsDir === targetProjectsDir
  if (!sameSource || !sameTarget) return false
  return state.status === 'completed' || state.status === 'skipped_no_source'
}

function migrateLegacyClaudeProjects(options = {}) {
  const {
    configManager,
    logger = console,
    sourceProjectsDir = getLegacyClaudeProjectsDir(),
    targetProjectsDir = getClaudeProjectsDir(configManager),
    migrationStatePath = getLegacyProjectsMigrationStatePath(configManager)
  } = options

  const currentState = readMigrationState(migrationStatePath)
  if (path.resolve(sourceProjectsDir) === path.resolve(targetProjectsDir)) {
    return {
      status: 'skipped_same_path',
      sourceProjectsDir,
      targetProjectsDir,
      migrationStatePath,
      copiedDirs: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      conflicts: 0,
      errors: []
    }
  }

  if (shouldSkipMigration(currentState, sourceProjectsDir, targetProjectsDir)) {
    return {
      status: 'skipped_already_migrated',
      sourceProjectsDir,
      targetProjectsDir,
      migrationStatePath,
      copiedDirs: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      conflicts: 0,
      errors: []
    }
  }

  const stats = createMigrationStats()
  const stateBase = {
    sourceProjectsDir,
    targetProjectsDir,
    migrationStatePath,
    startedAt: new Date().toISOString()
  }

  try {
    if (!fs.existsSync(sourceProjectsDir) || !fs.statSync(sourceProjectsDir).isDirectory()) {
      const state = {
        ...stateBase,
        status: 'skipped_no_source',
        completedAt: new Date().toISOString()
      }
      writeMigrationState(migrationStatePath, state)
      return {
        ...state,
        copiedDirs: 0,
        copiedFiles: 0,
        skippedFiles: 0,
        conflicts: 0,
        errors: []
      }
    }

    fs.mkdirSync(targetProjectsDir, { recursive: true })

    for (const entry of fs.readdirSync(sourceProjectsDir, { withFileTypes: true })) {
      const sourcePath = path.join(sourceProjectsDir, entry.name)
      const targetPath = path.join(targetProjectsDir, entry.name)
      try {
        copyMissingTree(sourcePath, targetPath, stats, entry.name)
      } catch (error) {
        stats.errors.push({
          path: entry.name,
          message: error?.message || String(error)
        })
      }
    }

    const status = stats.errors.length > 0 ? 'partial' : 'completed'
    const result = {
      ...stateBase,
      status,
      completedAt: new Date().toISOString(),
      ...stats
    }

    writeMigrationState(migrationStatePath, result)

    if (stats.copiedFiles > 0 || stats.copiedDirs > 0 || stats.skippedFiles > 0 || stats.conflicts > 0) {
      logger?.info?.(
        `[HydroAgent] Legacy projects migration ${status}: ` +
        `${stats.copiedDirs} dirs copied, ${stats.copiedFiles} files copied, ` +
        `${stats.skippedFiles} files skipped, ${stats.conflicts} conflicts`
      )
    }

    if (stats.errors.length > 0) {
      logger?.warn?.(
        `[HydroAgent] Legacy projects migration encountered ${stats.errors.length} error(s)`
      )
    }

    return result
  } catch (error) {
    logger?.error?.('[HydroAgent] Failed to migrate legacy projects:', error)
    const result = {
      ...stateBase,
      status: 'failed',
      completedAt: new Date().toISOString(),
      copiedDirs: stats.copiedDirs,
      copiedFiles: stats.copiedFiles,
      skippedFiles: stats.skippedFiles,
      conflicts: stats.conflicts,
      errors: [
        ...stats.errors,
        {
          path: '',
          message: error?.message || String(error)
        }
      ]
    }

    try {
      writeMigrationState(migrationStatePath, result)
    } catch {
      // Best effort only; startup must continue.
    }

    return result
  }
}

module.exports = {
  LEGACY_PROJECTS_MIGRATION_STATE_FILE,
  copyMissingTree,
  getLegacyClaudeProjectsDir,
  getLegacyProjectsMigrationStatePath,
  migrateLegacyClaudeProjects
}
