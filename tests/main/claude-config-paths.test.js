import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const requireCjs = createRequire(import.meta.url)
const paths = requireCjs('../../src/main/utils/claude-config-paths.js')
const { buildProcessEnv } = requireCjs('../../src/main/utils/env-builder.js')
const { McpManager } = requireCjs('../../src/main/managers/mcp-manager.js')
const { ComponentScanner } = requireCjs('../../src/main/component-scanner.js')
const { SkillsManager } = requireCjs('../../src/main/managers/skills/index.js')
const { AgentsManager } = requireCjs('../../src/main/managers/agents/index.js')
const { CapabilityManager } = requireCjs('../../src/main/managers/capability-manager.js')
const { SessionHistoryService } = requireCjs('../../src/main/session-history-service.js')
const { SessionSyncService } = requireCjs('../../src/main/session-sync-service.js')

function fakeConfigManager(claudeConfigDir) {
  return {
    getConfig() {
      return {
        settings: {
          agent: {
            claudeConfigDir
          }
        }
      }
    }
  }
}

describe('Claude config paths', () => {
  afterEach(() => {
    paths.configureClaudeConfigPaths({ configManager: null })
  })

  it('defaults to Claude Code profile state without setting CLAUDE_CONFIG_DIR', () => {
    expect(paths.getClaudeConfigDir()).toBe(path.join(os.homedir(), '.claude'))
    expect(paths.getClaudeSettingsPath()).toBe(path.join(os.homedir(), '.claude', 'settings.json'))
    expect(paths.getClaudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'))
    expect(paths.getClaudeProxySetupPath()).toBe(path.join(os.homedir(), '.claude', 'proxy-support', 'proxy-setup.cjs'))
    expect(paths.getClaudeJsonPath()).toBe(path.join(os.homedir(), '.claude.json'))
    expect(paths.buildClaudeConfigEnv()).toEqual({})
    expect(buildProcessEnv(null).CLAUDE_CONFIG_DIR).toBeUndefined()
  })

  it('does not inherit CLAUDE_CONFIG_DIR in legacy mode', () => {
    const originalValue = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'external-claude-config')

    try {
      expect(buildProcessEnv(null).CLAUDE_CONFIG_DIR).toBeUndefined()
    } finally {
      if (originalValue === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalValue
      }
    }
  })

  it('uses the configured Claude config directory for process env and profile files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-claude-config-test-'))
    const configManager = fakeConfigManager(tempDir)

    try {
      paths.configureClaudeConfigPaths({ configManager })

      expect(paths.getClaudeSettingsPath()).toBe(path.join(tempDir, 'settings.json'))
      expect(paths.getClaudeProjectsDir()).toBe(path.join(tempDir, 'projects'))
      expect(paths.getClaudeProxySetupPath()).toBe(path.join(tempDir, 'proxy-support', 'proxy-setup.cjs'))
      expect(paths.getClaudeJsonPath()).toBe(path.join(tempDir, '.claude.json'))
      expect(buildProcessEnv(null, {}, configManager).CLAUDE_CONFIG_DIR).toBe(tempDir)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('updates manager paths immediately when switching between legacy and isolated modes', () => {
    let configuredDir = ''
    const configManager = {
      getConfig() {
        return {
          settings: {
            agent: {
              claudeConfigDir: configuredDir
            }
          }
        }
      }
    }

    paths.configureClaudeConfigPaths({ configManager })

    const scanner = new ComponentScanner()
    const skillsManager = new SkillsManager()
    const agentsManager = new AgentsManager()
    const capabilityManager = new CapabilityManager(configManager)
    const historyService = new SessionHistoryService()
    const syncService = new SessionSyncService({})

    expect(scanner.settingsPath).toBe(path.join(os.homedir(), '.claude', 'settings.json'))
    expect(skillsManager.userSkillsDir).toBe(path.join(os.homedir(), '.claude', 'skills'))
    expect(agentsManager.userAgentsDir).toBe(path.join(os.homedir(), '.claude', 'agents'))
    expect(capabilityManager.installedPluginsPath).toBe(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'))
    expect(historyService.historyFile).toBe(path.join(os.homedir(), '.claude', 'history.jsonl'))
    expect(syncService.projectsDir).toBe(path.join(os.homedir(), '.claude', 'projects'))

    configuredDir = path.join(os.tmpdir(), 'cc-claude-config-a')

    expect(scanner.settingsPath).toBe(path.join(configuredDir, 'settings.json'))
    expect(skillsManager.userSkillsDir).toBe(path.join(configuredDir, 'skills'))
    expect(agentsManager.userAgentsDir).toBe(path.join(configuredDir, 'agents'))
    expect(capabilityManager.installedPluginsPath).toBe(path.join(configuredDir, 'plugins', 'installed_plugins.json'))
    expect(historyService.historyFile).toBe(path.join(configuredDir, 'history.jsonl'))
    expect(syncService.projectsDir).toBe(path.join(configuredDir, 'projects'))

    configuredDir = ''

    expect(scanner.settingsPath).toBe(path.join(os.homedir(), '.claude', 'settings.json'))
    expect(skillsManager.userSkillsDir).toBe(path.join(os.homedir(), '.claude', 'skills'))
    expect(agentsManager.userAgentsDir).toBe(path.join(os.homedir(), '.claude', 'agents'))
    expect(capabilityManager.installedPluginsPath).toBe(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'))
    expect(historyService.historyFile).toBe(path.join(os.homedir(), '.claude', 'history.jsonl'))
    expect(syncService.projectsDir).toBe(path.join(os.homedir(), '.claude', 'projects'))
  })

  it('does not create a custom root directory on startup in legacy mode', () => {
    expect(paths.ensureClaudeConfigDir(fakeConfigManager(''))).toBeNull()
  })

  it('creates only the configured Claude config root directory on startup', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-claude-config-root-'))
    const configDir = path.join(tempRoot, 'hydro-agent')
    const configManager = fakeConfigManager(configDir)

    try {
      expect(fs.existsSync(configDir)).toBe(false)
      expect(paths.ensureClaudeConfigDir(configManager)).toBe(configDir)
      expect(fs.statSync(configDir).isDirectory()).toBe(true)
      expect(fs.existsSync(path.join(configDir, 'projects'))).toBe(false)
      expect(fs.existsSync(path.join(configDir, 'skills'))).toBe(false)
      expect(fs.existsSync(path.join(configDir, 'agents'))).toBe(false)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('validates and creates a writable configured Claude config root directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-claude-config-validate-'))
    const configDir = path.join(tempRoot, 'hydro-agent')

    try {
      const result = paths.validateClaudeConfigDirValue(`  ${configDir}  `)

      expect(result.configuredValue).toBe(configDir)
      expect(result.resolvedDir).toBe(configDir)
      expect(fs.statSync(configDir).isDirectory()).toBe(true)
      expect(fs.readdirSync(configDir)).toEqual([])
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects a configured Claude config root path that already exists as a file', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-claude-config-file-'))
    const configDir = path.join(tempRoot, 'hydro-agent')
    fs.writeFileSync(configDir, 'not a directory', 'utf-8')

    try {
      expect(() => paths.ensureClaudeConfigDir(fakeConfigManager(configDir))).toThrow(/not a directory/)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes MCP user/local config inside the configured Claude profile', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mcp-config-test-'))
    const configManager = fakeConfigManager(tempDir)
    const manager = new McpManager()
    manager.configManager = configManager

    try {
      manager.writeClaudeJson({ mcpServers: { demo: { command: 'node' } } })

      const expectedPath = path.join(tempDir, '.claude.json')
      expect(fs.existsSync(expectedPath)).toBe(true)
      expect(manager.listMcpUser()[0].filePath).toBe(expectedPath)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
