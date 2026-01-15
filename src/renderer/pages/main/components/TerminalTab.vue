<template>
  <div ref="containerRef" class="terminal-tab" v-show="visible">
    <div class="terminal-wrapper">
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
  isDark: {
    type: Boolean,
    default: false
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
let resizeObserver = null
let resizeTimer = null
let initialized = ref(false)

// Get terminal theme
const getTerminalTheme = () => {
  return props.isDark ? {
    background: '#0d0d0d',
    foreground: '#e8e8e8',
    cursor: '#ff6b35'
  } : {
    background: '#1a1a1a',
    foreground: '#ffffff',
    cursor: '#ff6b35'
  }
}

// Initialize terminal
const initTerminal = async () => {
  if (!window.Terminal || !terminalRef.value || initialized.value) return

  terminal = new window.Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: getTerminalTheme(),
    convertEol: true
  })

  fitAddon = new window.FitAddon.FitAddon()
  terminal.loadAddon(fitAddon)

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

  // Handle user input
  terminal.onData(data => {
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

// Write data to terminal
const write = (data) => {
  if (terminal) {
    terminal.write(data)
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

// Watch theme
watch(() => props.isDark, () => {
  if (terminal) {
    terminal.options.theme = getTerminalTheme()
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
  if (terminal) {
    terminal.dispose()
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
  border-radius: 8px;
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
  border-radius: 4px;
}

/* IME textarea 修复 - 使用 fixed 定位固定在终端左下角 */
.terminal :deep(.xterm-helper-textarea) {
  position: fixed !important;
  left: 280px !important;
  bottom: 50px !important;
  top: auto !important;
  border: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  outline: none !important;
}

/* 隐藏 xterm.js 的 IME 组合文字显示 */
.terminal :deep(.xterm-composition-view) {
  display: none !important;
}

/* 隐藏右下角的光标 */
.terminal :deep(.xterm-cursor-layer) {
  display: none !important;
}

:deep(.dark-theme) .terminal-wrapper {
  background: #0d0d0d;
}
</style>
