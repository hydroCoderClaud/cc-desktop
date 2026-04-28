import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { WeixinNotifyService } = await import('../../src/main/managers/weixin-notify-service.js')

describe('WeixinNotifyService', () => {
  let tempDir
  let fetchMock

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-weixin-notify-'))
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createService() {
    return new WeixinNotifyService({ userDataPath: tempDir })
  }

  function jsonResponse(payload, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(payload)
    }
  }

  function binaryResponse(buffer, headers = {}, ok = true, status = 200) {
    const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
    return {
      ok,
      status,
      headers: {
        get: key => normalizedHeaders.get(String(key).toLowerCase()) || null
      },
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      text: async () => buffer.toString('utf-8')
    }
  }

  it('logs in with qr flow and stores a public account', async () => {
    const service = createService()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/demo'
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'confirmed',
        bot_token: 'secret-token',
        ilink_bot_id: 'bot@im.bot',
        ilink_user_id: 'user@im.wechat',
        baseurl: 'https://ilinkai.weixin.qq.com'
      }))

    const login = await service.startLogin()
    expect(login.qrcodeUrl).toMatch(/^data:image\/png;base64,/)
    expect(login.qrcodeContent).toBe('https://liteapp.weixin.qq.com/q/demo')

    const result = await service.waitLogin({ sessionKey: login.sessionKey, timeoutMs: 1000 })
    expect(result.connected).toBe(true)
    expect(result.account).toMatchObject({
      accountId: 'bot@im.bot',
      userId: 'user@im.wechat',
      hasToken: true
    })
    expect(service.listAccounts()[0]).not.toHaveProperty('token')
  })

  it('pre-captures the first inbound message after qr login without emitting it', async () => {
    const service = createService()
    const received = []
    service.on('message', message => received.push(message))
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/demo'
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'confirmed',
        bot_token: 'secret-token',
        ilink_bot_id: 'bot@im.bot',
        ilink_user_id: 'scanner@im.wechat',
        baseurl: 'https://ilinkai.weixin.qq.com'
      }))
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [{
          from_user_id: 'scanner@im.wechat',
          context_token: 'ctx-1',
          item_list: [{ type: 1, text_item: { text: 'bind me' } }]
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({ ret: 0 }))
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-2',
        msgs: [{
          from_user_id: 'scanner@im.wechat',
          context_token: 'ctx-2',
          item_list: [{ type: 1, text_item: { text: 'real message' } }]
        }]
      }))

    const login = await service.startLogin()
    const result = await service.waitLogin({ sessionKey: login.sessionKey, timeoutMs: 1000 })
    expect(result.connected).toBe(true)

    const preCapturePoll = await service.pollOnce({ accountId: 'bot@im.bot' })
    expect(preCapturePoll.targets).toHaveLength(1)
    expect(service.listTargets()[0]).toMatchObject({
      id: 'bot@im.bot:scanner@im.wechat',
      hasContextToken: true
    })
    expect(received).toHaveLength(0)
    const welcomeRequest = JSON.parse(fetchMock.mock.calls[3][1].body)
    expect(welcomeRequest.msg.context_token).toBe('ctx-1')
    expect(welcomeRequest.msg.item_list[0].text_item.text).toContain('您已经绑定HydroDesktop')

    await service.pollOnce({ accountId: 'bot@im.bot' })
    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('real message')
  })

  it('captures inbound targets and sends text with context token', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [{
          from_user_id: 'target@im.wechat',
          context_token: 'ctx-1',
          item_list: [{ type: 1, text_item: { text: 'hello' } }]
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({ ret: 0 }))

    const poll = await service.pollOnce({ accountId: 'bot@im.bot' })
    expect(poll.targets[0]).toMatchObject({
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      targetSource: 'inbound_context',
      isAuthorizedAccountUser: false,
      hasContextToken: true
    })

    const sent = await service.sendText({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      text: 'Hydro notification'
    })

    expect(sent.success).toBe(true)
    const sendRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(sendRequest.msg.to_user_id).toBe('target@im.wechat')
    expect(sendRequest.msg.context_token).toBe('ctx-1')
    expect(sendRequest.msg.item_list[0].text_item.text).toBe('Hydro notification')
  })

  it('emits sent event with session binding metadata', async () => {
    const service = createService()
    const sentEvents = []
    service.on('sent', event => sentEvents.push(event))
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      displayName: '张三',
      contextToken: 'ctx-1'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ret: 0 }))

    await service.sendText({
      accountId: 'bot@im.bot',
      targetId: '张三',
      text: 'Hydro notification',
      sessionId: 'session-1'
    })

    expect(sentEvents).toHaveLength(1)
    expect(sentEvents[0]).toMatchObject({
      accountId: 'bot@im.bot',
      targetId: 'bot@im.bot:target@im.wechat',
      sessionId: 'session-1',
      text: 'Hydro notification'
    })
  })

  it('emits normalized inbound message events when polling captures updates', async () => {
    const service = createService()
    const received = []
    service.on('message', message => received.push(message))
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'target@im.wechat'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: [{
        from_user_id: 'target@im.wechat',
        context_token: 'ctx-1',
        create_time_ms: 1710000000000,
        item_list: [{ type: 1, text_item: { text: 'reply' } }]
      }]
    }))

    await service.pollOnce({ accountId: 'bot@im.bot' })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      accountId: 'bot@im.bot',
      targetId: 'bot@im.bot:target@im.wechat',
      from: 'target@im.wechat',
      text: 'reply',
      contextToken: 'ctx-1',
      createTimeMs: 1710000000000,
      target: {
        id: 'bot@im.bot:target@im.wechat',
        targetSource: 'authorized_user',
        isAuthorizedAccountUser: true
      }
    })
  })

  it('can capture targets without emitting inbound message events', async () => {
    const service = createService()
    const received = []
    service.on('message', message => received.push(message))
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'target@im.wechat'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: [{
        from_user_id: 'target@im.wechat',
        context_token: 'ctx-1',
        item_list: [{ type: 1, text_item: { text: 'bind me' } }]
      }]
    }))

    const poll = await service.pollOnce({ accountId: 'bot@im.bot', emitInbound: false })

    expect(poll.targets).toHaveLength(1)
    expect(poll.messages).toHaveLength(1)
    expect(service.listTargets()[0]).toMatchObject({
      id: 'bot@im.bot:target@im.wechat',
      hasContextToken: true
    })
    expect(received).toHaveLength(0)
  })

  it('downloads inbound image messages and exposes base64 image data', async () => {
    const service = createService()
    const received = []
    service.on('message', message => received.push(message))
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'target@im.wechat'
    })
    const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [{
          from_user_id: 'target@im.wechat',
          context_token: 'ctx-1',
          item_list: [{
            type: 2,
            image_item: {
              media: {
                full_url: 'https://cdn.example/image',
                encrypt_query_param: 'download-param'
              }
            }
          }]
        }]
      }))
      .mockResolvedValueOnce(binaryResponse(imageBuffer, { 'content-type': 'image/png' }))

    const poll = await service.pollOnce({ accountId: 'bot@im.bot' })

    expect(poll.messages[0]).toMatchObject({
      text: '',
      images: [{
        base64: imageBuffer.toString('base64'),
        mediaType: 'image/png',
        sizeBytes: imageBuffer.length
      }]
    })
    expect(received).toHaveLength(1)
    expect(received[0].images).toHaveLength(1)
  })

  it('uploads and sends outbound image messages', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      contextToken: 'ctx-1'
    })

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        upload_full_url: 'https://cdn.example/upload'
      }))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('ok'), { 'x-encrypted-param': 'download-param' }))
      .mockResolvedValueOnce(jsonResponse({ ret: 0 }))

    const sent = await service.sendImages({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      images: [{ base64: Buffer.from('image-bytes').toString('base64'), mediaType: 'image/png' }]
    })

    expect(sent.success).toBe(true)
    const uploadUrlRequest = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(uploadUrlRequest).toMatchObject({
      media_type: 1,
      to_user_id: 'target@im.wechat',
      no_need_thumb: true
    })
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example/upload')
    const sendRequest = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(sendRequest.msg.item_list[0]).toMatchObject({
      type: 2,
      image_item: {
        media: {
          encrypt_query_param: 'download-param',
          encrypt_type: 1
        }
      }
    })
    expect(sendRequest.msg.context_token).toBe('ctx-1')
  })

  it('runs background polling and emits inbound messages', async () => {
    vi.useFakeTimers()
    const service = new WeixinNotifyService(
      { userDataPath: tempDir },
      { backgroundPollIntervalMs: 100, backgroundPollTimeoutMs: 1000 }
    )
    const received = []
    service.on('message', message => received.push(message))
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'target@im.wechat'
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: [{
        from_user_id: 'target@im.wechat',
        context_token: 'ctx-1',
        item_list: [{ type: 1, text_item: { text: 'background reply' } }]
      }]
    }))

    service.startBackgroundPolling()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      text: 'background reply',
      targetId: 'bot@im.bot:target@im.wechat'
    })

    service.stop()
    vi.useRealTimers()
  })

  it('serializes concurrent polling calls', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    let releaseFirstPoll
    fetchMock
      .mockImplementationOnce(() => new Promise(resolve => {
        releaseFirstPoll = () => resolve(jsonResponse({
          ret: 0,
          get_updates_buf: 'cursor-1',
          msgs: []
        }))
      }))
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-2',
        msgs: []
      }))

    const firstPoll = service.pollOnce({ accountId: 'bot@im.bot' })
    const secondPoll = service.pollOnce({ accountId: 'bot@im.bot' })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    releaseFirstPoll()
    await firstPoll
    await secondPoll
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('updates target display names and resolves send target by display name', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      contextToken: 'ctx-1'
    })

    const updated = service.updateTarget({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      displayName: '张三'
    })
    expect(updated.displayName).toBe('张三')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        ret: 0,
        get_updates_buf: 'cursor-1',
        msgs: [{
          from_user_id: 'target@im.wechat',
          context_token: 'ctx-2',
          item_list: [{ type: 1, text_item: { text: 'hello again' } }]
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({ ret: 0 }))

    const poll = await service.pollOnce({ accountId: 'bot@im.bot' })
    expect(poll.targets[0].displayName).toBe('张三')

    await service.sendText({
      accountId: 'bot@im.bot',
      targetId: '张三',
      text: 'alias notification'
    })

    const sendRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(sendRequest.msg.to_user_id).toBe('target@im.wechat')
    expect(sendRequest.msg.context_token).toBe('ctx-2')
  })

  it('keeps only the latest bot account and hides stale targets for the same scanning user', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'old-bot@im.bot',
      token: 'old-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'scanner@im.wechat'
    })
    service.state.targets.push({
      id: 'old-bot@im.bot:target@im.wechat',
      accountId: 'old-bot@im.bot',
      userId: 'target@im.wechat',
      displayName: '张三',
      contextToken: 'old-ctx'
    })

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/demo'
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'confirmed',
        bot_token: 'new-token',
        ilink_bot_id: 'new-bot@im.bot',
        ilink_user_id: 'scanner@im.wechat',
        baseurl: 'https://ilinkai.weixin.qq.com'
      }))

    const login = await service.startLogin()
    await service.waitLogin({ sessionKey: login.sessionKey, timeoutMs: 1000 })

    expect(service.listAccounts()).toHaveLength(1)
    expect(service.listAccounts()[0]).toMatchObject({
      accountId: 'new-bot@im.bot',
      userId: 'scanner@im.wechat'
    })
    expect(service.listTargets()).toHaveLength(0)
    expect(service.state.targets).toHaveLength(1)
    expect(service.state.targets[0]).toMatchObject({
      accountId: 'old-bot@im.bot',
      preferred: false
    })
    expect(service.state.targets[0].supersededAt).toBeTruthy()
  })

  it('does not create target placeholders after qr login', async () => {
    const service = createService()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        qrcode: 'qr-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/q/demo'
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'confirmed',
        bot_token: 'secret-token',
        ilink_bot_id: 'bot@im.bot',
        ilink_user_id: 'scanner@im.wechat',
        baseurl: 'https://ilinkai.weixin.qq.com'
      }))

    const login = await service.startLogin()
    await service.waitLogin({ sessionKey: login.sessionKey, timeoutMs: 1000 })

    expect(service.listTargets()).toHaveLength(0)
  })

  it('keeps old channel bindings hidden when the same user is captured on a new account', async () => {
    const service = createService()
    service.state.accounts.push(
      {
        accountId: 'old-bot@im.bot',
        token: 'old-token',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        userId: 'target@im.wechat'
      },
      {
        accountId: 'new-bot@im.bot',
        token: 'new-token',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        userId: 'target@im.wechat'
      }
    )
    service.state.targets.push({
      id: 'old-bot@im.bot:target@im.wechat',
      accountId: 'old-bot@im.bot',
      userId: 'target@im.wechat',
      displayName: '张三',
      contextToken: 'old-ctx'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: [{
        from_user_id: 'target@im.wechat',
        context_token: 'new-ctx',
        item_list: [{ type: 1, text_item: { text: 'hi' } }]
      }]
    }))

    await service.pollOnce({ accountId: 'new-bot@im.bot' })

    expect(service.listTargets()).toHaveLength(1)
    expect(service.listTargets()[0]).toMatchObject({
      id: 'new-bot@im.bot:target@im.wechat',
      accountId: 'new-bot@im.bot',
      accountUserId: 'target@im.wechat',
      userId: 'target@im.wechat',
      displayName: '张三',
      targetSource: 'authorized_user',
      isAuthorizedAccountUser: true,
      hasContextToken: true,
      lastInboundText: 'hi'
    })
    expect(service.state.targets).toHaveLength(2)
    expect(service.state.targets.find(target => target.id === 'old-bot@im.bot:target@im.wechat')).toMatchObject({
      preferred: false,
      displayName: '张三'
    })
    expect(service.state.targets.find(target => target.id === 'new-bot@im.bot:target@im.wechat')).toMatchObject({
      preferred: true,
      displayName: '张三',
      targetSource: 'authorized_user',
      supersededAt: null
    })
  })

  it('marks captured scanner events as authorized notification targets', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'scanner@im.wechat'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: [{
        from_user_id: 'scanner@im.wechat',
        context_token: 'ctx-scanner',
        item_list: [{ type: 1, text_item: { text: 'authorized' } }]
      }]
    }))

    const poll = await service.pollOnce({ accountId: 'bot@im.bot' })

    expect(poll.targets[0]).toMatchObject({
      id: 'bot@im.bot:scanner@im.wechat',
      accountId: 'bot@im.bot',
      accountUserId: 'scanner@im.wechat',
      userId: 'scanner@im.wechat',
      targetSource: 'authorized_user',
      isAuthorizedAccountUser: true,
      hasContextToken: true
    })
  })

  it('reloads persisted targets when listing state', async () => {
    const service = createService()
    fs.mkdirSync(path.join(tempDir, 'weixin-notify'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'weixin-notify', 'state.json'), JSON.stringify({
      accounts: [{
        accountId: 'bot@im.bot',
        token: 'secret-token',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        userId: 'scanner@im.wechat'
      }],
      targets: [{
        id: 'bot@im.bot:target@im.wechat',
        accountId: 'bot@im.bot',
        userId: 'target@im.wechat',
        displayName: '张三',
        contextToken: 'ctx-1'
      }]
    }), 'utf-8')

    expect(service.listTargets()).toEqual([
      expect.objectContaining({
        id: 'bot@im.bot:target@im.wechat',
        displayName: '张三',
        hasContextToken: true
      })
    ])
  })

  it('deletes a captured target without removing the account', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'scanner@im.wechat'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      displayName: '张三',
      contextToken: 'ctx-1'
    })

    const result = service.deleteTarget({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat'
    })

    expect(result.deleted).toBe(true)
    expect(result.target).toMatchObject({
      displayName: '张三',
      userId: 'target@im.wechat'
    })
    expect(service.listTargets()).toHaveLength(0)
    expect(service.state.targets).toHaveLength(1)
    expect(service.state.targets[0]).toMatchObject({
      preferred: false
    })
    expect(service.state.targets[0].deletedAt).toBeTruthy()
    expect(service.listAccounts()).toHaveLength(1)
  })

  it('rejects sending to a target without context token', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat'
    })

    await expect(service.sendText({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      text: 'hello'
    })).rejects.toThrow('contextToken')
  })

  it('rejects nonzero getupdates business responses', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: -1,
      errcode: 40001,
      errmsg: 'invalid token'
    }))

    await expect(service.pollOnce({
      accountId: 'bot@im.bot',
      timeoutMs: 3000
    })).rejects.toThrow('getupdates')
  })

  it('uses caller-provided poll timeout up to the service maximum', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      get_updates_buf: 'cursor-1',
      msgs: []
    }))

    await service.pollOnce({
      accountId: 'bot@im.bot',
      timeoutMs: 3000
    })

    const signal = fetchMock.mock.calls[0][1].signal
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects nonzero sendmessage business responses', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      contextToken: 'ctx-1'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: -1,
      errcode: 40003,
      errmsg: 'context expired'
    }))

    await expect(service.sendText({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      text: 'hello'
    })).rejects.toThrow('sendmessage')
  })

  it('marks target context expired when sendmessage returns session timeout', async () => {
    const service = createService()
    service.state.accounts.push({
      accountId: 'bot@im.bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com'
    })
    service.state.targets.push({
      id: 'bot@im.bot:target@im.wechat',
      accountId: 'bot@im.bot',
      userId: 'target@im.wechat',
      contextToken: 'ctx-1'
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ret: 0,
      errcode: -14,
      errmsg: 'session timeout'
    }))

    await expect(service.sendText({
      accountId: 'bot@im.bot',
      targetId: 'target@im.wechat',
      text: 'hello'
    })).rejects.toThrow('会话已过期')

    const target = service.listTargets()[0]
    expect(target.hasContextToken).toBe(false)
    expect(target.contextExpiredAt).toBeTruthy()
    expect(target.lastError).toBe('session timeout')
  })
})
