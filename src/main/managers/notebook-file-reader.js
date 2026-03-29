/**
 * NotebookManager — File content reader
 * 各格式文件预览解析（image/audio/video/pdf/html/word/excel/pptx/text）
 */

const fs = require('fs')
const path = require('path')
const iconv = require('iconv-lite')

/**
 * 检测文本是否包含常见乱码字符
 */
function containsMojibake(text) {
  // 常见 GBK 被误读为 UTF-8 的乱码模式
  const mojibakePatterns = [
    /[\uFFFD]/,  // 替换字符
    /[锟斤拷]/,   // 经典 UTF-8 误读
    /[澶氱牬]/,  // 常见中文乱码开头
  ]
  return mojibakePatterns.some(p => p.test(text))
}

/**
 * 读取文件内容，根据扩展名返回对应的预览数据
 * @param {string} fullPath 绝对路径
 * @returns {Promise<{ type: string, content: string, meta?: object }>}
 */
async function readFileContent(fullPath) {
  if (!fs.existsSync(fullPath)) throw new Error(`文件不存在：${fullPath}`)

  const ext = path.extname(fullPath).toLowerCase().slice(1)
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)
  const isVideo = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'].includes(ext)

  if (isImage || isAudio || isVideo) {
    const buffer = fs.readFileSync(fullPath)
    let mimeType
    if (isImage) {
      mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    } else if (isAudio) {
      mimeType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`
    } else {
      mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`
    }
    return {
      type: isImage ? 'image' : (isAudio ? 'audio' : 'video'),
      content: `data:${mimeType};base64,${buffer.toString('base64')}`
    }
  }

  if (ext === 'pdf' || ext === 'html') {
    return { type: ext === 'pdf' ? 'pdf' : 'html', content: fullPath }
  }

  // Word 预览 (docx -> html)
  if (ext === 'docx') {
    try {
      const mammoth = require('mammoth')
      // 启用 sanitize 过滤危险的 HTML 标签和属性，防止 XSS
      const result = await mammoth.convertToHtml({ path: fullPath }, { sanitizeXml: true })
      return { type: 'word', content: result.value }
    } catch (err) {
      console.error('[NotebookManager] Word parse error:', err)
      throw new Error(`Word 文件解析失败：${err.message}`)
    }
  }

  // Excel 预览 (xlsx/xls/csv -> json per sheet)
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    try {
      const XLSX = require('xlsx')
      const workbook = XLSX.readFile(fullPath)
      const sheetsData = {}

      for (const sheetName of workbook.SheetNames) {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
        _convertExcelDates(data)
        sheetsData[sheetName] = data
      }

      return {
        type: 'excel',
        content: JSON.stringify(sheetsData),
        meta: { sheetNames: workbook.SheetNames }
      }
    } catch (err) {
      console.error('[NotebookManager] Excel parse error:', err)
      throw new Error(`Excel 文件解析失败：${err.message}`)
    }
  }

  // PPT 暂不支持深度解析，返回路径占位
  if (['pptx', 'ppt'].includes(ext)) {
    return { type: 'pptx', content: fullPath }
  }

  // 默认作为文本读取
  try {
    // 先尝试 UTF-8 读取
    const content = fs.readFileSync(fullPath, 'utf-8')

    // 检测是否包含乱码
    if (containsMojibake(content)) {
      // 如果是乱码，尝试用 GBK 重新读取
      const buffer = fs.readFileSync(fullPath)
      const gbkContent = iconv.decode(buffer, 'gbk')
      return { type: 'text', content: gbkContent }
    }

    return { type: 'text', content }
  } catch {
    return { type: 'binary', content: fullPath }
  }
}

/**
 * 将 Excel 数字序列化日期列转为可读字符串（原地修改）
 * 识别列名含 date/time/timestamp/at/时间/日期 的列
 */
function _convertExcelDates(data) {
  if (data.length < 2) return
  const headers = data[0]
  const dateCols = []
  headers.forEach((h, i) => {
    if (h && /date|time|timestamp|at$|时间|日期/i.test(h.toString().trim())) dateCols.push(i)
  })
  if (dateCols.length === 0) return

  for (let r = 1; r < data.length; r++) {
    dateCols.forEach(cIdx => {
      const val = data[r][cIdx]
      if (val === undefined || val === null) return
      const numVal = typeof val === 'number' ? val : parseFloat(val)
      // Excel 日期序列号范围：25569（1970-01-01）~ 60000（~2064 年）
      if (!isNaN(numVal) && numVal > 25569 && numVal < 60000) {
        try {
          const d = new Date(Math.round((numVal - 25569) * 86400 * 1000))
          const pad = n => String(n).padStart(2, '0')
          data[r][cIdx] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
        } catch { /* 保留原值 */ }
      }
    })
  }
}

module.exports = { readFileContent }
