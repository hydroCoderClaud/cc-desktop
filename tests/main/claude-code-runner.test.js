import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'

const ClaudeCodeRunner = require('../../src/main/runners/claude-code-runner.js')

describe('ClaudeCodeRunner createQuery system prompt mapping', () => {
  it('maps appendSystemPrompt to preset systemPrompt append format for current SDK', async () => {
    const runner = new ClaudeCodeRunner()
    const queryFn = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {}
    }))
    runner._queryFn = queryFn

    await runner.createQuery(null, {
      cwd: '/tmp',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      appendSystemPrompt: 'Present yourself as Hydro Desktop AI.'
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryFn.mock.calls[0][0].options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Present yourself as Hydro Desktop AI.'
    })
    expect(queryFn.mock.calls[0][0].options.appendSystemPrompt).toBeUndefined()
  })

  it('defaults settingSources to user and project without local', async () => {
    const runner = new ClaudeCodeRunner()
    const queryFn = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {}
    }))
    runner._queryFn = queryFn

    await runner.createQuery(null, {
      cwd: '/tmp',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' }
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryFn.mock.calls[0][0].options.settingSources).toEqual(['user', 'project'])
  })

  it('respects explicit settingSources overrides', async () => {
    const runner = new ClaudeCodeRunner()
    const queryFn = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {}
    }))
    runner._queryFn = queryFn

    await runner.createQuery(null, {
      cwd: '/tmp',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      settingSources: ['user']
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryFn.mock.calls[0][0].options.settingSources).toEqual(['user'])
  })
})

describe('ClaudeCodeRunner stderr filtering', () => {
  it('treats the Claude connectors auth precedence notice as benign', () => {
    const text = "claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is set and takes precedence over your claude.ai login"

    expect(ClaudeCodeRunner.isBenignCliStderr(text)).toBe(true)
  })

  it('does not suppress ordinary CLI stderr', () => {
    expect(ClaudeCodeRunner.isBenignCliStderr('Error: failed to start MCP server')).toBe(false)
  })

  it('filters only benign stderr lines when mixed with real errors', () => {
    const filtered = ClaudeCodeRunner.splitCliStderr([
      'claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is set and takes precedence over your claude.ai login',
      'Error: failed to start MCP server'
    ].join('\n'))

    expect(filtered.suppressed).toContain('connectors are disabled')
    expect(filtered.visible).toBe('Error: failed to start MCP server')
  })

  it('keeps benign CLI stderr out of session error state', async () => {
    const runner = new ClaudeCodeRunner()
    const child = new EventEmitter()
    child.stderr = new EventEmitter()
    child.pid = 123
    const spawn = vi.fn(() => child)
    const queryFn = vi.fn(({ options }) => {
      options.spawnClaudeCodeProcess({
        command: 'node',
        args: ['claude.js'],
        cwd: '/tmp'
      })
      child.stderr.emit('data', Buffer.from('claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is set and takes precedence over your claude.ai login'))
      child.emit('exit', 0, null)
      return {
        async *[Symbol.asyncIterator]() {}
      }
    })
    runner._queryFn = queryFn
    const sessionRef = {}

    await runner.createQuery(null, {
      cwd: '/tmp',
      env: {},
      spawn
    }, sessionRef)

    expect(sessionRef._lastCliStderr).toBe('')
    expect(sessionRef._lastSuppressedCliStderr).toContain('connectors are disabled')
  })
})
