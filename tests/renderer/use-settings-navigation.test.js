import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useSettingsNavigation', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens a temporary settings surface without touching the app mode', async () => {
    const { SettingsSection, useSettingsNavigation } = await import('../../src/renderer/composables/useSettingsNavigation.js')
    const { isSettingsOpen, openSettings, settingsRequest } = useSettingsNavigation()

    expect(isSettingsOpen.value).toBe(false)

    openSettings({
      section: SettingsSection.CHANNELS,
      context: {
        mode: 'notebook',
        cwd: 'C:\\workspace\\notebook',
        sessionAppId: 'research'
      }
    })

    expect(isSettingsOpen.value).toBe(true)
    expect(settingsRequest.value).toEqual({
      section: SettingsSection.CHANNELS,
      context: {
        mode: 'notebook',
        cwd: 'C:\\workspace\\notebook',
        sessionAppId: 'research'
      }
    })
  })

  it('updates the current section in place and returns to the underlying workspace on close', async () => {
    const { SettingsSection, useSettingsNavigation } = await import('../../src/renderer/composables/useSettingsNavigation.js')
    const { closeSettings, isSettingsOpen, openSettings, settingsRequest } = useSettingsNavigation()

    openSettings({ section: SettingsSection.MODELS, context: { mode: 'agent' } })
    openSettings({ section: SettingsSection.APPEARANCE, context: { mode: 'agent' } })

    expect(settingsRequest.value.section).toBe(SettingsSection.APPEARANCE)

    closeSettings()

    expect(isSettingsOpen.value).toBe(false)
    expect(settingsRequest.value).toBeNull()
  })
})
