import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('naive-ui', () => ({
  darkTheme: {}
}))

vi.mock('@theme/claude-theme', () => ({
  claudeTheme: { common: {}, Button: {}, Input: {}, Switch: {}, Spin: {}, Dialog: {}, Message: {}, Notification: {} },
  claudeDarkTheme: { common: {}, Button: {}, Input: {}, Switch: {}, Spin: {}, Dialog: {}, Message: {}, Notification: {} }
}))

function createMockDocument({ theme = 'light', colorScheme = 'claude' } = {}) {
  const attributes = new Map([
    ['data-theme', theme],
    ['data-color-scheme', colorScheme]
  ])
  const styleStore = {}
  const style = {
    setProperty: vi.fn((key, value) => {
      styleStore[key] = value
    })
  }

  return {
    createElement: vi.fn(() => ({
      style: {},
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      appendChild: vi.fn(),
      cloneNode: vi.fn(() => ({})),
      innerHTML: ''
    })),
    createElementNS: vi.fn(() => ({
      style: {},
      setAttribute: vi.fn(),
      appendChild: vi.fn()
    })),
    createTextNode: vi.fn(() => ({})),
    createComment: vi.fn(() => ({})),
    querySelector: vi.fn(() => null),
    documentElement: {
      getAttribute: vi.fn((name) => attributes.get(name) ?? null),
      setAttribute: vi.fn((name, value) => {
        attributes.set(name, value)
      }),
      style
    },
    body: {
      style: {}
    }
  }
}

describe('useTheme', () => {
  const originalWindow = global.window
  const originalDocument = global.document

  beforeEach(() => {
    vi.resetModules()
    global.SVGElement = global.SVGElement || function SVGElement() {}
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalWindow === undefined) {
      delete global.window
    } else {
      global.window = originalWindow
    }

    if (originalDocument === undefined) {
      delete global.document
    } else {
      global.document = originalDocument
    }
  })

  it('uses preloaded color scheme as the first rendered theme state', async () => {
    global.document = createMockDocument({
      theme: 'light',
      colorScheme: 'ocean'
    })
    global.window = {}

    const { useTheme } = await import('../../src/renderer/composables/useTheme.js')
    const { colorScheme, isDark } = useTheme()

    expect(isDark.value).toBe(false)
    expect(colorScheme.value).toBe('ocean')
  })
})
