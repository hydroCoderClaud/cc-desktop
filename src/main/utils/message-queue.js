/**
 * MessageQueue - 推送式 AsyncIterable
 *
 * 桥接 IPC 推送模式和 SDK 的 AsyncIterable<SDKUserMessage> 拉取模式。
 * SDK 的 query({ prompt: AsyncIterable }) 通过 for-await 消费消息，
 * 而我们的 IPC 是事件驱动的 push 模式。
 *
 * 用法：
 *   const queue = new MessageQueue()
 *   // SDK 侧：for await (const msg of queue) { ... }
 *   // IPC 侧：queue.push(sdkUserMessage)
 *   // 结束：queue.end()
 */
class MessageQueue {
  constructor() {
    this._queue = []
    this._resolve = null
    this._done = false
  }

  /**
   * 推送一条消息。如果 SDK 正在等待（for-await 阻塞中），立即唤醒；
   * 否则缓存到内部队列。
   */
  push(message) {
    if (this._done) return
    if (this._resolve) {
      const resolve = this._resolve
      this._resolve = null
      resolve({ value: message, done: false })
    } else {
      this._queue.push(message)
    }
  }

  /**
   * 结束队列。SDK 的 for-await 循环将正常退出。
   */
  end() {
    this._done = true
    if (this._resolve) {
      this._resolve({ value: undefined, done: true })
      this._resolve = null
    }
  }

  /**
   * 队列是否已结束
   */
  get isDone() {
    return this._done
  }

  [Symbol.asyncIterator]() {
    return this
  }

  next() {
    if (this._queue.length > 0) {
      return Promise.resolve({ value: this._queue.shift(), done: false })
    }
    if (this._done) {
      return Promise.resolve({ value: undefined, done: true })
    }
    return new Promise(resolve => {
      this._resolve = resolve
    })
  }
}

module.exports = { MessageQueue }
