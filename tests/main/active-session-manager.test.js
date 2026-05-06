import { describe, it, expect, vi } from 'vitest'

vi.mock('node-pty', () => ({
  spawn: vi.fn()
}))
const {
  ActiveSessionManager,
  ActiveSession,
  SessionStatus,
  resolveBundledClaudeBinaryPath,
  buildClaudeLaunchCommand
} = require('../../src/main/active-session-manager.js')
const { resolveClaudeCodeExecutablePath } = require('../../src/main/utils/claude-executable-path.js')

describe('ActiveSessionManager Claude launch helpers', () => {
  it('resolves bundled Windows Claude binary from platform package', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'win32',
      'x64',
      vi.fn(() => 'C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      vi.fn((candidate) => candidate.endsWith('claude.exe'))
    )

    expect(resolved).toBe('C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })

  it('rewrites asar path to unpacked binary when needed', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'win32',
      'x64',
      vi.fn(() => 'C:\\app\\resources\\app.asar\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      vi.fn((candidate) => candidate.includes('app.asar.unpacked') && candidate.endsWith('claude.exe'))
    )

    expect(resolved).toBe('C:\\app\\resources\\app.asar.unpacked\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })

  it('returns system claude command when developer source is system', () => {
    const resolved = resolveClaudeCodeExecutablePath({
      source: 'system'
    })

    expect(resolved).toBe('claude')
  })

  it('falls back to plain claude when bundled binary is unavailable', () => {
    const command = buildClaudeLaunchCommand({
      shell: 'cmd.exe',
      isWin: true,
      resumeSessionId: null,
      bundledClaudePath: null,
      source: 'system'
    })

    expect(command).toBe('claude')
  })

  it('uses PowerShell invocation syntax for bundled binary resume command', () => {
    const command = buildClaudeLaunchCommand({
      shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      isWin: true,
      resumeSessionId: 'session-123',
      bundledClaudePath: 'C:\\Program Files\\CC Desktop\\resources\\app.asar.unpacked\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe',
      source: 'bundled'
    })

    expect(command).toBe('& "C:\\Program Files\\CC Desktop\\resources\\app.asar.unpacked\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe" --resume session-123')
  })

  it('uses PowerShell invocation syntax for pwsh bundled binary command', () => {
    const command = buildClaudeLaunchCommand({
      shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      isWin: true,
      resumeSessionId: null,
      bundledClaudePath: 'C:\\Program Files\\CC Desktop\\claude.exe',
      source: 'bundled'
    })

    expect(command).toBe('& "C:\\Program Files\\CC Desktop\\claude.exe"')
  })

  it('throws when bundled source is selected but binary is unavailable', () => {
    expect(() => buildClaudeLaunchCommand({
      shell: 'cmd.exe',
      isWin: true,
      resumeSessionId: null,
      bundledClaudePath: null,
      source: 'bundled'
    })).toThrow('Bundled Claude binary not found')
  })
})

describe('ActiveSessionManager close behavior', () => {
  it('deduplicates concurrent close requests for the same session', async () => {
    const manager = new ActiveSessionManager(null, null)
    const session = new ActiveSession({
      id: 'session-close-once',
      projectId: 1,
      projectPath: 'C:\\test-project'
    })

    session.status = SessionStatus.RUNNING
    session.pty = {
      write: vi.fn(),
      kill: vi.fn()
    }
    manager.sessions.set(session.id, session)

    const closeSpy = vi.spyOn(manager, '_closeSession')
    manager._delay = vi.fn(() => Promise.resolve())
    manager._forceKill = vi.fn(() => {
      session.pty = null
    })

    await Promise.all([
      manager.close(session.id, true),
      manager.close(session.id, true)
    ])

    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(manager._forceKill).toHaveBeenCalledTimes(1)
    expect(manager.sessions.has(session.id)).toBe(false)
  })

  it('uses _forceKill after graceful timeout instead of direct pty.kill', async () => {
    const manager = new ActiveSessionManager(null, null)
    const session = new ActiveSession({
      id: 'session-graceful-timeout',
      projectId: 1,
      projectPath: 'C:\\test-project'
    })

    session.status = SessionStatus.RUNNING
    session.pty = {
      write: vi.fn(),
      kill: vi.fn()
    }
    manager.sessions.set(session.id, session)

    manager._delay = vi.fn(() => Promise.resolve())
    manager._forceKill = vi.fn(() => {
      session.pty = null
    })

    await manager.close(session.id, true)

    expect(session.pty?.kill).toBeUndefined()
    expect(manager._forceKill).toHaveBeenCalledTimes(1)
  })
})

describe('ActiveSessionManager start behavior', () => {
  it('returns a user-facing error when bundled binary is unavailable', () => {
    const spawnSpy = vi.fn()
    const manager = new ActiveSessionManager(null, {
      getConfig: () => ({ settings: { developerClaudeSource: 'bundled' } }),
      getDefaultProfile: () => null,
      getAPIProfile: () => null,
      getAutocompactPctOverride: () => null
    }, {
      ptyModule: { spawn: spawnSpy },
      resolveBundledClaudeBinaryPath: () => null
    })
    const session = manager.create({
      projectId: 1,
      projectPath: 'C:\\test-project',
      projectName: 'test-project'
    })

    const result = manager.start(session.id)

    expect(result.success).toBe(false)
    expect(result.error).toBe('当前设置为“内置 Claude”，但未找到内置可执行文件')
    expect(spawnSpy).not.toHaveBeenCalled()
  })
})
