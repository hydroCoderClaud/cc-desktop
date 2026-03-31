/**
 * 提示词处理公共工具
 */
const { httpGet, httpGetWithMirror, classifyHttpError, isSafeFilename, isValidMarketId } = require('./http-client')

/**
 * 从远程市场下载提示词正文内容
 * @param {string} registryUrl - 市场基础 URL
 * @param {Object} prompt - 清单中的提示词对象 (含 id, version, file 等)
 * @param {string} [mirrorUrl] - 镜像 URL
 * @returns {Promise<{success: boolean, params?: Object, error?: string}>}
 */
async function fetchMarketPromptContent(registryUrl, prompt, mirrorUrl) {
  if (!registryUrl || !prompt || !prompt.id) {
    return { success: false, error: '参数不完整' }
  }

  if (!isValidMarketId(prompt.id)) {
    return { success: false, error: `非法的 Prompt ID: "${prompt.id}"` }
  }

  const baseUrl = registryUrl.replace(/\/+$/, '')
  // 兼容逻辑：优先使用对象定义的 file，否则默认为 {id}.md
  const fileName = prompt.file || (Array.isArray(prompt.files) ? prompt.files[0] : null) || `${prompt.id}.md`

  if (!isSafeFilename(fileName)) {
    return { success: false, error: `非法的文件名: "${fileName}"` }
  }
  
  const fileUrl = `${baseUrl}/prompts/${fileName}`

  try {
    console.log(`[PromptUtils] Downloading from: ${fileUrl}`)
    const content = mirrorUrl
      ? await httpGetWithMirror(fileUrl, baseUrl, mirrorUrl)
      : await httpGet(fileUrl)

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Prompt 文件内容为空' }
    }

    return {
      success: true,
      params: {
        marketId: prompt.id,
        registryUrl: baseUrl,
        version: prompt.version || '0.0.0',
        name: prompt.name || prompt.id,
        content: content.trim()
      }
    }
  } catch (err) {
    return { success: false, error: classifyHttpError(err) }
  }
}

module.exports = { fetchMarketPromptContent }
