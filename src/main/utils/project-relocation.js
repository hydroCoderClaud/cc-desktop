const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { isDeepStrictEqual } = require('util')

const {
  atomicWriteJson,
  encodePath,
  normalizeProjectPath,
  resolveExistingProjectPath,
  buildProjectPathKey
} = require('./path-utils')
const { getClaudeJsonPath, getClaudeProjectsDir } = require('./claude-config-paths')

function countTree(targetPath) {
  if (!fs.existsSync(targetPath)) return { files: 0, directories: 0, bytes: 0 }
  const stat = fs.lstatSync(targetPath)
  if (!stat.isDirectory()) return { files: 1, directories: 0, bytes: stat.size }

  const result = { files: 0, directories: 1, bytes: 0 }
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const child = countTree(path.join(targetPath, entry.name))
    result.files += child.files
    result.directories += child.directories
    result.bytes += child.bytes
  }
  return result
}

function filesEqual(sourcePath, targetPath) {
  try {
    const sourceStat = fs.statSync(sourcePath)
    const targetStat = fs.statSync(targetPath)
    if (sourceStat.size !== targetStat.size) return false
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
    const targetHash = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex')
    return sourceHash === targetHash
  } catch {
    return false
  }
}

function isSessionsIndexPath(relativePath) {
  return relativePath.replace(/\\/g, '/') === 'sessions-index.json'
}

function filesMatchAfterRelocation(sourcePath, targetPath, relativePath, relocation) {
  if (filesEqual(sourcePath, targetPath)) return true
  if (!relocation || !isSessionsIndexPath(relativePath)) return false

  try {
    const sourceIndex = readSessionsIndex(sourcePath)
    const targetIndex = readSessionsIndex(targetPath)
    const migratedSourceIndex = rewriteIndexPathFields(
      sourceIndex,
      relocation.oldPath,
      relocation.newPath,
      relocation.oldClaudeDir,
      relocation.newClaudeDir
    )
    return isDeepStrictEqual(migratedSourceIndex, targetIndex)
  } catch {
    return false
  }
}

function collectConflicts(sourcePath, targetPath, relativePath = '', conflicts = [], relocation = null) {
  if (!fs.existsSync(targetPath)) return conflicts
  const sourceStat = fs.lstatSync(sourcePath)
  const targetStat = fs.lstatSync(targetPath)
  if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
    conflicts.push(relativePath || path.basename(sourcePath))
    return conflicts
  }
  if (!sourceStat.isDirectory() && !filesMatchAfterRelocation(sourcePath, targetPath, relativePath, relocation)) {
    conflicts.push(relativePath || path.basename(sourcePath))
    return conflicts
  }
  if (sourceStat.isDirectory()) {
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
      collectConflicts(
        path.join(sourcePath, entry.name),
        path.join(targetPath, entry.name),
        childRelativePath,
        conflicts,
        relocation
      )
    }
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (!fs.existsSync(path.join(sourcePath, entry.name))) {
        conflicts.push(relativePath ? path.join(relativePath, entry.name) : entry.name)
      }
    }
  }
  return conflicts
}

function copyMissingTree(sourcePath, targetPath, createdPaths = null, relocation = null, relativePath = '') {
  const sourceStat = fs.lstatSync(sourcePath)
  if (sourceStat.isDirectory()) {
    if (fs.existsSync(targetPath) && !fs.lstatSync(targetPath).isDirectory()) {
      throw new Error(`Target path is a file: ${targetPath}`)
    }
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true })
      createdPaths?.push(targetPath)
    }
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
      copyMissingTree(
        path.join(sourcePath, entry.name),
        path.join(targetPath, entry.name),
        createdPaths,
        relocation,
        childRelativePath
      )
    }
    return
  }

  if (fs.existsSync(targetPath)) {
    if (!filesMatchAfterRelocation(sourcePath, targetPath, relativePath, relocation)) {
      throw new Error(`Target file conflicts with source: ${targetPath}`)
    }
    return
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
  createdPaths?.push(targetPath)
}

function cleanupCreatedPaths(createdPaths) {
  for (const createdPath of [...createdPaths].reverse()) {
    try {
      if (fs.existsSync(createdPath)) fs.rmSync(createdPath, { recursive: true, force: true })
    } catch {
      // Best effort cleanup; the original source remains available for retry.
    }
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
    if (!value || typeof value !== 'object') throw new Error('root value is not an object')
    return value
  } catch (error) {
    throw new Error(`Invalid JSON file: ${filePath} (${error.message})`)
  }
}

const INDEX_PATH_FIELDS = new Set(['fullPath', 'projectPath', 'originalPath'])

function replacePathValue(value, oldValue, newValue) {
  const candidates = [
    [oldValue, newValue],
    [oldValue.replace(/\\/g, '/'), newValue.replace(/\\/g, '/')],
    [oldValue.replace(/\//g, '\\'), newValue.replace(/\//g, '\\')]
  ]
  for (const [oldCandidate, newCandidate] of candidates) {
    if (value === oldCandidate) return newCandidate
    for (const separator of ['\\', '/']) {
      const prefix = oldCandidate.endsWith(separator) ? oldCandidate : `${oldCandidate}${separator}`
      if (value.startsWith(prefix)) return `${newCandidate}${value.slice(oldCandidate.length)}`
    }
  }
  return value
}

function readSessionsIndex(filePath) {
  const value = readJson(filePath)
  if (!value) return null
  if (!Array.isArray(value.entries)) {
    throw new Error(`Invalid sessions index: ${filePath} (entries must be an array)`)
  }
  return value
}

function rewriteIndexPathFields(value, oldPath, newPath, oldProjectDir, newProjectDir, key = '') {
  if (typeof value === 'string') {
    if (!INDEX_PATH_FIELDS.has(key)) return value
    const projectRewritten = replacePathValue(value, oldPath, newPath)
    return replacePathValue(projectRewritten, oldProjectDir, newProjectDir)
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteIndexPathFields(item, oldPath, newPath, oldProjectDir, newProjectDir, key))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey,
    rewriteIndexPathFields(child, oldPath, newPath, oldProjectDir, newProjectDir, childKey)
  ]))
}

function replacePathReferences(value, oldPath, newPath, oldProjectDir, newProjectDir) {
  if (typeof value === 'string') {
    return value
      .split(oldProjectDir).join(newProjectDir)
      .split(oldPath).join(newPath)
  }
  if (Array.isArray(value)) return value.map(item => replacePathReferences(item, oldPath, newPath, oldProjectDir, newProjectDir))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    replacePathReferences(child, oldPath, newPath, oldProjectDir, newProjectDir)
  ]))
}

function getProjectDirectory(configManager, encodedPath) {
  return path.join(getClaudeProjectsDir(configManager), encodedPath)
}

function getLocalMcpConfig(claudeJson, projectPath) {
  const normalizedPath = projectPath.replace(/\\/g, '/')
  return claudeJson?.projects?.[normalizedPath] || null
}

function localMcpConfigsMatchAfterRelocation(oldMcp, newMcp, oldPath, newPath, oldClaudeDir, newClaudeDir) {
  if (!oldMcp || !newMcp) return oldMcp === newMcp
  return isDeepStrictEqual(
    replacePathReferences(oldMcp, oldPath, newPath, oldClaudeDir, newClaudeDir),
    newMcp
  )
}

function buildRelocationPreview({ project, newPath, sessionDatabase, agentSessionManager, configManager }) {
  if (!project || project.project_kind !== 'workspace') {
    throw new Error('Only workspace projects can be relocated')
  }
  if (!fs.existsSync(newPath) || !fs.statSync(newPath).isDirectory()) {
    throw new Error('The new project directory does not exist')
  }

  const normalizedNewPath = resolveExistingProjectPath(newPath)
  const oldPath = resolveExistingProjectPath(project.path)
  if (buildProjectPathKey(oldPath) === buildProjectPathKey(normalizedNewPath)) {
    throw new Error('The new directory is the current project directory')
  }

  const existingProject = sessionDatabase.getProjectByPath(normalizedNewPath)
  if (existingProject && existingProject.id !== project.id) {
    throw new Error('The new directory is already registered as another project')
  }

  const activeSessions = Array.from(agentSessionManager?.sessions?.entries?.() || [])
    .filter(([, session]) => String(session?.projectId || '') === String(project.id))
    .filter(([, session]) => session?.queryGenerator || session?.cliPid || session?.status === 'streaming' || session?.messageQueue?.isDone === false)
    .map(([sessionId, session]) => session?.id || sessionId)

  const oldEncodedPath = project.encoded_path || encodePath(oldPath)
  const newEncodedPath = encodePath(normalizedNewPath)
  if (oldEncodedPath === newEncodedPath && oldPath !== normalizedNewPath) {
    throw new Error('The new directory has the same Claude history encoding as the current directory')
  }
  const oldClaudeDir = getProjectDirectory(configManager, oldEncodedPath)
  const newClaudeDir = getProjectDirectory(configManager, newEncodedPath)
  const oldIndexPath = path.join(oldClaudeDir, 'sessions-index.json')
  const newIndexPath = path.join(newClaudeDir, 'sessions-index.json')
  // Validate both indexes during preview so a damaged file cannot be treated
  // as an empty/missing history and silently migrated.
  if (fs.existsSync(oldIndexPath)) readSessionsIndex(oldIndexPath)
  if (fs.existsSync(newIndexPath)) readSessionsIndex(newIndexPath)
  const oldTree = countTree(oldClaudeDir)
  const newTree = countTree(newClaudeDir)
  const conflicts = fs.existsSync(oldClaudeDir) && fs.existsSync(newClaudeDir) && oldClaudeDir !== newClaudeDir
    ? collectConflicts(oldClaudeDir, newClaudeDir, '', [], {
      oldPath,
      newPath: normalizedNewPath,
      oldClaudeDir,
      newClaudeDir
    })
    : (!fs.existsSync(oldClaudeDir) && (newTree.files > 0 || newTree.directories > 1)
      ? ['target contains existing Claude history']
      : [])
  const claudeJson = readJson(getClaudeJsonPath(configManager)) || {}
  const oldMcp = getLocalMcpConfig(claudeJson, oldPath)
  const newMcp = getLocalMcpConfig(claudeJson, normalizedNewPath)
  const mcpConflict = Boolean(oldMcp && newMcp && !localMcpConfigsMatchAfterRelocation(
    oldMcp,
    newMcp,
    oldPath,
    normalizedNewPath,
    oldClaudeDir,
    newClaudeDir
  ))

  return {
    projectId: project.id,
    oldPath,
    newPath: normalizedNewPath,
    oldClaudeDir,
    newClaudeDir,
    sessionCount: sessionDatabase.listAllAgentConversations({ limit: null })
      .filter(row => String(row.project_id || '') === String(project.id)).length,
    activeSessionIds: activeSessions,
    oldTree,
    newTree,
    conflicts,
    mcpConflict,
    canExecute: activeSessions.length === 0 && conflicts.length === 0 && !mcpConflict
  }
}

function migrateClaudeData(preview, configManager) {
  if (preview.conflicts.length || preview.mcpConflict) {
    throw new Error('Project history contains conflicts and cannot be migrated automatically')
  }

  const createdPaths = []
  const overwrittenFiles = new Map()
  const temporaryFiles = new Set()
  const claudeJsonPath = getClaudeJsonPath(configManager)
  const originalClaudeJson = fs.existsSync(claudeJsonPath) ? fs.readFileSync(claudeJsonPath) : null
  let claudeJsonWriteStarted = false
  const rollback = () => {
    cleanupCreatedPaths(createdPaths)
    for (const [filePath, content] of overwrittenFiles) {
      try {
        fs.writeFileSync(filePath, content)
      } catch {
        // Best effort restoration; the source remains available for retry.
      }
    }
    if (claudeJsonWriteStarted) {
      try {
        if (originalClaudeJson === null) {
          if (fs.existsSync(claudeJsonPath)) fs.rmSync(claudeJsonPath, { force: true })
        } else {
          fs.writeFileSync(claudeJsonPath, originalClaudeJson)
        }
      } catch {
        // Best effort restoration; the old project and source history remain intact.
      }
    }
    try {
      temporaryFiles.add(`${claudeJsonPath}.tmp`)
      temporaryFiles.add(path.join(preview.newClaudeDir, 'sessions-index.json.tmp'))
      for (const tmpPath of temporaryFiles) {
        try {
          if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true, recursive: true })
        } catch {
          // Best effort cleanup of each temporary file independently.
        }
      }
    } catch {
      // Best effort cleanup.
    }
  }
  try {
    const newIndexPath = path.join(preview.newClaudeDir, 'sessions-index.json')
    const newIndexExistedBeforeCopy = fs.existsSync(newIndexPath)
    const hasClaudeHistory = fs.existsSync(preview.oldClaudeDir) && preview.oldClaudeDir !== preview.newClaudeDir
    if (hasClaudeHistory) {
      copyMissingTree(preview.oldClaudeDir, preview.newClaudeDir, createdPaths, {
        oldPath: preview.oldPath,
        newPath: preview.newPath,
        oldClaudeDir: preview.oldClaudeDir,
        newClaudeDir: preview.newClaudeDir
      })
    }

    const oldIndexPath = path.join(preview.oldClaudeDir, 'sessions-index.json')
    const oldIndex = hasClaudeHistory ? readSessionsIndex(oldIndexPath) : null
    if (oldIndex) {
      const newIndex = readSessionsIndex(newIndexPath) || { version: oldIndex.version || 1, entries: [] }
      const entries = new Map((newIndex.entries || []).map(entry => [entry.sessionId, entry]))
      for (const entry of oldIndex.entries || []) {
        entries.set(entry.sessionId, rewriteIndexPathFields(
          entry,
          preview.oldPath,
          preview.newPath,
          preview.oldClaudeDir,
          preview.newClaudeDir
        ))
      }
      if (newIndexExistedBeforeCopy) {
        overwrittenFiles.set(newIndexPath, fs.readFileSync(newIndexPath))
      } else if (!createdPaths.includes(newIndexPath)) {
        createdPaths.push(newIndexPath)
      }
      temporaryFiles.add(`${newIndexPath}.tmp`)
      const migratedIndex = rewriteIndexPathFields(
        { ...newIndex, entries: [...entries.values()] },
        preview.oldPath,
        preview.newPath,
        preview.oldClaudeDir,
        preview.newClaudeDir
      )
      migratedIndex.originalPath = preview.newPath
      atomicWriteJson(newIndexPath, migratedIndex)
    }

    const claudeJson = readJson(claudeJsonPath)
    if (claudeJson?.projects?.[preview.oldPath.replace(/\\/g, '/')]) {
      claudeJson.projects = { ...(claudeJson.projects || {}) }
      const oldKey = preview.oldPath.replace(/\\/g, '/')
      const newKey = preview.newPath.replace(/\\/g, '/')
      if (!claudeJson.projects[newKey]) {
        claudeJson.projects[newKey] = replacePathReferences(
          claudeJson.projects[oldKey],
          preview.oldPath,
          preview.newPath,
          preview.oldClaudeDir,
          preview.newClaudeDir
        )
        claudeJsonWriteStarted = true
        atomicWriteJson(claudeJsonPath, claudeJson)
      }
      return { copied: true, indexUpdated: Boolean(oldIndex), mcpUpdated: true, rollback }
    }

    return { copied: hasClaudeHistory, indexUpdated: Boolean(oldIndex), mcpUpdated: false, rollback }
  } catch (error) {
    rollback()
    throw error
  }
}

module.exports = {
  buildRelocationPreview,
  migrateClaudeData,
  countTree,
  collectConflicts
}
