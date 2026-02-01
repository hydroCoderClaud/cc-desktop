<template>
  <div ref="containerRef" class="terminal-tab" v-show="visible">
    <div class="terminal-wrapper" :style="{ background: darkBackground ? '#0d0d0d' : '#f8f8f5' }">
      <div ref="terminalRef" class="terminal"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

// Props
const props = defineProps({
  sessionId: {
    type: String,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  },
  fontSize: {
    type: Number,
    default: 14
  },
  fontFamily: {
    type: String,
    default: '"Ubuntu Mono", monospace'
  },
  cursorColor: {
    type: String,
    default: '#FF6B35'
  },
  darkBackground: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits(['ready', 'data'])

// Refs
const containerRef = ref(null)
const terminalRef = ref(null)

// Terminal instance
let terminal = null
let fitAddon = null
let webglAddon = null  // 保存 WebGL addon 引用
let resizeObserver = null
let resizeTimer = null
let initialized = ref(false)

// Get terminal theme (根据 darkBackground 设置)
const getTerminalTheme = () => {
  return props.darkBackground ? {
    // 深色背景
    background: '#0d0d0d',
    foreground: '#e8e8e8',
    cursor: props.cursorColor,
    selectionBackground: 'rgba(255, 255, 255, 0.2)'
  } : {
    // 浅色背景
    background: '#f8f8f5',
    foreground: '#2d2d2d',
    cursor: props.cursorColor,
    selectionBackground: 'rgba(0, 0, 0, 0.15)'
  }
}

// Initialize terminal
const initTerminal = async () => {
  if (!window.Terminal || !terminalRef.value || initialized.value) return

  terminal = new window.Terminal({
    cursorBlink: true,
    fontSize: props.fontSize,
    fontFamily: props.fontFamily,
    lineHeight: 1.2,
    theme: getTerminalTheme(),
    convertEol: true,
    allowProposedApi: true  // WebGL addon 需要
  })

  fitAddon = new window.FitAddon.FitAddon()
  terminal.loadAddon(fitAddon)

  // 优先使用 Canvas 渲染器（WebGL 在某些情况下有渲染问题）
  if (window.CanvasAddon) {
    try {
      terminal.loadAddon(new window.CanvasAddon.CanvasAddon())
      console.log('[Terminal] Using Canvas renderer')
    } catch (e) {
      console.warn('[Terminal] Canvas failed, using DOM renderer:', e)
    }
  }

  if (window.WebLinksAddon) {
    // 自定义链接处理：使用系统默认浏览器打开
    const webLinksAddon = new window.WebLinksAddon.WebLinksAddon((event, uri) => {
      event.preventDefault()
      if (window.electronAPI) {
        window.electronAPI.openExternal(uri)
      }
    })
    terminal.loadAddon(webLinksAddon)
  }

  terminal.open(terminalRef.value)

  // 阻止默认的 paste 事件（避免重复粘贴）
  terminalRef.value.addEventListener('paste', (e) => {
    e.preventDefault()
  })

  // 右键菜单：有选中时复制+粘贴，无选中时粘贴
  terminalRef.value.addEventListener('contextmenu', handleContextMenu)

  // Handle user input
  terminal.onData(data => {
    // 用户输入时滚动到底部，确保能看到输入行
    terminal.scrollToBottom()
    if (window.electronAPI) {
      window.electronAPI.writeActiveSession({
        sessionId: props.sessionId,
        data
      })
    }
  })

  // Handle Ctrl+C copy and Ctrl+V paste
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true

    // Ctrl+C: Copy if has selection, otherwise send SIGINT
    if (event.ctrlKey && event.key === 'c') {
      const selection = terminal.getSelection()
      if (selection) {
        event.preventDefault()
        event.stopPropagation()
        handleCopy(selection)
        return false  // Prevent sending SIGINT when copying
      }
      // No selection, allow default SIGINT behavior
      return true
    }

    // Ctrl+V: Paste from clipboard
    if (event.ctrlKey && event.key === 'v') {
      event.preventDefault()
      event.stopPropagation()
      handlePaste()
      return false
    }

    return true
  })

  // Initial fit - 等待 DOM 完全渲染
  await nextTick()
  // 使用 requestAnimationFrame 确保浏览器完成布局计算
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (fitAddon && terminal) {
        fitAddon.fit()
        const { cols, rows } = terminal
        if (window.electronAPI) {
          window.electronAPI.resizeActiveSession({
            sessionId: props.sessionId,
            cols,
            rows
          })
        }
        // 自动聚焦终端
        terminal.focus()
      }
    }, 50)
  })

  initialized.value = true
  emit('ready', { sessionId: props.sessionId })
}

// 检测用户是否在终端底部
const isAtBottom = () => {
  if (!terminal) return true
  const buffer = terminal.buffer.active
  // viewportY === baseY 表示视口在最底部
  return buffer.viewportY === buffer.baseY
}

// Write data to terminal
const write = (data) => {
  if (terminal) {
    // 先检测用户是否在底部
    const wasAtBottom = isAtBottom()
    terminal.write(data)
    // 仅当用户之前在底部时才自动滚动，避免打断用户查看历史
    if (wasAtBottom) {
      terminal.scrollToBottom()
    }
  }
}

// Clear terminal
const clear = () => {
  if (terminal) {
    terminal.clear()
  }
}

// Resize terminal
const fit = () => {
  if (fitAddon && terminal && props.visible) {
    try {
      fitAddon.fit()
      const { cols, rows } = terminal
      if (cols > 0 && rows > 0 && window.electronAPI) {
        window.electronAPI.resizeActiveSession({
          sessionId: props.sessionId,
          cols,
          rows
        })
      }
    } catch (e) {
      console.warn('Terminal fit error:', e)
    }
  }
}

// Focus terminal
const focus = () => {
  if (terminal) {
    terminal.focus()
  }
}

// Handle copy to clipboard
const handleCopy = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    // 复制后清除选区
    if (terminal) {
      terminal.clearSelection()
    }
  } catch (err) {
    console.warn('Failed to copy:', err)
  }
}

// Handle paste from clipboard
const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText()
    if (text && window.electronAPI) {
      window.electronAPI.writeActiveSession({
        sessionId: props.sessionId,
        data: text
      })
    }
  } catch (err) {
    console.warn('Failed to paste:', err)
  }
}

// Handle right-click context menu (Claude Code style)
// - With selection: copy + paste
// - Without selection: paste only
const handleContextMenu = async (event) => {
  event.preventDefault()
  if (!terminal) return

  const selection = terminal.getSelection()
  if (selection) {
    // 有选中文字：先复制，再粘贴
    await handleCopy(selection)
    await handlePaste()
  } else {
    // 没有选中文字：直接粘贴
    await handlePaste()
  }
}

// Handle resize
const handleResize = () => {
  if (props.visible) {
    fit()
  }
}

// Watch visibility
watch(() => props.visible, async (newVal) => {
  if (newVal && !initialized.value) {
    await nextTick()
    initTerminal()
  } else if (newVal) {
    await nextTick()
    fit()
    // 切换到此 tab 时自动聚焦
    if (terminal) {
      terminal.focus()
    }
  }
})

// Watch terminal background
watch(() => props.darkBackground, () => {
  if (terminal) {
    terminal.options.theme = getTerminalTheme()
  }
})

// Watch cursor color
watch(() => props.cursorColor, () => {
  if (terminal) {
    terminal.options.theme = getTerminalTheme()
  }
})

// Watch font size
watch(() => props.fontSize, (newSize) => {
  if (terminal) {
    terminal.options.fontSize = newSize
    fit()  // 重新适配大小
  }
})

// Watch font family
watch(() => props.fontFamily, (newFamily) => {
  if (terminal) {
    terminal.options.fontFamily = newFamily
    fit()  // 重新适配大小
  }
})

// Lifecycle
onMounted(async () => {
  window.addEventListener('resize', handleResize)

  // 使用 ResizeObserver 监听容器大小变化（带防抖）
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (props.visible && initialized.value) {
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => fit(), 50)
      }
    })
    resizeObserver.observe(containerRef.value)
  }

  if (props.visible) {
    await nextTick()
    initTerminal()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  clearTimeout(resizeTimer)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  // 先 dispose WebGL addon，再 dispose terminal
  if (webglAddon) {
    try {
      webglAddon.dispose()
    } catch (e) {
      // 忽略 WebGL dispose 错误
    }
    webglAddon = null
  }
  if (terminal) {
    try {
      terminal.dispose()
    } catch (e) {
      // 忽略 terminal dispose 错误
    }
    terminal = null
  }
})

// Expose methods
defineExpose({
  write,
  clear,
  fit,
  focus,
  initialized
})
</script>

<style scoped>
.terminal-tab {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden !important;
}

.terminal-wrapper {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  overflow: hidden !important;
}

.terminal {
  width: 100%;
  height: 100%;
  overflow: hidden !important;
}

/* xterm.js 内部样式覆盖 - 防止 IME 导致的滚动 */
.terminal :deep(.xterm) {
  height: 100%;
  overflow: hidden !important;
}

.terminal :deep(.xterm-screen) {
  overflow: hidden !important;
}

.terminal :deep(.xterm-helpers) {
  overflow: hidden !important;
}

.terminal :deep(.xterm-viewport) {
  overflow-y: scroll !important;
}

/* IME textarea 固定在左下角 */
.terminal :deep(.xterm-helper-textarea) {
  position: fixed !important;
  left: 280px !important;
  bottom: 80px !important;
  top: auto !important;
  transform: none !important;
}
</style>
