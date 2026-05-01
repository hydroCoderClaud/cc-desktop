import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/locales', () => ({
  locales: {
    'zh-CN': {},
    'en-US': {}
  },
  localeNames: {
    'zh-CN': '中文',
    'en-US': 'English'
  },
  defaultLocale: 'en-US'
}))

function createMockDocument() {
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
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn()
    }
  }
}

describe('useLocale', () => {
  const originalWindow = global.window
  const originalDocument = global.document

  beforeEach(() => {
    vi.resetModules()
    global.document = createMockDocument()
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

  it('uses preloaded locale as the first rendered locale state', async () => {
    global.window = {
      electronAPI: {
        bootstrap: {
          locale: 'zh-CN'
        }
      }
    }

    const { useLocale } = await import('../../src/renderer/composables/useLocale.js')
    const { locale } = useLocale()

    expect(locale.value).toBe('zh-CN')
  })
})
