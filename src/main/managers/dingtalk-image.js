/**
 * DingTalk Image Pipeline
 * 钉钉图片处理：下载、上传、转发（从 dingtalk-bridge.js 提取，通过 mixin 混入）
 *
 * 所有方法的 this 指向 DingTalkBridge 实例
 */

const fs = require('fs')
const path = require('path')
const { extractImagePaths, normalizePath, IMAGE_EXTENSIONS, IMAGE_MAX_SIZE } = require('./im-utils')
const { DEFAULT_OUTBOUND_FILE_MAX_SIZE } = require('./im-file-attachments')

module.exports = {
  /**
   * 递归提取 tool_use input 中的图片文件绝对路径
   */
  _extractImagePaths(obj, depth = 0) {
    return extractImagePaths(obj, depth)
  },

  /**
   * 归一化路径：将 MSYS 风格 /c/... 转为 Windows 风格 C:/...
   */
  _normalizePath(p) {
    return normalizePath(p)
  },

  /**
   * 遍历收集到的图片路径，逐个上传并通过接口方式发送到钉钉
   */
  async _sendCollectedImages(imagePaths, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    let sentCount = 0
    for (const filePath of imagePaths) {
      try {
        const stats = await fs.promises.stat(filePath).catch(() => null)
        if (!stats || stats.size > IMAGE_MAX_SIZE || stats.size === 0) {
          throw new Error(`Invalid image file: ${filePath}`)
        }

        const mediaId = await this._uploadImage(filePath, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token })
        console.log(`[DingTalk] Image forwarded: ${filePath}`)
        sentCount += 1
      } catch (err) {
        console.error(`[DingTalk] Failed to forward image ${filePath}:`, err.message)
        throw new Error(`钉钉图片发送失败: ${filePath} (${err.message})`)
      }
    }
    return sentCount
  },

  /**
   * 发送 base64 图片列表到钉钉（桌面端介入时用户输入的截图等）
   */
  async _sendBase64Images(images, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    for (const img of images) {
      try {
        const mediaId = await this._uploadImageBase64(img.base64, img.mediaType, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token })
        console.log('[DingTalk] Input image forwarded to DingTalk')
      } catch (err) {
        console.error('[DingTalk] Failed to forward input image:', err.message)
      }
    }
  },

  /**
   * 上传 Buffer 到钉钉 media API，返回 media_id（公共逻辑）
   */
  async _uploadBuffer(buffer, fileName, mediaType, token) {
    const formData = new FormData()
    formData.append('media', new Blob([buffer], { type: mediaType || 'application/octet-stream' }), fileName)

    const response = await globalThis.fetch(
      `https://oapi.dingtalk.com/media/upload?access_token=${token}&type=image`,
      { method: 'POST', body: formData }
    )

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
    const result = await response.json()
    if (result.errcode) throw new Error(`Upload error: ${result.errcode} ${result.errmsg}`)
    return result.media_id
  },

  async _uploadFile(filePath, token) {
    const fileBuffer = await fs.promises.readFile(filePath)
    const fileName = path.basename(filePath) || 'attachment'
    const formData = new FormData()
    formData.append('media', new Blob([fileBuffer], { type: 'application/octet-stream' }), fileName)

    const response = await globalThis.fetch(
      `https://oapi.dingtalk.com/media/upload?access_token=${token}&type=file`,
      { method: 'POST', body: formData }
    )

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
    const result = await response.json()
    if (result.errcode) throw new Error(`Upload error: ${result.errcode} ${result.errmsg}`)
    return result.media_id
  },

  /**
   * 上传本地图片到钉钉 media API，返回 media_id
   */
  async _uploadImage(filePath, token) {
    const fileBuffer = await fs.promises.readFile(filePath)
    return this._uploadBuffer(fileBuffer, path.basename(filePath), null, token)
  },

  /**
   * 上传 base64 图片到钉钉 media API，返回 media_id
   */
  async _uploadImageBase64(base64, mediaType, token) {
    const buffer = Buffer.from(base64, 'base64')
    const ext = (mediaType || 'image/png').split('/')[1] || 'png'
    return this._uploadBuffer(buffer, `image.${ext}`, mediaType || 'image/png', token)
  },

  /**
   * 发送图片消息路由：群聊走 groupMessages/send，单聊走 oToMessages/batchSend
   */
  async _sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token }) {
    if (conversationType === '2' && conversationId) {
      return this._sendImageToGroup(mediaId, { robotCode, openConversationId: conversationId, token })
    }
    // 单聊（conversationType === '1' 或未知）
    const body = {
      robotCode,
      userIds: [senderStaffId],
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId })
    }
    const response = await globalThis.fetch(
      'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token
        },
        body: JSON.stringify(body)
      }
    )

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`Image API failed: ${response.status} ${JSON.stringify(result)}`)
    }
  },

  /**
   * 发送图片消息到群聊
   */
  async _sendImageToGroup(mediaId, { robotCode, openConversationId, token }) {
    const body = {
      robotCode,
      openConversationId,
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId })
    }
    const response = await globalThis.fetch(
      'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token
        },
        body: JSON.stringify(body)
      }
    )

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`Group image API failed: ${response.status} ${JSON.stringify(result)}`)
    }
  },

  async _sendCollectedFiles(filePaths, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    let sentCount = 0
    for (const filePath of filePaths) {
      try {
        const stats = await fs.promises.stat(filePath).catch(() => null)
        if (!stats || !stats.isFile() || stats.size <= 0 || stats.size > DEFAULT_OUTBOUND_FILE_MAX_SIZE) {
          throw new Error(`Invalid file: ${filePath}`)
        }

        const mediaId = await this._uploadFile(filePath, token)
        await this._sendFileViaApi(mediaId, filePath, {
          robotCode,
          senderStaffId,
          conversationId,
          conversationType,
          token,
          sizeBytes: stats.size,
        })
        console.log(`[DingTalk] File forwarded: ${filePath}`)
        sentCount += 1
      } catch (err) {
        console.error(`[DingTalk] Failed to forward file ${filePath}:`, err.message)
        throw new Error(`钉钉文件发送失败: ${filePath} (${err.message})`)
      }
    }
    return sentCount
  },

  async _sendFileViaApi(mediaId, filePath, { robotCode, senderStaffId, conversationId, conversationType, token, sizeBytes = 0 }) {
    const fileName = path.basename(filePath) || 'attachment'
    const fileType = path.extname(fileName).replace('.', '').toLowerCase() || 'file'
    const body = {
      robotCode,
      msgKey: 'sampleFile',
      msgParam: JSON.stringify({
        mediaId,
        fileName,
        fileType,
        fileSize: String(sizeBytes || ''),
      }),
    }

    let endpoint = 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend'
    if (conversationType === '2' && conversationId) {
      endpoint = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
      body.openConversationId = conversationId
    } else {
      body.userIds = [senderStaffId]
    }

    const response = await globalThis.fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token,
        },
        body: JSON.stringify(body),
      }
    )

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(`File API failed: ${response.status} ${JSON.stringify(result)}`)
    }
  },

  /**
   * 通过钉钉 API 下载图片，返回 { base64, mediaType }
   */
  async _downloadImage(downloadCode, robotCode) {
    const token = await this._getAccessToken()

    // 调用钉钉 API 获取图片下载地址
    const response = await globalThis.fetch('https://api.dingtalk.com/v1.0/robot/messageFiles/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token
      },
      body: JSON.stringify({ downloadCode, robotCode })
    })

    if (!response.ok) {
      throw new Error(`Download API failed: ${response.status}`)
    }

    const result = await response.json()
    const imageUrl = result.downloadUrl

    if (!imageUrl) {
      throw new Error('No downloadUrl in response')
    }

    // 下载实际图片
    const imgResponse = await globalThis.fetch(imageUrl)
    if (!imgResponse.ok) {
      throw new Error(`Image fetch failed: ${imgResponse.status}`)
    }

    const buffer = Buffer.from(await imgResponse.arrayBuffer())
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg'
    // 标准化 mediaType
    const mediaType = contentType.split(';')[0].trim()

    console.log(`[DingTalk] Image downloaded: ${buffer.length} bytes, type=${mediaType}`)

    return {
      base64: buffer.toString('base64'),
      mediaType
    }
  },

  async _downloadFile(downloadCode, robotCode, fallbackFilename = 'attachment') {
    const token = await this._getAccessToken()

    const response = await globalThis.fetch('https://api.dingtalk.com/v1.0/robot/messageFiles/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token
      },
      body: JSON.stringify({ downloadCode, robotCode })
    })

    if (!response.ok) {
      throw new Error(`Download API failed: ${response.status}`)
    }

    const result = await response.json()
    const fileUrl = result.downloadUrl

    if (!fileUrl) {
      throw new Error('No downloadUrl in response')
    }

    const fileResponse = await globalThis.fetch(fileUrl)
    if (!fileResponse.ok) {
      throw new Error(`File fetch failed: ${fileResponse.status}`)
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer())
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream'
    const disposition = fileResponse.headers.get('content-disposition') || ''
    const filename = this._resolveDownloadedFileName(disposition, fallbackFilename, fileUrl)

    return {
      buffer,
      filename,
      contentType: contentType.split(';')[0].trim() || 'application/octet-stream',
    }
  },

  _resolveDownloadedFileName(disposition = '', fallbackFilename = 'attachment', url = '') {
    const encodedMatch = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i)
    if (encodedMatch?.[1]) {
      try {
        return path.basename(decodeURIComponent(encodedMatch[1]))
      } catch {}
    }

    const quotedMatch = String(disposition || '').match(/filename="?([^";]+)"?/i)
    if (quotedMatch?.[1]) {
      return path.basename(quotedMatch[1])
    }

    const fallback = typeof fallbackFilename === 'string' && fallbackFilename.trim()
      ? path.basename(fallbackFilename.trim())
      : ''
    if (fallback && fallback !== 'attachment') return fallback

    try {
      const parsed = new URL(url)
      const fromPath = path.basename(parsed.pathname || '')
      if (fromPath) return fromPath
    } catch {}

    return fallback || 'attachment'
  }
}
