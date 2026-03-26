import { ref } from 'vue'

// 模块级共享状态（Vue 3 推荐的跨组件共享 ref 方式）
const leftWidth = ref(320)
const rightWidth = ref(340)
const showLeftPanel = ref(true)
const showRightPanel = ref(true)

export function useNotebookLayout() {
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
