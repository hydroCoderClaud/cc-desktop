/**
 * Agent 队列功能 E2E 测试
 * 测试消息队列的完整功能
 */
const { test, expect } = require('@playwright/test')
const { launchElectronApp, closeElectronApp } = require('./helpers/electron')

let app, window

test.beforeEach(async () => {
  const result = await launchElectronApp()
  app = result.app
  window = result.window

  // 等待应用加载完成
  await window.waitForTimeout(2000)
})

test.afterEach(async () => {
  await closeElectronApp(app)
})

test.describe('队列基础功能', () => {
  test('应该能添加消息到队列', async () => {
    // 1. 切换到 Agent 模式（点击模式切换图标按钮）
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)

    // 2. 创建新对话
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)

    // 3. 填写对话信息并创建
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 4. 发送第一条消息（会开始输出）
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('测试消息1')
    await input.press('Enter')
    await window.waitForTimeout(1000)

    // 5. 在 AI 输出时发送第二条消息（应该加入队列）
    await input.fill('测试消息2')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 6. 验证队列徽章出现
    const queueBadge = await window.locator('.queue-badge')
    await expect(queueBadge).toBeVisible()
    const badgeText = await queueBadge.textContent()
    expect(badgeText).toBe('1')
  })

  test('应该能自动消费队列', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 发送消息并添加到队列
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('快速问题')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('队列消息1')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 3. 等待第一条消息完成，队列应该自动消费
    await window.waitForTimeout(10000)

    // 4. 验证队列徽章消失（队列已被消费）
    const queueBadge = await window.locator('.queue-badge')
    await expect(queueBadge).not.toBeVisible()
  })
})

test.describe('中断功能', () => {
  test('点击停止应该显示"输出已中断"', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 发送消息
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('写一篇长文章')
    await input.press('Enter')
    await window.waitForTimeout(2000)

    // 3. 点击停止按钮
    const stopButton = await window.locator('button.stop-btn')
    await stopButton.click()
    await window.waitForTimeout(1000)

    // 4. 验证显示"输出已中断"
    const errorMessage = await window.locator('text=输出已中断')
    await expect(errorMessage).toBeVisible()
  })

  test('中断后队列不应该自动消费', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 发送消息并添加队列
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('长问题')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('队列消息')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 3. 点击停止
    const stopButton = await window.locator('button.stop-btn')
    await stopButton.click()
    await window.waitForTimeout(1000)

    // 4. 验证队列徽章仍然存在（没有自动消费）
    const queueBadge = await window.locator('.queue-badge')
    await expect(queueBadge).toBeVisible()
  })
})

test.describe('队列持久化', () => {
  test('关闭并重新打开会话，队列应该还在', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 添加消息到队列
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('测试1')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('测试2')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 3. 验证队列存在
    let queueBadge = await window.locator('.queue-badge')
    await expect(queueBadge).toBeVisible()

    // 4. 关闭会话 Tab（点击 Tab 的关闭按钮）
    await window.click('.tab-close-btn')
    await window.waitForTimeout(1000)

    // 5. 重新打开会话（点击左侧列表第一个会话）
    await window.click('.conversation-item:first-child')
    await window.waitForTimeout(1000)

    // 6. 验证队列还在
    queueBadge = await window.locator('.queue-badge')
    await expect(queueBadge).toBeVisible()
  })
})

test.describe('UI 交互', () => {
  test('点击队列项编辑时面板不应该关闭', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 添加消息到队列
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('测试消息')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('编辑测试')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 3. 点击队列徽章打开面板
    await window.click('.queue-badge')
    await window.waitForTimeout(300)

    // 4. 点击队列项文本进入编辑模式
    await window.click('.queue-item-text')
    await window.waitForTimeout(500)

    // 5. 验证队列面板仍然可见
    const queuePanel = await window.locator('.queue-panel')
    await expect(queuePanel).toBeVisible()
  })

  test('点击删除按钮时面板不应该关闭', async () => {
    // 1. 切换到 Agent 模式并创建对话
    await window.click('.mode-toggle-btn')
    await window.waitForTimeout(1000)
    await window.click('button:has-text("新建对话")')
    await window.waitForTimeout(500)
    await window.click('button:has-text("创建")')
    await window.waitForTimeout(1000)

    // 2. 添加多条消息到队列
    const input = await window.locator('textarea[placeholder*="请输入"]')
    await input.fill('测试1')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('测试2')
    await input.press('Enter')
    await window.waitForTimeout(500)

    await input.fill('测试3')
    await input.press('Enter')
    await window.waitForTimeout(500)

    // 3. 点击队列徽章打开面板
    await window.click('.queue-badge')
    await window.waitForTimeout(300)

    // 4. 点击删除按钮
    await window.click('.queue-item-del')
    await window.waitForTimeout(500)

    // 5. 验证队列面板仍然可见
    const queuePanel = await window.locator('.queue-panel')
    await expect(queuePanel).toBeVisible()
  })
})
