/**
 * Session Utilities
 * 会话相关的工具函数和常量
 */

/**
 * 会话状态枚举
 */
export const SessionStatus = {
  STARTING: 'starting',
  RUNNING: 'running',
  EXITED: 'exited',
  ERROR: 'error'
}


/**
 * 交换数组中两个元素的位置
 * @param {Array} arr - 数组
 * @param {number} i - 第一个索引
 * @param {number} j - 第二个索引
 */
export function swapArrayItems(arr, i, j) {
  if (i >= 0 && i < arr.length && j >= 0 && j < arr.length) {
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
}
