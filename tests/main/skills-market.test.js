import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { skillsMarketMixin } = await import('../../src/main/managers/skills/market.js')
const marketSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/main/managers/skills/market.js'),
  'utf-8'
)

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skills-market-test-'))
}

describe('skills market install', () => {
  let tempDir

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('runs npx skills add through spawn argv instead of shell exec', () => {
    expect(marketSource).toContain("const { spawn } = require('child_process')")
    expect(marketSource).not.toContain('const { exec } = require')
    expect(marketSource).not.toContain('execAsync')
    expect(marketSource).toContain("runNpxSkillsAdd(['-y', 'skills', 'add', gitUrl, '--skill', skill.id, '-g', '-a', 'claude-code']")
    expect(marketSource).toContain('windowsHide: true')
  })

  it('cleans a failed npx target directory before HTTP fallback', async () => {
    const skill = { id: 'demo-skill', version: '1.0.0' }
    const targetDir = path.join(tempDir, skill.id)
    let fallbackSawStaleDir = null

    const manager = {
      _getSkillDir: () => targetDir,
      _installViaSkillsCli: async () => {
        fs.mkdirSync(targetDir, { recursive: true })
        fs.writeFileSync(path.join(targetDir, 'stale.txt'), 'partial install')
        return { success: false, error: 'npx failed' }
      },
      _installViaHttp: async () => {
        fallbackSawStaleDir = fs.existsSync(targetDir)
        fs.mkdirSync(targetDir, { recursive: true })
        fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: Demo\n---\n')
        return { success: true, skillId: skill.id }
      }
    }

    const result = await skillsMarketMixin.installMarketSkill.call(manager, {
      registryUrl: 'https://gitee.com/example/hydroskills/raw/main',
      skill
    })

    expect(result).toEqual({ success: true, skillId: skill.id })
    expect(fallbackSawStaleDir).toBe(false)
    expect(fs.existsSync(path.join(targetDir, 'stale.txt'))).toBe(false)
    expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true)
  })
})
