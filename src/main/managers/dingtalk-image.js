/**
 * DingTalk Image Pipeline
 * 钉钉图片处理：下载、上传、转发（从 dingtalk-bridge.js 提取，通过 mixin 混入）
 *
 * 所有方法的 this 指向 DingTalkBridge 实例
 */

const fs = require('fs')
const path = require('path')

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp)$/i
const IMAGE_MAX_SIZE = 20 * 1024 * 1024 // 20MB
const IMAGE_PATH_MAX_DEPTH = 10 // 递归提取最大深度

module.exports = {
  /**
   * 递归提取 tool_use input 中的图片文件绝对路径
   */
  _extractImagePaths(obj, depth = 0) {
    if (depth > IMAGE_PATH_MAX_DEPTH) return []
    const paths = []
    if (typeof obj === 'string') {
      if (IMAGE_EXTENSIONS.test(obj) && (obj.startsWith('/') || /^[A-Z]:[/\\]/.test(obj))) {
        paths.push(this._normalizePath(obj))
      }
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        paths.push(...this._extractImagePaths(val, depth + 1))
      }
    }
    return paths
  },

  /**
   * 归一化路径：将 MSYS 风格 /c/... 转为 Windows 风格 C:/...
   */
  _normalizePath(p) {
    // MSYS: /c/workspace/... → C:/workspace/...
    const msysMatch = p.match(/^\/([a-zA-Z])\/(.*)$/)
    if (msysMatch) {
      return `${msysMatch[1].toUpperCase()}:/${msysMatch[2]}`
    }
    return p
  },

  /**
   * 遍历收集到的图片路径，逐个上传并通过接口方式发送到钉钉
   */
  async _sendCollectedImages(imagePaths, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    for (const filePath of imagePaths) {
      try {
        const stats = await fs.promises.stat(filePath).catch(() => null)
        if (!stats || stats.size > IMAGE_MAX_SIZE || stats.size === 0) continue

        const mediaId = await this._uploadImage(filePath, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token })
        console.log(`[DingTalk] Image forwarded: ${filePath}`)
      } catch (err) {
        console.error(`[DingTalk] Failed to forward image ${filePath}:`, err.message)
      }
    }
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
  }
}
