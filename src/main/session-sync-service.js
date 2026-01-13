/**
 * Session Sync Service
 *
 * Handles incremental synchronization from ~/.claude/ to the local database
 */

const fs = require('fs').promises
const { existsSync, createReadStream, statSync } = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

class SessionSyncService {
  constructor(sessionDatabase) {
    this.db = sessionDatabase
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.projectsDir = path.join(this.claudeDir, 'projects')
    this.syncing = false
    this.lastSyncStats = null
  }

  /**
   * Encode a project path to Claude's directory format
   */
  encodePath(projectPath) {
    return projectPath
      .replace(/:/g, '-')
      .replace(/\\/g, '-')
      .replace(/\//g, '-')
  }

  /**
   * Decode Claude's encoded path back to original
   */
  decodePath(encodedPath) {
    const parts = encodedPath.split('-').filter(p => p !== '')

    if (process.platform === 'win32') {
      const drive = parts[0] + ':'
      const rest = parts.slice(1).join('\\')
      return drive + '\\' + rest
    } else {
      return '/' + parts.join('/')
    }
  }

  /**
   * Get project name from path
   */
  getProjectName(projectPath) {
    const parts = projectPath.split(/[\\/]/)
    return parts[parts.length - 1] || projectPath
  }

  /**
   * Perform full sync
   * Returns statistics about what was synced
   */
  async sync() {
    if (this.syncing) {
      console.log('[Sync] Already syncing, skipping...')
      return { status: 'busy', message: 'Sync already in progress' }
    }

    this.syncing = true
    const startTime = Date.now()
    const stats = {
      projectsScanned: 0,
      projectsAdded: 0,
      sessionsScanned: 0,
      sessionsAdded: 0,
      sessionsUpdated: 0,
      messagesAdded: 0,
      errors: []
    }

    try {
      console.log('[Sync] Starting sync from', this.projectsDir)

      if (!existsSync(this.projectsDir)) {
        console.log('[Sync] Claude projects directory not found')
        return { status: 'error', message: 'Claude projects directory not found' }
      }

      // Get all project directories
      const projectDirs = await fs.readdir(this.projectsDir, { withFileTypes: true })

      for (const entry of projectDirs) {
        if (!entry.isDirectory()) continue

        stats.projectsScanned++

        try {
          const encodedPath = entry.name
          const projectPath = this.decodePath(encodedPath)
          const projectName = this.getProjectName(projectPath)

          // Get or create project in database
          const project = this.db.getOrCreateProject(projectPath, encodedPath, projectName)
          if (!project.id && project.lastInsertRowid) {
            stats.projectsAdded++
          }
          const projectId = project.id || project.lastInsertRowid

          // Sync sessions for this project
          const sessionStats = await this.syncProjectSessions(projectId, encodedPath)
          stats.sessionsScanned += sessionStats.scanned
          stats.sessionsAdded += sessionStats.added
          stats.sessionsUpdated += sessionStats.updated
          stats.messagesAdded += sessionStats.messagesAdded

          // Update project timestamp
          this.db.touchProject(projectId)

        } catch (err) {
          console.error('[Sync] Error processing project:', entry.name, err)
          stats.errors.push({ project: entry.name, error: err.message })
        }
      }

      const duration = Date.now() - startTime
      console.log('[Sync] Completed in', duration, 'ms')
      console.log('[Sync] Stats:', stats)

      this.lastSyncStats = { ...stats, duration, timestamp: Date.now() }

      return {
        status: 'success',
        ...stats,
        duration
      }

    } catch (err) {
      console.error('[Sync] Sync failed:', err)
      return { status: 'error', message: err.message }
    } finally {
      this.syncing = false
    }
  }

  /**
   * Sync sessions for a specific project
   */
  async syncProjectSessions(projectId, encodedPath) {
    const stats = {
      scanned: 0,
      added: 0,
      updated: 0,
      messagesAdded: 0
    }

    const projectDir = path.join(this.projectsDir, encodedPath)
    const files = await fs.readdir(projectDir)
    const sessionFiles = files.filter(f => f.endsWith('.jsonl'))

    for (const file of sessionFiles) {
      stats.scanned++

      const sessionUuid = file.replace('.jsonl', '')
      const filePath = path.join(projectDir, file)

      try {
        const fileStat = statSync(filePath)
        const fileMtime = fileStat.mtimeMs

        // Check if session exists and if file has changed
        const existingSession = this.db.getSessionByUuid(sessionUuid)

        if (existingSession) {
          // Check if file has been modified since last sync
          if (existingSession.file_mtime && fileMtime <= existingSession.file_mtime) {
            // No changes, skip
            continue
          }

          // File changed, need incremental sync
          const messagesAdded = await this.syncSessionMessages(
            existingSession.id,
            filePath,
            existingSession.last_synced_uuid
          )

          stats.updated++
          stats.messagesAdded += messagesAdded

        } else {
          // New session, full sync
          const session = this.db.getOrCreateSession(projectId, sessionUuid)
          const sessionId = session.id || session.lastInsertRowid

          const messagesAdded = await this.syncSessionMessages(sessionId, filePath, null)

          stats.added++
          stats.messagesAdded += messagesAdded
        }

        // Update session metadata
        await this.updateSessionMetadata(sessionUuid, filePath, fileMtime)

      } catch (err) {
        console.error('[Sync] Error syncing session:', sessionUuid, err)
      }
    }

    return stats
  }

  /**
   * Sync messages for a session (incremental)
   */
  async syncSessionMessages(sessionId, filePath, lastSyncedUuid) {
    return new Promise((resolve) => {
      const messages = []
      let foundLastSynced = !lastSyncedUuid // If no lastSyncedUuid, start from beginning
      let lastUuid = null

      const stream = createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)

          // Skip until we find the last synced message
          if (!foundLastSynced) {
            if (msg.uuid === lastSyncedUuid) {
              foundLastSynced = true
            }
            return
          }

          // Process user and assistant messages
          if (msg.type === 'user' || msg.type === 'assistant') {
            const normalized = this.normalizeMessage(msg, sessionId)
            if (normalized) {
              // Check if message already exists (might happen in edge cases)
              if (!this.db.messageExists(normalized.uuid)) {
                messages.push(normalized)
              }
              lastUuid = normalized.uuid
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      })

      rl.on('close', () => {
        // Batch insert messages
        if (messages.length > 0) {
          this.db.insertMessages(messages)

          // Update session's last synced UUID
          if (lastUuid) {
            const session = this.db.getSessionByUuid(
              this.db.db.prepare('SELECT session_uuid FROM sessions WHERE id = ?').get(sessionId)?.session_uuid
            )
            if (session) {
              this.db.updateSession(sessionId, { last_synced_uuid: lastUuid })
            }
          }
        }

        resolve(messages.length)
      })

      rl.on('error', () => {
        resolve(0)
      })
    })
  }

  /**
   * Normalize a message from Claude format to database format
   */
  normalizeMessage(msg, sessionId) {
    const normalized = {
      session_id: sessionId,
      uuid: msg.uuid,
      parent_uuid: msg.parentUuid || null,
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: '',
      timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : null,
      tokens_in: null,
      tokens_out: null,
      is_meta: msg.isMeta ? 1 : 0
    }

    // Extract content
    if (msg.type === 'user') {
      const content = msg.message?.content
      if (typeof content === 'string') {
        const trimmed = content.trim()
        // Skip invalid content
        if (!trimmed || trimmed.match(/^\[object \w+\]$/)) {
          return null
        }
        normalized.content = trimmed
      } else if (Array.isArray(content)) {
        const textParts = content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text)
        normalized.content = textParts.join('\n') || ''
      } else {
        return null // Skip non-text content
      }
    } else if (msg.type === 'assistant') {
      const contents = msg.message?.content || []
      const textContent = contents.find(c => c.type === 'text')
      normalized.content = textContent?.text || ''

      // Extract token usage
      if (msg.message?.usage) {
        normalized.tokens_in = msg.message.usage.input_tokens || null
        normalized.tokens_out = msg.message.usage.output_tokens || null
      }
    }

    // Skip empty content
    if (!normalized.content.trim()) {
      return null
    }

    return normalized
  }

  /**
   * Update session metadata after sync
   */
  async updateSessionMetadata(sessionUuid, filePath, fileMtime) {
    return new Promise((resolve) => {
      const metadata = {
        model: null,
        started_at: null,
        last_message_at: null,
        message_count: 0
      }

      const stream = createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)

          if ((msg.type === 'user' || msg.type === 'assistant') && !msg.isMeta) {
            metadata.message_count++

            if (msg.timestamp) {
              const ts = new Date(msg.timestamp).getTime()
              if (!metadata.started_at || ts < metadata.started_at) {
                metadata.started_at = ts
              }
              if (!metadata.last_message_at || ts > metadata.last_message_at) {
                metadata.last_message_at = ts
              }
            }

            if (msg.type === 'assistant' && msg.message?.model) {
              metadata.model = msg.message.model
            }
          }
        } catch {
          // Skip invalid lines
        }
      })

      rl.on('close', () => {
        const session = this.db.getSessionByUuid(sessionUuid)
        if (session) {
          this.db.updateSession(session.id, {
            model: metadata.model,
            started_at: metadata.started_at,
            last_message_at: metadata.last_message_at,
            message_count: metadata.message_count,
            file_mtime: fileMtime
          })
        }
        resolve()
      })

      rl.on('error', () => {
        resolve()
      })
    })
  }

  /**
   * Get last sync statistics
   */
  getLastSyncStats() {
    return this.lastSyncStats
  }

  /**
   * Check if sync is in progress
   */
  isSyncing() {
    return this.syncing
  }
}

module.exports = { SessionSyncService }
