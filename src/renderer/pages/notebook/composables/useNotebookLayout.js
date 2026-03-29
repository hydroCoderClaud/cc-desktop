import { ref, watch, onUnmounted } from 'vue'

const STORAGE_KEY = 'notebook-layout-state'

/**
 * 从 sessionStorage 加载状态
 */
function loadState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

/**
 * 保存状态到 sessionStorage
 */
function saveState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota exceeded errors
  }
}

/**
 * Notebook 布局 Composable
 *
 * @param {string} notebookId - 笔记本 ID，用于隔离不同笔记本的状态
 * @returns {object} 布局状态和方法
 */
export function useNotebookLayout(notebookId) {
  const defaultState = {
    leftWidth: 320,
    rightWidth: 340,
    showLeftPanel: true,
    showRightPanel: true
  }

  // 从 sessionStorage 加载状态（per-notebook 隔离）
  const storedState = loadState()
  const notebookState = storedState?.[notebookId] || defaultState

  // 本地响应式状态（per-instance）
  const leftWidth = ref(notebookState.leftWidth)
  const rightWidth = ref(notebookState.rightWidth)
  const showLeftPanel = ref(notebookState.showLeftPanel)
  const showRightPanel = ref(notebookState.showRightPanel)

  // 状态变化时持久化
  watch([leftWidth, rightWidth, showLeftPanel, showRightPanel], () => {
    const allState = loadState() || {}
    allState[notebookId] = {
      leftWidth: leftWidth.value,
      rightWidth: rightWidth.value,
      showLeftPanel: showLeftPanel.value,
      showRightPanel: showRightPanel.value
    }
    saveState(allState)
  })

  const expandPanel = (side) => {
    const container = document.querySelector('.panels-container')
    const containerWidth = container?.offsetWidth || window.innerWidth
    const fixedOverhead = 56
    const minMiddle = 300
    const minWidth = Math.round(containerWidth / 5)
    const desiredWidth = Math.round(containerWidth * 2 / 5)

    if (side === 'left') {
      const maxLeft = containerWidth - fixedOverhead - rightWidth.value - minMiddle
      leftWidth.value = Math.min(maxLeft, Math.max(minWidth, desiredWidth))
    } else {
      const maxRight = containerWidth - fixedOverhead - leftWidth.value - minMiddle
      rightWidth.value = Math.min(maxRight, Math.max(minWidth, desiredWidth))
    }
  }

  const collapsePanel = (side) => {
    if (side === 'left') leftWidth.value = 320
    else rightWidth.value = 340
  }

  const startResize = (side, e) => {
    e.preventDefault()
    const startX = e.clientX
    const startLeft = leftWidth.value
    const startRight = rightWidth.value

    const onMove = (moveEvent) => {
      const container = document.querySelector('.panels-container')
      const containerWidth = container?.offsetWidth || window.innerWidth
      const fixedOverhead = 56
      const minMiddle = 300
      const minWidth = Math.round(containerWidth / 5)
      const delta = moveEvent.clientX - startX

      if (side === 'left') {
        const maxLeft = containerWidth - fixedOverhead - startRight - minMiddle
        leftWidth.value = Math.min(maxLeft, Math.max(minWidth, startLeft + delta))
      } else {
        const maxRight = containerWidth - fixedOverhead - startLeft - minMiddle
        rightWidth.value = Math.min(maxRight, Math.max(minWidth, startRight - delta))
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return { leftWidth, rightWidth, showLeftPanel, showRightPanel, expandPanel, collapsePanel, startResize }
}
