import { describe, expect, it, vi } from 'vitest'

const {
  resolveBundledClaudeBinaryPath,
  resolveClaudeCodeExecutablePath
} = require('../../src/main/utils/claude-executable-path.js')

describe('Claude executable path resolution', () => {
  it('resolves the bundled Windows Claude binary from the platform package', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'win32',
      'x64',
      vi.fn(() => 'C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      vi.fn(candidate => candidate.endsWith('claude.exe'))
    )

    expect(resolved).toBe('C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })

  it('rewrites an asar path to the unpacked Windows binary', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'win32',
      'x64',
      vi.fn(() => 'C:\\app\\resources\\app.asar\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      vi.fn(candidate => candidate.includes('app.asar.unpacked') && candidate.endsWith('claude.exe'))
    )

    expect(resolved).toBe('C:\\app\\resources\\app.asar.unpacked\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })

  it('prefers the unpacked binary when both package paths appear available', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'win32',
      'x64',
      vi.fn(() => 'C:\\app\\resources\\app.asar\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      vi.fn(candidate => candidate.endsWith('claude.exe'))
    )

    expect(resolved).toBe('C:\\app\\resources\\app.asar.unpacked\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })

  it('uses the unpacked binary on macOS packaged installs', () => {
    const resolved = resolveBundledClaudeBinaryPath(
      'darwin',
      'arm64',
      vi.fn(() => '/Applications/CC Desktop.app/Contents/Resources/app.asar/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/package.json'),
      vi.fn(candidate => candidate.endsWith('/claude'))
    )

    expect(resolved).toBe('/Applications/CC Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
  })

  it('always resolves the bundled binary even when a legacy system source is requested', () => {
    const resolved = resolveClaudeCodeExecutablePath({
      source: 'system',
      platform: 'win32',
      arch: 'x64',
      resolvePackage: vi.fn(() => 'C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\package.json'),
      fileExists: vi.fn(candidate => candidate.endsWith('claude.exe'))
    })

    expect(resolved).toBe('C:\\app\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe')
  })
})
