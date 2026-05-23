/**
 * IM 回复收集 helper
 *
 * 管理 Agent 流式回复的收集、实时推送、图片延迟发送和桌面端介入同步。
 * 各 IM bridge 可以使用此模块来统一处理 agentMessage/agentResult/agentError 事件。
 *
 * 使用方式：
 *   const collector = new ImReplyCollector({ maxTextLength: 6000 })
 *   // 收到用户消息时：
 *   const { donePromise, sendChunk } = collector.startCollect(sessionId, { webhook, sendFn })
 *   // Agent 回复时：
 *   collector.onAgentMessage(sessionId, message)
 *   collector.onAgentResult(sessionId)
 *   collector.onAgentError(sessionId, error)
 */

const DEFAULT_MAX_TEXT_LENGTH = 6000

class ImReplyCollector {
  constructor(opts = {}) {
    this._maxTextLength = opts.maxTextLength || DEFAULT_MAX_TEXT_LENGTH
    /** @type {Map<string, { chunks: string[], imagePaths: string[], webhook: string, sendFn: Function, resolve: Function, reject: Function, sentText: string }>} */
    this._collectors = new Map()
    /** @type {Map<string, { userContent: string, userImages: Array, chunks: string[], sendFn: Function }>} */
    this._desktopPending = new Map()
  }

  // ─── 回复收集 ───

  /**
   * 开始收集一个会话的 Agent 回复
   * @param {string} sessionId
   * @param {{ webhook?: string, sendFn: Function, timeout?: number }} opts
   * @returns {{ donePromise: Promise<void>, sendChunk: (text: string) => Promise<void> }}
   */
  startCollect(sessionId, opts = {}) {
    const { webhook, sendFn, timeout = 30 * 60 * 1000 } = opts

    let resolve, reject
    const donePromise = new Promise((res, rej) => { resolve = res; reject = rej })

    const timer = setTimeout(() => {
      this._collectors.delete(sessionId)
      reject(new Error('IM reply timeout'))
    }, timeout)

    this._collectors.set(sessionId, {
      chunks: [],
      imagePaths: [],
      webhook,
      sendFn,
      resolve: (result) => { clearTimeout(timer); resolve(result) },
      reject: (err) => { clearTimeout(timer); reject(err) },
      sentText: '',
    })

    const sendChunk = async (text) => {
      const collector = this._collectors.get(sessionId)
      if (!collector) return
      if (sendFn) {
        await sendFn(text)
      }
      collector.sentText = (collector.sentText || '') + text
    }

    return { donePromise, sendChunk }
  }

  /** 获取收集器状态 */
  getCollector(sessionId) {
    return this._collectors.get(sessionId) || null
  }

  /** 是否存在活跃的收集器 */
  hasCollector(sessionId) {
    return this._collectors.has(sessionId)
  }

  // ─── Agent 事件处理 ───

  /**
   * 处理 agentMessage 事件（流式文本块）
   * @param {string} sessionId
   * @param {object} message - Agent 消息对象
   * @param {Function} [onSendChunk] - 每段文本回调，接收 (text: string)
   */
  onAgentMessage(sessionId, message, onSendChunk) {
    const collector = this._collectors.get(sessionId)
    const desktop = this._desktopPending.get(sessionId)

    if (collector && onSendChunk) {
      // IM 发起的消息 → 实时推文本
      if (message.type === 'assistant' && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            this._appendChunk(sessionId, collector, block.text, onSendChunk)
          }
        }
      }
    } else if (desktop) {
      // 桌面端介入 → 累积文本块
      this._accumulateDesktopChunks(sessionId, message)
    }
  }

  /** @private */
  _appendChunk(sessionId, collector, text, onSendChunk) {
    collector.chunks.push(text)
    let toSend = text
    if (collector.sentText.length + toSend.length > this._maxTextLength) {
      toSend = toSend.substring(0, this._maxTextLength - collector.sentText.length)
    }
    if (toSend) {
      onSendChunk(toSend)
    }
  }

  /** @private */
  _accumulateDesktopChunks(sessionId, message) {
    const desktop = this._desktopPending.get(sessionId)
    if (!desktop) return
    if (message.type === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text' && block.text) {
          desktop.chunks.push(block.text)
        }
      }
    }
  }

  /**
   * 处理 agentResult 事件
   * @param {string} sessionId
   * @param {Function} [onFlushDesktop] - 桌面端介入的最终发送回调 (sessionId, {userContent, userImages, fullText}) => Promise<void>
   * @returns {Promise<void>}
   */
  async onAgentResult(sessionId, onFlushDesktop) {
    const collector = this._collectors.get(sessionId)
    if (collector) {
      // IM 发起的消息：兜底发送未推送的文本
      if (collector.sendFn) {
        const unsentText = collector.chunks.join('')
        if (unsentText.length > collector.sentText.length) {
          const remaining = unsentText.substring(collector.sentText.length)
          const toSend = remaining.length > this._maxTextLength
            ? remaining.substring(0, this._maxTextLength) + '\n\n...（内容过长，已截断）'
            : remaining
          await collector.sendFn(toSend)
        }
      }
      const imagePaths = [...collector.imagePaths]
      collector.resolve({ imagePaths })
      this._collectors.delete(sessionId)
      return { imagePaths }
    }

    // 桌面端介入 → 组装 Q&A 块回推
    const desktop = this._desktopPending.get(sessionId)
    if (desktop && onFlushDesktop) {
      const fullText = desktop.chunks.join('')
      const result = {
        userContent: desktop.userContent,
        userImages: desktop.userImages,
        fullText,
      }
      await onFlushDesktop(sessionId, result)
      this._desktopPending.delete(sessionId)
      return result
    }
    return null
  }

  /**
   * 处理 agentError 事件
   * @param {string} sessionId
   * @param {Error|string} error
   * @param {Function} [onError] - 错误回调 (sessionId, errorMessage) => Promise<void>
   */
  async onAgentError(sessionId, error, onError) {
    const collector = this._collectors.get(sessionId)
    if (collector) {
      const errMsg = error?.message || String(error)
      collector.reject(new Error(errMsg))
      this._collectors.delete(sessionId)
      if (onError) {
        await onError(sessionId, errMsg).catch(() => {})
      }
    }
    this._desktopPending.delete(sessionId)
  }

  // ─── 桌面端介入 ───

  /**
   * 记录桌面端介入（用户从 CC Desktop UI 向 IM 会话发消息）
   * @param {string} sessionId
   * @param {{ content: string, images?: Array }} userMsg
   * @param {Function} sendFn - 最终发送函数
   */
  recordDesktopIntervention(sessionId, userMsg, sendFn) {
    this._desktopPending.set(sessionId, {
      userContent: userMsg.content || '',
      userImages: userMsg.images || [],
      chunks: [],
      sendFn,
    })
  }

  // ─── 图片收集 ───

  /** 添加图片路径到收集器 */
  addImagePath(sessionId, imagePath) {
    const collector = this._collectors.get(sessionId)
    if (collector && imagePath) {
      collector.imagePaths.push(imagePath)
    }
  }

  getImagePaths(sessionId) {
    return this._collectors.get(sessionId)?.imagePaths || []
  }

  // ─── 清理 ───

  /** 清理指定会话的所有状态 */
  clear(sessionId) {
    const collector = this._collectors.get(sessionId)
    if (collector) {
      collector.reject(new Error('Session cleared'))
    }
    this._collectors.delete(sessionId)
    this._desktopPending.delete(sessionId)
  }

  /** 清理所有状态 */
  clearAll() {
    for (const [sessionId, collector] of this._collectors) {
      collector.reject(new Error('All collectors cleared'))
    }
    this._collectors.clear()
    this._desktopPending.clear()
  }
}

module.exports = { ImReplyCollector }
