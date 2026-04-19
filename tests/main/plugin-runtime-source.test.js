import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('plugin-runtime source parsing', () => {
  let parseMarketplaceInput
  let formatMarketplaceSource
  let tempRoot

  beforeEach(async () => {
    vi.resetModules()
    ;({ parseMarketplaceInput, formatMarketplaceSource } = await import('../../src/main/plugin-runtime/core/source.js'))
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('parses GitHub shorthand with ref', async () => {
    const parsed = await parseMarketplaceInput('openai/codex-plugin-cc#main')

    expect(parsed).toEqual({
      source: 'github',
      repo: 'openai/codex-plugin-cc',
      ref: 'main'
    })
  })

  it('normalizes GitHub HTTPS URLs into git sources', async () => {
    const parsed = await parseMarketplaceInput('https://github.com/openai/codex-plugin-cc#stable')

    expect(parsed).toEqual({
      source: 'git',
      url: 'https://github.com/openai/codex-plugin-cc.git',
      ref: 'stable'
    })
  })

  it('detects local directory and json file sources', async () => {
    const directoryPath = path.join(tempRoot, 'marketplace-dir')
    const filePath = path.join(tempRoot, 'marketplace.json')
    fs.mkdirSync(directoryPath, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ name: 'demo', plugins: [] }), 'utf-8')

    await expect(parseMarketplaceInput(directoryPath)).resolves.toEqual({
      source: 'directory',
      path: path.resolve(directoryPath)
    })
    await expect(parseMarketplaceInput(filePath)).resolves.toEqual({
      source: 'file',
      path: path.resolve(filePath)
    })
  })

  it('returns a descriptive error for missing local paths', async () => {
    const missingPath = path.join(tempRoot, 'missing-marketplace')

    const parsed = await parseMarketplaceInput(missingPath)

    expect(parsed).toEqual({
      error: `Path does not exist: ${path.resolve(missingPath)}`
    })
  })

  it('formats source display strings by source type', () => {
    expect(formatMarketplaceSource({ source: 'github', repo: 'openai/codex-plugin-cc' })).toBe(
      'openai/codex-plugin-cc'
    )
    expect(formatMarketplaceSource({ source: 'git', url: 'https://example.com/demo.git' })).toBe(
      'https://example.com/demo.git'
    )
    expect(formatMarketplaceSource({ source: 'directory', path: 'C:/plugins/demo' })).toBe(
      'C:/plugins/demo'
    )
  })
})
