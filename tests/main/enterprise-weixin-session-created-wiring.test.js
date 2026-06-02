import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bridgePath = path.resolve(__dirname, '../../src/main/managers/enterprise-weixin-bridge.js')
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')

describe('enterprise weixin session-created wiring', () => {
  it('notifies renderer when processing an inbound enterprise weixin session', () => {
    const source = fs.readFileSync(bridgePath, 'utf-8')

    expect(source).toContain('this._notifier.notifySessionCreated({')
    expect(source).toContain('sessionId,')
    expect(source).toContain('nickname: senderNick,')
  })

  it('routes enterprise weixin session-created through host-aware restore handling', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain('const createHandlerName = `on${meta.listenerPrefix}SessionCreated`')
    expect(source).toContain('const openImRestoredSession = async (imType, data, meta) => {')
    expect(source).toContain('const hostKind = getSessionHostKind(resolvedSession)')
    expect(source).toContain('await openImRestoredSession(imType, data, meta)')
  })
})
