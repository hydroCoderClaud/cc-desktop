/**
 * 转义序列解析工具
 * 将字符串中的转义序列转换为实际字符
 */

/**
 * 解析转义序列
 * @param {string} str - 包含转义序列的字符串
 * @returns {string} - 解析后的字符串
 *
 * 支持的转义序列:
 * - \xNN  十六进制字符 (如 \x0c = Ctrl+L)
 * - \r    回车
 * - \n    换行
 * - \t    Tab
 * - \\    反斜杠
 */
export function parseEscapeSequences(str) {
  return str
    // \xNN 十六进制
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // 常用转义
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    // \\ -> \
    .replace(/\\\\/g, '\\')
}

/**
 * 组合式函数形式
 */
export function useEscapeParser() {
  return {
    parseEscapeSequences
  }
}
