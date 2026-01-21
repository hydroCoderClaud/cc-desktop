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
const { encodePath, decodePath, smartDecodePath, getProjectName } = require('./utils/path-utils')

class SessionSyncService {
  constructor(sessionDatabase) {
    this.db = sessionDatabase
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.projectsDir = path.join(this.claudeDir, 'projects')
    this.syncing = false
    this.lastSyncStats = null
  }

  /**
   * Perform full sync
   * Returns statistics about what was synced
   */
  async sync() {
    if (this.syncing) {
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
      if (!existsSync(this.projectsDir)) {
        return { status: 'error', message: 'Claude projects directory not found' }
      }

      // Get all project directories
      const projectDirs = await fs.readdir(this.projectsDir, { withFileTypes: true })

      for (const entry of projectDirs) {
        if (!entry.isDirectory()) continue

        stats.projectsScanned++

        try {
          const encodedPath = entry.name
          // 优先使用 smartDecodePath 获取正确路径（处理路径中包含 '-' 的情况）
          // 如果找不到，再用 decodePath 作为备选（路径可能已被删除）
          const projectPath = smartDecodePath(encodedPath) || decodePath(encodedPath)
          const projectName = getProjectName(projectPath)

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
          // 如果消息数为0，强制重新同步（可能之前同步失败）
          const needsResync = existingSession.message_count === 0 || existingSession.message_count === null

          // Check if file has been modified since last sync
          if (!needsResync && existingSession.file_mtime && fileMtime <= existingSession.file_mtime) {
            // No changes and has messages, skip
            continue
          }

          // File changed or needs resync, do incremental/full sync
          const messagesAdded = await this.syncSessionMessages(
            existingSession.id,
            filePath,
            needsResync ? null : existingSession.last_synced_uuid  // 如果需要重新同步，从头开始
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
   * Force full sync - clear database and resync everything
   */
  async forceFullSync() {
    if (this.syncing) {
      return { status: 'busy', message: 'Sync already in progress' }
    }

    try {
      // Clear all data from database
      this.db.db.exec('DELETE FROM messages')
      this.db.db.exec('DELETE FROM sessions')
      this.db.db.exec('DELETE FROM projects')

      // Now run normal sync
      return await this.sync()
    } catch (err) {
      console.error('[Sync] Force full sync failed:', err)
      return { status: 'error', message: err.message }
    }
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

  /**
   * Clear invalid sessions (warmup sessions and sessions with < 2 messages)
   * Deletes from both local files and database
   * @returns {Object} Statistics about deleted sessions
   */
  async clearInvalidSessions() {
    const stats = {
      filesDeleted: 0,
      dbSessionsDeleted: 0,
      errors: []
    }

    try {
      // 1. Get all sessions from database that are invalid
      const invalidSessions = this.db.db.prepare(`
        SELECT s.id, s.session_uuid, s.message_count, p.encoded_path
        FROM sessions s
        JOIN projects p ON s.project_id = p.id
        WHERE s.message_count < 2
      `).all()

      // 2. Scan all project directories for warmup sessions
      if (existsSync(this.projectsDir)) {
        const projectDirs = await fs.readdir(this.projectsDir, { withFileTypes: true })

        for (const entry of projectDirs) {
          if (!entry.isDirectory()) continue

          const projectDir = path.join(this.projectsDir, entry.name)
          const files = await fs.readdir(projectDir)
          const sessionFiles = files.filter(f => f.endsWith('.jsonl'))

          for (const file of sessionFiles) {
            const filePath = path.join(projectDir, file)
            const sessionUuid = file.replace('.jsonl', '')

            try {
              // Check if this session is a warmup or has < 2 messages
              const isInvalid = await this.checkSessionInvalid(filePath)

              if (isInvalid) {
                // Delete the file
                await fs.unlink(filePath)
                stats.filesDeleted++

                // Delete from database if exists
                const dbSession = this.db.getSessionByUuid(sessionUuid)
                if (dbSession) {
                  this.db.deleteSession(dbSession.id)
                  stats.dbSessionsDeleted++
                }
              }
            } catch (err) {
              console.error(`[Sync] Error processing session ${sessionUuid}:`, err)
              stats.errors.push({ sessionUuid, error: err.message })
            }
          }
        }
      }

      // 3. Clean up database sessions that no longer have files
      for (const session of invalidSessions) {
        const filePath = path.join(this.projectsDir, session.encoded_path, `${session.session_uuid}.jsonl`)
        if (!existsSync(filePath)) {
          // File doesn't exist, delete from database
          this.db.deleteSession(session.id)
          stats.dbSessionsDeleted++
        }
      }

      return { status: 'success', ...stats }

    } catch (err) {
      console.error('[Sync] Clear invalid sessions failed:', err)
      return { status: 'error', message: err.message, ...stats }
    }
  }

  /**
   * Check if a session file is invalid (warmup or < 2 messages)
   * @param {string} filePath - Path to the JSONL file
   * @returns {Promise<boolean>} True if the session is invalid
   */
  async checkSessionInvalid(filePath) {
    return new Promise((resolve) => {
      let messageCount = 0
      let isWarmup = false
      let firstUserMessage = null

      const stream = createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)

          if ((msg.type === 'user' || msg.type === 'assistant') && !msg.isMeta) {
            messageCount++

            // Check first user message for warmup
            if (msg.type === 'user' && !firstUserMessage) {
              const content = msg.message?.content
              if (typeof content === 'string') {
                firstUserMessage = content.trim().toLowerCase()
              } else if (Array.isArray(content)) {
                const textParts = content.filter(c => c.type === 'text' && c.text)
                firstUserMessage = textParts.map(c => c.text).join(' ').trim().toLowerCase()
              }

              if (firstUserMessage && firstUserMessage.includes('warmup')) {
                isWarmup = true
              }
            }
          }
        } catch {
          // Skip invalid lines
        }
      })

      rl.on('close', () => {
        // Invalid if warmup OR message count < 2
        resolve(isWarmup || messageCount < 2)
      })

      rl.on('error', () => {
        // On error, consider it invalid
        resolve(true)
      })
    })
  }
}

module.exports = { SessionSyncService }
