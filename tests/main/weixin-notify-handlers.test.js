import { describe, expect, it, vi } from 'vitest'

const { setupWeixinNotifyHandlers } = await import('../../src/main/ipc-handlers/weixin-notify-handlers.js')

describe('setupWeixinNotifyHandlers', () => {
  function createIpcMain() {
    const handlers = new Map()
    return {
      handlers,
      handle: vi.fn((channel, handler) => {
        handlers.set(channel, handler)
      })
    }
  }

  it('allows calls from the main window webContents', async () => {
    const ipcMain = createIpcMain()
    const trustedSender = {}
    const service = {
      listTargets: vi.fn(() => [{ id: 'target-1' }])
    }

    setupWeixinNotifyHandlers(ipcMain, service, null, {
      webContents: trustedSender
    })

    const result = await ipcMain.handlers.get('weixin-notify:listTargets')({
      sender: trustedSender
    })

    expect(result).toEqual([{ id: 'target-1' }])
    expect(service.listTargets).toHaveBeenCalledTimes(1)
  })

  it('rejects calls from other renderer senders', async () => {
    const ipcMain = createIpcMain()
    const service = {
      listTargets: vi.fn(() => [{ id: 'target-1' }])
    }

    setupWeixinNotifyHandlers(ipcMain, service, null, {
      webContents: {}
    })

    const result = await ipcMain.handlers.get('weixin-notify:listTargets')({
      sender: {}
    })

    expect(result).toEqual({ error: '未授权的微信通知 IPC 调用' })
    expect(service.listTargets).not.toHaveBeenCalled()
  })
})
