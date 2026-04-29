import { describe, it, expect } from 'vitest'

const utils = await import('../../src/renderer/pages/settings-workbench/components/weixin-notify-utils.js')
const { hasSendableCapturedTarget, collectSendableTargetIds, hasNewSendableTarget } = utils.default || utils

describe('weixin-notify-utils', () => {
  it('only succeeds when the current poll captured a sendable target for the account', () => {
    expect(hasSendableCapturedTarget([], 'acc-1')).toBe(false)
    expect(hasSendableCapturedTarget([
      { accountId: 'acc-1', hasContextToken: false }
    ], 'acc-1')).toBe(false)
    expect(hasSendableCapturedTarget([
      { accountId: 'acc-2', hasContextToken: true }
    ], 'acc-1')).toBe(false)
    expect(hasSendableCapturedTarget([
      { accountId: 'acc-1', hasContextToken: true }
    ], 'acc-1')).toBe(true)
  })

  it('detects newly available sendable targets against the baseline snapshot', () => {
    const baseline = collectSendableTargetIds([
      { id: 'acc-1:old-a', accountId: 'acc-1', hasContextToken: true },
      { id: 'acc-1:old-b', accountId: 'acc-1', hasContextToken: true },
      { id: 'acc-2:other', accountId: 'acc-2', hasContextToken: true }
    ], 'acc-1')

    expect(hasNewSendableTarget([
      { id: 'acc-1:old-a', accountId: 'acc-1', hasContextToken: true },
      { id: 'acc-1:old-b', accountId: 'acc-1', hasContextToken: true }
    ], 'acc-1', baseline)).toBe(false)

    expect(hasNewSendableTarget([
      { id: 'acc-1:old-a', accountId: 'acc-1', hasContextToken: true },
      { id: 'acc-1:new-c', accountId: 'acc-1', hasContextToken: true }
    ], 'acc-1', baseline)).toBe(true)
  })
})
