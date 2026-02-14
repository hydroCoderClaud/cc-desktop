/**
 * 图片处理工具
 * 用于 Agent 模式的图片识别功能
 */

/**
 * 将 File/Blob 转换为 base64 字符串
 * @param {File|Blob} file - 图片文件
 * @returns {Promise<string>} base64 字符串（不含 data:image/... 前缀）
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // 移除 data:image/xxx;base64, 前缀
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 获取图片的 MIME type
 * @param {File|Blob} file - 图片文件
 * @returns {string} MIME type (如 image/png)
 */
export function getImageMediaType(file) {
  // 优先使用文件的 type 属性
  if (file.type && file.type.startsWith('image/')) {
    return file.type
  }

  // 根据文件扩展名推断（兼容旧浏览器）
  const ext = file.name?.split('.').pop()?.toLowerCase()
  const mimeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  }
  return mimeMap[ext] || 'image/png'
}

/**
 * 计算 base64 字符串的实际字节大小
 * @param {string} base64 - base64 字符串
 * @returns {number} 字节数
 */
export function getBase64Size(base64) {
  // base64 编码：每 4 个字符代表 3 个字节
  // 去除可能的 padding (=)
  const cleanBase64 = base64.replace(/=/g, '')
  return Math.floor(cleanBase64.length * 3 / 4)
}

/**
 * 检查图片大小是否超过限制
 * @param {string} base64 - base64 字符串
 * @param {number} maxSizeMB - 最大大小（MB），默认 5MB
 * @returns {boolean} 是否超过限制
 */
export function isImageTooLarge(base64, maxSizeMB = 5) {
  const sizeBytes = getBase64Size(base64)
  const sizeMB = sizeBytes / (1024 * 1024)
  return sizeMB > maxSizeMB
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小（如 "1.2 MB"）
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 压缩图片到指定大小以下
 * @param {string} base64 - base64 字符串
 * @param {string} mediaType - MIME type
 * @param {number} maxSizeMB - 最大大小（MB）
 * @returns {Promise<string>} 压缩后的 base64
 */
export function compressImage(base64, mediaType, maxSizeMB = 5) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let quality = 0.9
      let canvas = document.createElement('canvas')
      let ctx = canvas.getContext('2d')

      // 尝试不同的压缩质量
      const tryCompress = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)

        const compressed = canvas.toDataURL(mediaType, quality).split(',')[1]

        if (isImageTooLarge(compressed, maxSizeMB) && quality > 0.1) {
          quality -= 0.1
          tryCompress()
        } else {
          resolve(compressed)
        }
      }

      tryCompress()
    }
    img.onerror = reject
    img.src = `data:${mediaType};base64,${base64}`
  })
}

/**
 * 支持的图片格式
 */
export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
]

/**
 * 检查文件是否为支持的图片格式
 * @param {File|Blob} file - 文件
 * @returns {boolean} 是否支持
 */
export function isSupportedImageType(file) {
  const mediaType = getImageMediaType(file)
  return SUPPORTED_IMAGE_TYPES.includes(mediaType)
}
