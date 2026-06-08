import { describe, expect, it } from 'vitest'

const {
  buildImIdentityPayload,
  getPersistedImTargetFromRow,
} = await import('../../src/main/managers/im-binding-policy.js')

describe('IM binding policy', () => {
  it('builds canonical DB identity payloads for p2p and group targets', () => {
    expect(buildImIdentityPayload({
      targetId: 'ou-user',
      targetType: 'user',
      singleChatType: 'p2p',
    })).toEqual({
      userId: 'ou-user',
      chatId: '',
      chatType: 'p2p',
    })

    expect(buildImIdentityPayload({
      targetId: 'oc-group',
      targetType: 'chat',
      singleChatType: 'p2p',
    })).toEqual({
      userId: '',
      chatId: 'oc-group',
      chatType: 'group',
    })
  })

  it('preserves Enterprise Weixin single chatType while keeping canonical keys', () => {
    expect(buildImIdentityPayload({
      targetId: 'wecom-user',
      targetType: 'user',
      singleChatType: 'single',
    })).toEqual({
      userId: 'wecom-user',
      chatId: '',
      chatType: 'single',
    })
  })

  it('reads persisted targets from canonical DB fields only', () => {
    expect(getPersistedImTargetFromRow({
      im_channel: 'feishu',
      im_user_id: 'ou-user',
      im_chat_id: '',
      im_chat_type: 'p2p',
    }, 'feishu')).toEqual({
      targetId: 'ou-user',
      targetType: 'user',
    })

    expect(getPersistedImTargetFromRow({
      im_channel: 'feishu',
      im_user_id: '',
      im_chat_id: 'oc-group',
      im_chat_type: 'group',
    }, 'feishu')).toEqual({
      targetId: 'oc-group',
      targetType: 'chat',
    })
  })
})
