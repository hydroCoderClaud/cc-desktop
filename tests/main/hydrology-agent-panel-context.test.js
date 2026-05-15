import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const panelPath = path.resolve(__dirname, '../../src/renderer/pages/hydrology-workbench/agent-panel.js')

describe('hydrology agent panel context refresh', () => {
  it('deduplicates embedded agent context refresh events by serialized signature', () => {
    const source = fs.readFileSync(panelPath, 'utf-8')

    expect(source).toContain('let lastContextSignature = null')
    expect(source).toContain("const nextSignature = JSON.stringify(nextContext || null)")
    expect(source).toContain('if (!force && nextSignature === lastContextSignature)')
    expect(source).toContain("window.dispatchEvent(new CustomEvent('embedded-agent:context-changed'))")
    expect(source).toContain('return false')
    expect(source).toContain('return true')
  })

  it('does not bind agent context refresh to every workbench render', () => {
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/pages/hydrology-workbench/main.js'), 'utf-8')

    expect(mainSource).toContain('function notifyAgentContextChanged(force = false)')
    expect(mainSource).toContain('notifyAgentContextChanged(true)')
    expect(mainSource).toContain('notifyAgentContextChanged()')
    expect(mainSource).not.toContain('agentPanel?.notifyContextChanged()')
    expect(mainSource).not.toContain('function renderWorkbench() {\n  const station = getSelectedStation()\n  renderStationTree()\n  renderFunctionTabs()\n  renderHeader(station)\n  renderTabContent(station)\n  agentPanel?.notifyContextChanged()')
  })
})
