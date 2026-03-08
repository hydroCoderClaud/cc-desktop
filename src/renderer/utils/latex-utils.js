/**
 * LaTeX 公式渲染工具
 * 使用 KaTeX 将 $...$ 和 $$...$$ 渲染为 HTML
 */
import katex from 'katex'

/**
 * 尝试用 KaTeX 渲染 LaTeX 字符串，失败则返回原文
 */
function tryRender(latex, displayMode) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      output: 'html'
    })
  } catch {
    return null
  }
}

/**
 * 处理文本中的 LaTeX 公式
 * 将 $$...$$ 和 $...$ 替换为 KaTeX 渲染的 HTML
 *
 * @param {string} text - 输入文本（代码块/行内代码已被占位符替换）
 * @returns {{ text: string, blocks: string[] }} 处理后的文本和占位符数组
 */
export function extractLatex(text) {
  const blocks = []

  // 块级公式 $$...$$（可跨行）
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, latex) => {
    const html = tryRender(latex.trim(), true)
    if (html) {
      blocks.push(html)
      return `\x00LT${blocks.length - 1}\x00`
    }
    return match
  })

  // 行内公式 $...$（单行，内容需含 LaTeX 特征字符以避免误匹配货币金额）
  text = text.replace(/\$([^\n$]+?)\$/g, (match, latex) => {
    // 跳过纯数字/货币（如 $100, $3.50）
    if (/^\d[\d,.]*$/.test(latex.trim())) return match
    const html = tryRender(latex.trim(), false)
    if (html) {
      blocks.push(html)
      return `\x00LT${blocks.length - 1}\x00`
    }
    return match
  })

  return { text, blocks }
}

/**
 * 还原 LaTeX 占位符为渲染后的 HTML
 */
export function restoreLatex(text, blocks) {
  return text.replace(/\x00LT(\d+)\x00/g, (_, i) => blocks[i])
}
