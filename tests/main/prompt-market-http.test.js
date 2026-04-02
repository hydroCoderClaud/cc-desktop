import { describe, it, expect, vi, beforeEach } from 'vitest'
import http from 'http'
import fs from 'fs'
import path from 'path'

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      resolveProxy: vi.fn(() => Promise.resolve('DIRECT'))
    }
  }
}))

const { httpGet } = await import('../../src/main/utils/http-client.js')

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(address)
    })
  })
}

describe('prompts:market:update handler uses shared downloader', () => {
  it('update handler should call fetchMarketPromptContent', async () => {
    const promptHandlersPath = path.resolve(
      import.meta.dirname,
      '../../src/main/ipc-handlers/prompt-handlers.js'
    )
    const content = fs.readFileSync(
      promptHandlersPath,
      'utf8'
    )
    expect(content).toContain("ipcMain.handle('prompts:market:update'")
    expect(content).toContain('const dl = await fetchMarketPromptContent(registryUrl, prompt, mirrorUrl)')
    expect(content).not.toContain('_downloadPromptContent(registryUrl, prompt, mirrorUrl)')
  })
})
