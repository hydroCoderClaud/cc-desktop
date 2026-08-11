import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mcpGroupPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/RightPanel/mcp/MCPGroup.vue')
const mcpTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/RightPanel/tabs/MCPTab.vue')
const mcpEditModalPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/RightPanel/mcp/MCPEditModal.vue')
const mcpEnvConfigModalPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/RightPanel/tabs/skills/McpEnvConfigModal.vue')
const componentMarketModalPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/RightPanel/tabs/skills/ComponentMarketModal.vue')

describe('MCP permission toggle UI', () => {
  it('renders one global permission button whose action follows the current permission state', () => {
    const groupSource = fs.readFileSync(mcpGroupPath, 'utf-8').replace(/\r\n/g, '\n')
    const tabSource = fs.readFileSync(mcpTabPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(groupSource).toContain("server.globalPermissionAllowed ? 'revokeGlobal' : 'allowGlobal'")
    expect(groupSource).toContain("server.globalPermissionAllowed ? 'lock' : 'unlock'")
    expect(groupSource).not.toContain("@click.stop=\"$emit('allowGlobal', server)\"><Icon name=\"unlock\"")
    expect(groupSource).not.toContain("@click.stop=\"$emit('revokeGlobal', server)\"><Icon name=\"lock\"")

    expect(tabSource).toContain('const hasGlobalMcpPermission = (allowRules, serverName) => {')
    expect(tabSource).toContain('window.electronAPI.getClaudePermissions({ scope: \'global\' })')
    expect(tabSource).toContain('mcpData.value = markGlobalPermissions(result, allowRules)')
  })

  it('offers explicit default-on wildcard permission grant after manual or market MCP install', () => {
    const editModalSource = fs.readFileSync(mcpEditModalPath, 'utf-8').replace(/\r\n/g, '\n')
    const envConfigSource = fs.readFileSync(mcpEnvConfigModalPath, 'utf-8').replace(/\r\n/g, '\n')
    const marketModalSource = fs.readFileSync(componentMarketModalPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(editModalSource).toContain('v-if="!readonly && !isEdit"')
    expect(editModalSource).toContain('v-model:checked="autoAllowGlobal"')
    expect(editModalSource).toContain('window.electronAPI.addClaudePermission')
    expect(editModalSource).toContain('`mcp__${name}__*`')

    expect(envConfigSource).toContain('v-if="showAutoAllow"')
    expect(envConfigSource).toContain('v-model:checked="autoAllowGlobal"')
    expect(envConfigSource).toContain('autoAllowGlobal: props.showAutoAllow ? autoAllowGlobal.value : false')

    expect(marketModalSource).toContain(':show-auto-allow="pendingMcpAction !== \'update\'"')
    expect(marketModalSource).toContain('const grantGlobalWildcardPermissions = async (serverNames) => {')
    expect(marketModalSource).toContain('window.electronAPI.addClaudePermission')
  })
})
