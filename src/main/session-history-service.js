/**
 * Session History Service
 *
 * Reads Claude Code session data from ~/.claude/ directory
 * Provides read-only access to conversation history
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')
const readline = require('readline')
const { createReadStream, existsSync } = require('fs')
const { encodePath, decodePath, smartDecodePath } = require('./utils/path-utils')

class SessionHistoryService {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.projectsDir = path.join(this.claudeDir, 'projects')
    this.historyFile = path.join(this.claudeDir, 'history.jsonl')
  }

  /**
   * Get all projects that have Claude session data
   */
  async getProjects() {
    try {
      if (!existsSync(this.projectsDir)) {
        return []
      }

      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true })
      const projects = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectDir = path.join(this.projectsDir, entry.name)
          const stats = await fs.stat(projectDir)

          // Count session files (*.jsonl)
          const files = await fs.readdir(projectDir)
          const sessionFiles = files.filter(f => f.endsWith('.jsonl'))

          projects.push({
            encodedPath: entry.name,
            // 优先使用 smartDecodePath 获取正确路径（处理路径中包含 '-' 的情况）
            path: smartDecodePath(entry.name) || decodePath(entry.name),
            lastModified: stats.mtime,
            sessionCount: sessionFiles.length
          })
        }
      }

      // Sort by last modified (newest first)
      projects.sort((a, b) => b.lastModified - a.lastModified)
      return projects
    } catch (err) {
      console.error('Failed to get projects:', err)
      return []
    }
  }

  /**
   * Get sessions for a specific project
   */
  async getProjectSessions(projectPath) {
    try {
      const encodedPath = encodePath(projectPath)
      const projectDir = path.join(this.projectsDir, encodedPath)

      if (!existsSync(projectDir)) {
        return []
      }

      const files = await fs.readdir(projectDir)
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'))
      const sessions = []

      for (const file of sessionFiles) {
        const sessionId = file.replace('.jsonl', '')
        const filePath = path.join(projectDir, file)
        const stats = await fs.stat(filePath)

        // Read first and last few lines to get metadata
        const metadata = await this.getSessionMetadata(filePath)

        sessions.push({
          id: sessionId,
          projectPath,
          filePath,
          fileSize: stats.size,
          lastModified: stats.mtime,
          ...metadata
        })
      }

      // Sort by last modified (newest first)
      sessions.sort((a, b) => b.lastModified - a.lastModified)
      return sessions
    } catch (err) {
      console.error('Failed to get project sessions:', err)
      return []
    }
  }

  /**
   * Get metadata from session file (summary, message count, etc.)
   */
  async getSessionMetadata(filePath) {
    return new Promise((resolve) => {
      const metadata = {
        summary: null,
        messageCount: 0,
        userMessageCount: 0,
        assistantMessageCount: 0,
        startTime: null,
        lastMessageTime: null,
        model: null,
        firstUserMessage: null
      }

      const stream = createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)

          // Count messages
          if (msg.type === 'user' && !msg.isMeta) {
            metadata.userMessageCount++
            metadata.messageCount++

            // Get first user message for display (skip invalid content)
            if (!metadata.firstUserMessage && msg.message?.content) {
              const content = msg.message.content
              if (typeof content === 'string') {
                const trimmed = content.trim()
                // Skip empty or object notation content
                if (trimmed && !trimmed.match(/^\[object \w+\]$/)) {
                  metadata.firstUserMessage = trimmed.substring(0, 100)
                }
              }
              // If content is an array (like assistant messages), try to extract text
              else if (Array.isArray(content)) {
                const textContent = content.find(c => c.type === 'text' && c.text)
                if (textContent?.text) {
                  metadata.firstUserMessage = textContent.text.substring(0, 100)
                }
              }
            }
          } else if (msg.type === 'assistant') {
            metadata.assistantMessageCount++
            metadata.messageCount++
          }

          // Track timestamps
          if (msg.timestamp) {
            const ts = new Date(msg.timestamp)
            if (!metadata.startTime || ts < metadata.startTime) {
              metadata.startTime = ts
            }
            if (!metadata.lastMessageTime || ts > metadata.lastMessageTime) {
              metadata.lastMessageTime = ts
            }
          }

          // Get model from assistant message
          if (msg.type === 'assistant' && msg.message?.model) {
            metadata.model = msg.message.model
          }

          // Get summary if available
          if (msg.type === 'summary' && msg.summary) {
            metadata.summary = msg.summary
          }
        } catch {
          // Skip invalid JSON lines
        }
      })

      rl.on('close', () => {
        resolve(metadata)
      })

      rl.on('error', () => {
        resolve(metadata)
      })
    })
  }

  /**
   * Get all messages from a session
   */
  async getSessionMessages(projectPath, sessionId) {
    try {
      const encodedPath = encodePath(projectPath)
      const filePath = path.join(this.projectsDir, encodedPath, `${sessionId}.jsonl`)

      if (!existsSync(filePath)) {
        return []
      }

      const messages = []

      return new Promise((resolve) => {
        const stream = createReadStream(filePath, { encoding: 'utf-8' })
        const rl = readline.createInterface({ input: stream })

        rl.on('line', (line) => {
          try {
            const msg = JSON.parse(line)

            // Only include user and assistant messages
            if (msg.type === 'user' || msg.type === 'assistant') {
              messages.push(this.normalizeMessage(msg))
            }
          } catch {
            // Skip invalid JSON lines
          }
        })

        rl.on('close', () => {
          resolve(messages)
        })

        rl.on('error', () => {
          resolve(messages)
        })
      })
    } catch (err) {
      console.error('Failed to get session messages:', err)
      return []
    }
  }

  /**
   * Normalize message format for UI display
   */
  normalizeMessage(msg) {
    const normalized = {
      type: msg.type,
      uuid: msg.uuid,
      parentUuid: msg.parentUuid,
      timestamp: msg.timestamp,
      isMeta: msg.isMeta || false
    }

    if (msg.type === 'user') {
      normalized.role = 'user'
      const content = msg.message?.content
      // Handle different content types
      if (typeof content === 'string') {
        normalized.content = content
      } else if (Array.isArray(content)) {
        // Content might be an array of content blocks
        const textParts = content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text)
        normalized.content = textParts.join('\n') || ''
      } else {
        // Object or other type - mark as invalid
        normalized.content = ''
      }
    } else if (msg.type === 'assistant') {
      normalized.role = 'assistant'
      normalized.model = msg.message?.model
      normalized.usage = msg.message?.usage

      // Extract text content from content array
      const contents = msg.message?.content || []
      normalized.contents = contents.map(c => ({
        type: c.type,
        text: c.text || c.thinking || ''
      }))

      // Main text content
      const textContent = contents.find(c => c.type === 'text')
      normalized.content = textContent?.text || ''
    }

    return normalized
  }

  /**
   * Search sessions for a query string
   */
  async searchSessions(query, projectPath = null) {
    const results = []
    const searchLower = query.toLowerCase()

    try {
      const projects = projectPath
        ? [{ encodedPath: encodePath(projectPath), path: projectPath }]
        : await this.getProjects()

      for (const project of projects) {
        const projectDir = path.join(this.projectsDir, project.encodedPath)

        if (!existsSync(projectDir)) continue

        const files = await fs.readdir(projectDir)
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'))

        for (const file of sessionFiles) {
          const filePath = path.join(projectDir, file)
          const sessionId = file.replace('.jsonl', '')

          const matches = await this.searchInSession(filePath, searchLower)

          if (matches.length > 0) {
            results.push({
              sessionId,
              projectPath: project.path,
              matches
            })
          }
        }
      }
    } catch (err) {
      console.error('Search failed:', err)
    }

    return results
  }

  /**
   * Search within a single session file
   */
  async searchInSession(filePath, searchLower) {
    return new Promise((resolve) => {
      const matches = []

      const stream = createReadStream(filePath, { encoding: 'utf-8' })
      const rl = readline.createInterface({ input: stream })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)

          if (msg.type === 'user' && msg.message?.content) {
            const content = msg.message.content.toLowerCase()
            if (content.includes(searchLower)) {
              matches.push({
                type: 'user',
                uuid: msg.uuid,
                timestamp: msg.timestamp,
                snippet: this.extractSnippet(msg.message.content, searchLower)
              })
            }
          } else if (msg.type === 'assistant' && msg.message?.content) {
            const contents = msg.message.content
            for (const c of contents) {
              if (c.type === 'text' && c.text) {
                const text = c.text.toLowerCase()
                if (text.includes(searchLower)) {
                  matches.push({
                    type: 'assistant',
                    uuid: msg.uuid,
                    timestamp: msg.timestamp,
                    snippet: this.extractSnippet(c.text, searchLower)
                  })
                  break
                }
              }
            }
          }
        } catch {
          // Skip invalid JSON
        }
      })

      rl.on('close', () => {
        resolve(matches)
      })

      rl.on('error', () => {
        resolve(matches)
      })
    })
  }

  /**
   * Extract snippet around search match
   */
  extractSnippet(text, searchLower, contextLength = 50) {
    const lowerText = text.toLowerCase()
    const index = lowerText.indexOf(searchLower)

    if (index === -1) return text.substring(0, 100)

    const start = Math.max(0, index - contextLength)
    const end = Math.min(text.length, index + searchLower.length + contextLength)

    let snippet = text.substring(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'

    return snippet
  }

  /**
   * Export session to specified format
   */
  async exportSession(projectPath, sessionId, format = 'markdown') {
    const messages = await this.getSessionMessages(projectPath, sessionId)

    if (format === 'json') {
      return JSON.stringify(messages, null, 2)
    }

    // Default: markdown
    let markdown = `# Session: ${sessionId}\n\n`
    markdown += `Project: ${projectPath}\n\n---\n\n`

    for (const msg of messages) {
      if (msg.isMeta) continue

      const time = new Date(msg.timestamp).toLocaleString()

      if (msg.role === 'user') {
        markdown += `## User (${time})\n\n${msg.content}\n\n`
      } else if (msg.role === 'assistant') {
        markdown += `## Assistant (${time})\n\n`
        if (msg.model) markdown += `*Model: ${msg.model}*\n\n`
        markdown += `${msg.content}\n\n`
        if (msg.usage) {
          markdown += `*Tokens: ${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out*\n\n`
        }
      }

      markdown += '---\n\n'
    }

    return markdown
  }

  /**
   * Get global input history
   */
  async getGlobalHistory(limit = 100) {
    try {
      if (!existsSync(this.historyFile)) {
        return []
      }

      const history = []

      return new Promise((resolve) => {
        const stream = createReadStream(this.historyFile, { encoding: 'utf-8' })
        const rl = readline.createInterface({ input: stream })

        rl.on('line', (line) => {
          try {
            const entry = JSON.parse(line)
            history.push({
              display: entry.display,
              timestamp: new Date(entry.timestamp),
              project: entry.project
            })
          } catch {
            // Skip invalid lines
          }
        })

        rl.on('close', () => {
          // Sort by timestamp (newest first) and limit
          history.sort((a, b) => b.timestamp - a.timestamp)
          resolve(history.slice(0, limit))
        })

        rl.on('error', () => {
          resolve([])
        })
      })
    } catch (err) {
      console.error('Failed to get global history:', err)
      return []
    }
  }
}

module.exports = { SessionHistoryService }
