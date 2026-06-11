import { describe, expect, it } from 'vitest'

describe('im-desktop-intervention', () => {
  it('uses the default label when config is missing', async () => {
    const {
      DEFAULT_DESKTOP_INTERVENTION_LABEL,
      buildDesktopInterventionText
    } = await import('../../src/main/managers/im-desktop-intervention.js')

    expect(DEFAULT_DESKTOP_INTERVENTION_LABEL).toBe('桌面端介入')
    expect(buildDesktopInterventionText(null, {
      userContent: '桌面继续追问',
      fullText: '这是桌面继续回复'
    })).toBe('桌面端介入：\n> 桌面继续追问\n\n这是桌面继续回复')
  })

  it('prefers custom config labels and trims trailing punctuation', async () => {
    const {
      normalizeDesktopInterventionLabel,
      resolveDesktopInterventionLabel,
      buildDesktopInterventionText
    } = await import('../../src/main/managers/im-desktop-intervention.js')

    expect(normalizeDesktopInterventionLabel(' 来自电脑：> ')).toBe('来自电脑')
    expect(resolveDesktopInterventionLabel({
      imCommon: {
        desktopInterventionLabel: '来自电脑：'
      }
    })).toBe('来自电脑')
    expect(buildDesktopInterventionText({
      imCommon: {
        desktopInterventionLabel: '来自电脑：'
      }
    }, {
      userContent: '桌面继续追问',
      fullText: '这是桌面继续回复'
    })).toBe('来自电脑：\n> 桌面继续追问\n\n这是桌面继续回复')
  })
})
