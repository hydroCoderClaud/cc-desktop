/**
 * 飞书消息 API 封装
 *
 * 通过 @larksuiteoapi/node-sdk Client 向飞书发送/获取消息。
 * SDK Client 自动管理 access token 的获取、缓存和刷新。
 *
 * API 参考：https://open.feishu.cn/document/server-docs/im-v1/message/create
 */

const { Client } = require('@larksuiteoapi/node-sdk')
const fs = require('fs')

const MAX_TEXT_LENGTH = 6000

class FeishuMessageAPI {
  constructor(opts = {}) {
    this._maxTextLength = opts.maxTextLength || MAX_TEXT_LENGTH
    this._client = null
  }

  // ─── 配置 ───

  setCredentials(appId, appSecret) {
    this._appId = appId || null
    this._appSecret = appSecret || null
    if (!appId || !appSecret) {
      this._client = null
      return
    }
    this._client = new Client({ appId, appSecret })
  }

  // ─── 消息发送 ───

  /**
   * 发送文本消息
   * @param {'open_id'|'user_id'|'chat_id'} receiveIdType
   * @param {string} receiveId
   * @param {string} content
   * @returns {Promise<string|null>} message_id
   */
  async sendTextMessage(receiveIdType, receiveId, content) {
    this._assertReady()
    const text = typeof content === 'string' ? content : String(content)
    const r = await this._client.im.v1.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text: this._truncate(text) }),
      },
    })
    return r?.data?.message_id || null
  }

  /**
   * 获取指定消息
   * @param {string} messageId
   * @returns {Promise<object|null>}
   */
  async getMessage(messageId) {
    this._assertReady()
    const r = await this._client.im.v1.message.get({
      path: { message_id: messageId },
    })
    const item = r?.data?.items?.[0] || r?.data?.item || null
    if (!item) return null
    return {
      ...item,
      content: item?.content ?? item?.body?.content ?? null,
      mentions: Array.isArray(item?.mentions) ? item.mentions : [],
      msg_type: item?.msg_type || item?.message_type || null,
    }
  }

  /**
   * 批量获取用户信息
   * @param {string} userId - open_id
   * @returns {Promise<object|null>}
   */
  async getUserInfo(userId) {
    this._assertReady()
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''
    if (!normalizedUserId) return null

    const r = await this._client.contact.v3.user.basicBatch({
      params: { user_id_type: 'open_id' },
      data: { user_ids: [normalizedUserId] },
    })
    const user = Array.isArray(r?.data?.users) ? r.data.users[0] : null
    if (user) {
      return {
        ...user,
        open_id: user.open_id || normalizedUserId,
      }
    }

    const detail = await this._client.contact.v3.user.get({
      path: { user_id: normalizedUserId },
      params: { user_id_type: 'open_id' },
    })
    return detail?.data?.user || detail?.data || null
  }

  /**
   * 通过部门树遍历列出可发送的组织成员
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async listUsers(options = {}) {
    this._assertReady()
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : 200
    const pageSize = Math.min(Math.max(Number(options.pageSize) || 50, 1), 100)
    const rootDepartmentId = typeof options.departmentId === 'string' && options.departmentId.trim()
      ? options.departmentId.trim()
      : '0'
    const departmentIdType = typeof options.departmentIdType === 'string' && options.departmentIdType.trim()
      ? options.departmentIdType.trim()
      : 'open_department_id'

    const users = []
    const seenOpenIds = new Set()
    const visitedDepartments = new Set()
    const queuedDepartments = new Set([rootDepartmentId])
    const departmentQueue = [rootDepartmentId]

    const normalizeUser = (item) => {
      const openId = item?.open_id || item?.openId || item?.id || ''
      if (!openId) return null
      return {
        openId,
        userId: item?.user_id || item?.userId || null,
        name: item?.name || item?.display_name || item?.nickname || item?.user_name || item?.real_name || item?.en_name || '',
        displayName: item?.name || item?.display_name || item?.nickname || item?.user_name || item?.real_name || item?.en_name || openId,
        email: item?.email || null,
        departmentIds: Array.isArray(item?.department_ids) ? item.department_ids : (typeof item?.department_id === 'string' ? [item.department_id] : []),
        jobTitle: item?.job_title || item?.jobTitle || '',
        avatarUrl: item?.avatar?.avatar_72 || item?.avatar?.avatar_240 || item?.avatar_url || null,
      }
    }

    const enqueueDepartment = (item) => {
      const childDepartmentId = item?.open_department_id || item?.openDepartmentId || item?.department_id || item?.departmentId || item?.id || ''
      if (!childDepartmentId || visitedDepartments.has(childDepartmentId) || queuedDepartments.has(childDepartmentId)) return
      queuedDepartments.add(childDepartmentId)
      departmentQueue.push(childDepartmentId)
    }

    while (departmentQueue.length > 0 && users.length < limit) {
      const departmentId = departmentQueue.shift()
      if (!departmentId || visitedDepartments.has(departmentId)) continue
      visitedDepartments.add(departmentId)

      let userPageToken = ''
      do {
        const params = {
          department_id_type: departmentIdType,
          user_id_type: 'open_id',
          page_size: Math.min(pageSize, limit - users.length),
        }
        if (userPageToken) params.page_token = userPageToken

        params.department_id = departmentId

        const r = await this._client.contact.v3.user.findByDepartment({ params })
        const batch = Array.isArray(r?.data?.items) ? r.data.items : []
        for (const item of batch) {
          const user = normalizeUser(item)
          if (!user || seenOpenIds.has(user.openId)) continue
          seenOpenIds.add(user.openId)
          users.push(user)
          if (users.length >= limit) break
        }
        userPageToken = r?.data?.page_token || ''
      } while (userPageToken && users.length < limit)

      let childPageToken = ''
      do {
        const params = {
          department_id_type: departmentIdType,
          fetch_child: false,
          page_size: pageSize,
        }
        if (childPageToken) params.page_token = childPageToken

        const r = await this._client.contact.v3.department.children({
          path: { department_id: departmentId },
          params,
        })
        const batch = Array.isArray(r?.data?.items) ? r.data.items : []
        for (const item of batch) {
          enqueueDepartment(item)
        }
        childPageToken = r?.data?.page_token || ''
      } while (childPageToken)
    }

    return users
  }

  /**
   * 获取群聊信息
   * @param {string} chatId
   * @returns {Promise<object|null>}
   */
  async getChatInfo(chatId) {
    this._assertReady()
    const r = await this._client.im.v1.chat.get({
      path: { chat_id: chatId },
    })
    return r?.data?.chat || r?.data || null
  }

  /**
   * 列出 bot 所在的群聊
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async listChats(options = {}) {
    this._assertReady()
    const limit = Number.isFinite(options.limit) ? Math.min(Math.max(1, Math.floor(options.limit)), 200) : 200
    const pageSize = Math.min(Math.max(Number(options.pageSize) || 20, 1), 50)
    const chats = []
    let pageToken = ''
    do {
      const r = await this._client.im.v1.chat.list({
        params: { page_size: pageSize, page_token: pageToken || undefined },
      })
      const batch = Array.isArray(r?.data?.items) ? r.data.items : []
      for (const item of batch) {
        if (!item?.chat_id) continue
        chats.push({
          id: item.chat_id,
          chatId: item.chat_id,
          targetId: item.chat_id,
          targetType: 'chat',
          displayName: item.name || item.chat_id || '',
          name: item.name || '',
          avatarUrl: item.avatar || null,
          memberCount: Number(item.member_count || 0),
        })
        if (chats.length >= limit) break
      }
      pageToken = r?.data?.page_token || ''
    } while (pageToken && chats.length < limit)
    return chats
  }

  /**
   * 上传图片
   * @param {Buffer|string} source - 文件 buffer 或磁盘路径
   * @param {string} [imageType] - message|avatar（默认 message）
   * @returns {Promise<string>} image_key
   */
  async uploadImage(source, imageType = 'message') {
    this._assertReady()
    let buffer
    if (Buffer.isBuffer(source)) {
      buffer = source
    } else {
      buffer = fs.readFileSync(source)
    }
    const r = await this._client.im.v1.image.create({
      data: { image_type: imageType, image: buffer },
    })
    return r?.image_key || r?.data?.image_key || null
  }

  /**
   * 下载消息中的图片资源
   * @param {string} imageKey - file_key
   * @param {string} messageId
   * @returns {Promise<{base64: string, mediaType: string}>}
   */
  async downloadImage(imageKey, messageId) {
    const resource = await this.downloadMessageResource(imageKey, messageId, 'image')
    return {
      base64: resource.buffer.toString('base64'),
      mediaType: resource.mediaType || 'image/jpeg'
    }
  }

  /**
   * 下载消息中的通用资源（文件、图片等）
   * @param {string} fileKey
   * @param {string} messageId
   * @param {string} resourceType
   * @returns {Promise<{buffer: Buffer, mediaType: string, headers: object, fileKey: string, messageId: string, resourceType: string}>}
   */
  async downloadMessageResource(fileKey, messageId, resourceType = 'file') {
    this._assertReady()
    const r = await this._client.im.v1.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: resourceType || 'file' },
    })
    const buf = await this._binaryResponseToBuffer(r)
    const headers = r?.headers || {}
    const contentType = headers?.['content-type'] || headers?.['Content-Type'] || 'application/octet-stream'
    const mediaType = String(contentType).split(';')[0].trim() || 'application/octet-stream'
    return {
      buffer: buf,
      mediaType,
      headers,
      fileKey,
      messageId,
      resourceType: resourceType || 'file'
    }
  }

  /**
   * 发送图片消息
   * @param {'open_id'|'chat_id'} receiveIdType
   * @param {string} receiveId
   * @param {string} imageKey
   * @returns {Promise<string|null>} message_id
   */
  async sendImageMessage(receiveIdType, receiveId, imageKey) {
    this._assertReady()
    const r = await this._client.im.v1.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: receiveId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    })
    return r?.data?.message_id || null
  }

  /**
   * 回复消息（在线程中回复）
   * @param {string} msgId
   * @param {string} content
   * @returns {Promise<string|null>} message_id
   */
  async replyTextMessage(msgId, content) {
    this._assertReady()
    const r = await this._client.im.v1.message.reply({
      path: { message_id: msgId },
      data: {
        content: JSON.stringify({ text: this._truncate(content) }),
        msg_type: 'text',
      },
    })
    return r?.data?.message_id || null
  }

  // ─── 辅助 ───

  /** @private */
  _assertReady() {
    if (!this._client) {
      throw new Error('Feishu credentials not configured')
    }
  }

  /** @private */
  _truncate(text) {
    if (!text) return ''
    if (text.length <= this._maxTextLength) return text
    return text.substring(0, this._maxTextLength) + '\n\n...（内容过长，已截断）'
  }

  /** @private */
  async _binaryResponseToBuffer(response) {
    if (!response) return Buffer.alloc(0)
    if (Buffer.isBuffer(response)) return response
    if (response instanceof Uint8Array) return Buffer.from(response)
    if (typeof response.getReadableStream === 'function') {
      return this._readableToBuffer(response.getReadableStream())
    }
    const data = response.data
    if (Buffer.isBuffer(data)) return data
    if (data instanceof Uint8Array) return Buffer.from(data)
    if (data && typeof data.getReadableStream === 'function') {
      return this._readableToBuffer(data.getReadableStream())
    }
    if (data && typeof data !== 'string' && typeof data[Symbol.asyncIterator] === 'function') {
      return this._readableToBuffer(data)
    }
    if (data instanceof ArrayBuffer) return Buffer.from(data)
    return data ? Buffer.from(data) : Buffer.alloc(0)
  }

  /** @private */
  async _readableToBuffer(stream) {
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
}

module.exports = { FeishuMessageAPI }
