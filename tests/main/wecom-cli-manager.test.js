import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('WecomCliManager', () => {
  let tempDir
  let WecomCliManager

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-wecom-cli-'))
    process.env.WECOM_CLI_CONFIG_DIR = tempDir
    vi.resetModules()
    ;({ WecomCliManager } = await import('../../src/main/managers/wecom-cli-manager.js'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    delete process.env.WECOM_CLI_CONFIG_DIR
    vi.restoreAllMocks()
  })

  it('reports installed and initialized from auth command + bot.enc', async () => {
    const manager = new WecomCliManager()
    fs.writeFileSync(path.join(tempDir, 'bot.enc'), 'encrypted-bot')
    vi.spyOn(manager, '_exec').mockResolvedValue({ stdout: 'authorized\n', stderr: '', exitCode: 0 })
    vi.spyOn(manager, 'listContacts').mockResolvedValue([])

    const status = await manager.getDetailedStatus()

    expect(status.installed).toBe(true)
    expect(status.initialized).toBe(true)
    expect(status.authStatus).toBe('authorized')
    expect(status.contactAuth).toBe('authorized')
  })

  it('bootstrap status avoids contact probing and keeps contactAuth unknown', async () => {
    const manager = new WecomCliManager()
    fs.writeFileSync(path.join(tempDir, 'bot.enc'), 'encrypted-bot')
    vi.spyOn(manager, 'isInstalled').mockResolvedValue(true)
    vi.spyOn(manager, 'getAuthStatus').mockResolvedValue('authorized')
    const contactSpy = vi.spyOn(manager, 'getContactAuthStatus')

    const status = await manager.getBootstrapStatus()

    expect(status.installed).toBe(true)
    expect(status.initialized).toBe(true)
    expect(status.authStatus).toBe('authorized')
    expect(status.contactAuth).toBe('unknown')
    expect(contactSpy).not.toHaveBeenCalled()
  })

  it('uses wecom-cli prefix when reading auth status', async () => {
    const manager = new WecomCliManager()
    const execSpy = vi.spyOn(manager, 'execJsonRpc').mockResolvedValue('authorized')

    const status = await manager.getAuthStatus()

    expect(status).toBe('authorized')
    expect(execSpy).toHaveBeenCalledWith(['wecom-cli', 'auth', 'show', '--auth-status'])
  })

  it('uses enhanced basic env when spawning wecom-cli commands', async () => {
    const manager = new WecomCliManager()
    const fakeStdout = { on: vi.fn() }
    const fakeStderr = { on: vi.fn() }
    const spawnResult = {
      stdout: fakeStdout,
      stderr: fakeStderr,
      on: vi.fn((event, handler) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0)
        }
      })
    }
    const spawnSpy = vi.spyOn(manager, '_spawn').mockReturnValue(spawnResult)
    const envSpy = vi.spyOn(manager, '_getExecEnv').mockReturnValue({ PATH: '/enhanced/bin', TEST_FLAG: '1' })

    await manager._exec(['wecom-cli', 'auth', 'show', '--auth-status'])

    expect(envSpy).toHaveBeenCalledWith({})
    expect(spawnSpy).toHaveBeenCalledWith(
      'wecom-cli',
      ['auth', 'show', '--auth-status'],
      expect.objectContaining({
        env: { PATH: '/enhanced/bin', TEST_FLAG: '1' }
      })
    )
  })

  it('maps errcode 850002 to CONTACT_NOT_AUTHORIZED', async () => {
    const manager = new WecomCliManager()
    vi.spyOn(manager, 'isInstalled').mockReturnValue(true)
    vi.spyOn(manager, 'isInitialized').mockReturnValue(true)
    vi.spyOn(manager, 'execJsonRpc').mockResolvedValue({
      errcode: 850002,
      errmsg: 'no authorization',
      help_message: '当前机器人未被授权「通讯录」使用权限',
      help_instruction: 'verbatim',
    })

    await expect(manager.listContacts()).rejects.toMatchObject({
      code: 'CONTACT_NOT_AUTHORIZED',
      errcode: 850002,
      helpMessage: '当前机器人未被授权「通讯录」使用权限',
    })
  })

  it('surfaces help message in detailed status when contact auth is missing', async () => {
    const manager = new WecomCliManager()
    vi.spyOn(manager, 'isInstalled').mockResolvedValue(true)
    vi.spyOn(manager, 'isInitialized').mockReturnValue(true)
    vi.spyOn(manager, 'getAuthStatus').mockResolvedValue('authorized')
    vi.spyOn(manager, 'getContactAuthStatus').mockResolvedValue({
      status: 'unauthorized',
      errorCode: 'CONTACT_NOT_AUTHORIZED',
      errorMessage: 'no authorization',
      helpMessage: '当前机器人未被授权「通讯录」使用权限',
      helpInstruction: 'verbatim',
    })

    const status = await manager.getDetailedStatus()

    expect(status.contactAuth).toBe('unauthorized')
    expect(status.lastErrorCode).toBe('CONTACT_NOT_AUTHORIZED')
    expect(status.helpMessage).toBe('当前机器人未被授权「通讯录」使用权限')
    expect(status.helpInstruction).toBe('verbatim')
  })

  it('parses contact list into toolbar target shape', async () => {
    const manager = new WecomCliManager()
    vi.spyOn(manager, 'isInstalled').mockReturnValue(true)
    vi.spyOn(manager, 'isInitialized').mockReturnValue(true)
    vi.spyOn(manager, 'execJsonRpc').mockResolvedValue({
      errcode: 0,
      errmsg: 'ok',
      userlist: [
        { userid: 'hydrocoder', name: 'HydroCoder', alias: '' },
        { userid: 'TianShu', name: '', alias: '天枢' },
      ],
    })

    const contacts = await manager.listContacts()

    expect(contacts).toEqual([
      {
        id: 'hydrocoder',
        userId: 'hydrocoder',
        targetId: 'hydrocoder',
        displayName: 'HydroCoder',
        name: 'HydroCoder',
        alias: '',
      },
      {
        id: 'TianShu',
        userId: 'TianShu',
        targetId: 'TianShu',
        displayName: '天枢',
        name: '天枢',
        alias: '天枢',
      },
    ])
  })

  it('uses start cmd.exe /k for visible windows terminal launch on Windows', async () => {
    const manager = new WecomCliManager()
    const originalPlatform = process.platform
    const unref = vi.fn()
    const spawnSpy = vi.spyOn(manager, '_spawn').mockReturnValue({ unref })
    vi.stubGlobal('process', { ...process, platform: 'win32', env: process.env })

    const result = await manager.runCommand({ command: 'wecom-cli init' })

    expect(result).toMatchObject({ success: true, mode: 'terminal', command: 'wecom-cli init' })
    expect(spawnSpy).toHaveBeenCalledWith(
      process.env.COMSPEC || 'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'wecom-cli init'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
    )
    expect(unref).toHaveBeenCalled()
    vi.stubGlobal('process', { ...process, platform: originalPlatform, env: process.env })
  })
})
