<template>
  <div class="image-renderer">
    <div
      ref="containerRef"
      class="preview-image-container"
      :class="containerClass"
      @wheel="handleWheel"
      @mousedown="startDrag"
    >
      <div class="image-actions">
        <span class="image-zoom-badge">{{ zoomLabel }}</span>
        <button
          class="image-action-btn"
          type="button"
          :title="t('notebook.preview.copyImage')"
          :disabled="copying"
          @mousedown.stop
          @click.stop="copyImage"
        >
          <Icon name="copy" :size="14" />
        </button>
        <button
          class="image-action-btn"
          type="button"
          :title="t('notebook.preview.fitToWindow')"
          :disabled="!canReset"
          @mousedown.stop
          @click.stop="resetView"
        >
          <Icon name="fitWindow" :size="14" />
        </button>
        <button
          class="image-action-btn"
          type="button"
          :title="t('notebook.preview.actualSize')"
          :disabled="!canSetActualSize"
          @mousedown.stop
          @click.stop="setActualSize"
        >
          <Icon name="actualSize" :size="14" />
        </button>
      </div>
      <img
        ref="imageRef"
        :src="content"
        :alt="name"
        :style="imageStyle"
        draggable="false"
        @load="handleImageLoad"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  content: { type: String, required: true },
  name: { type: String, default: '' }
})

const { t } = useLocale()
const message = useMessage()

const containerRef = ref(null)
const imageRef = ref(null)
const fitScale = ref(1)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const isDragging = ref(false)
const copying = ref(false)
const dragState = {
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
}
let resizeObserver = null

const teardownDrag = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', endDrag)
}

const isNear = (a, b) => Math.abs(a - b) < 0.001

const getViewportSize = () => {
  const container = containerRef.value
  if (!container) return { width: 0, height: 0 }
  const styles = window.getComputedStyle(container)
  const paddingX = parseFloat(styles.paddingLeft || 0) + parseFloat(styles.paddingRight || 0)
  const paddingY = parseFloat(styles.paddingTop || 0) + parseFloat(styles.paddingBottom || 0)
  return {
    width: Math.max(container.clientWidth - paddingX, 0),
    height: Math.max(container.clientHeight - paddingY, 0)
  }
}

const updateFitScale = () => {
  if (!naturalWidth.value || !naturalHeight.value) {
    fitScale.value = 1
    return
  }

  const { width, height } = getViewportSize()
  if (!width || !height) return

  const previousFitScale = fitScale.value
  fitScale.value = Math.min(1, width / naturalWidth.value, height / naturalHeight.value)

  const wasFitMode = isNear(scale.value, previousFitScale) && offsetX.value === 0 && offsetY.value === 0
  if (wasFitMode || scale.value < fitScale.value) {
    scale.value = fitScale.value
    offsetX.value = 0
    offsetY.value = 0
  }
}

const resetView = () => {
  teardownDrag()
  scale.value = fitScale.value
  offsetX.value = 0
  offsetY.value = 0
}

const setActualSize = () => {
  teardownDrag()
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

const clampScale = (nextScale) => {
  const maxScale = Math.max(5, 1)
  return Math.max(fitScale.value || 1, Math.min(maxScale, nextScale))
}

const ensureImageReady = async () => {
  const img = imageRef.value
  if (!img) {
    throw new Error('图片未就绪')
  }
  if (img.complete && (img.naturalWidth || img.width) && (img.naturalHeight || img.height)) {
    return img
  }
  await new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('图片加载失败'))
    }
    const cleanup = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
    }
    img.addEventListener('load', onLoad, { once: true })
    img.addEventListener('error', onError, { once: true })
  })
  return img
}

const handleImageLoad = () => {
  const img = imageRef.value
  if (!img) return
  naturalWidth.value = img.naturalWidth || img.width || 0
  naturalHeight.value = img.naturalHeight || img.height || 0
  nextTick(updateFitScale)
}

const zoomAroundPoint = (clientX, clientY, nextScale) => {
  const container = containerRef.value
  if (!container) {
    scale.value = nextScale
    return
  }

  const rect = container.getBoundingClientRect()
  const pointX = clientX - rect.left - rect.width / 2
  const pointY = clientY - rect.top - rect.height / 2
  const previousScale = scale.value

  scale.value = nextScale

  if (isNear(nextScale, fitScale.value)) {
    offsetX.value = 0
    offsetY.value = 0
    return
  }

  const scaleRatio = nextScale / previousScale
  offsetX.value = pointX - (pointX - offsetX.value) * scaleRatio
  offsetY.value = pointY - (pointY - offsetY.value) * scaleRatio
}

const handleWheel = (event) => {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const nextScale = clampScale(Number((scale.value + delta).toFixed(3)))
  if (isNear(nextScale, scale.value)) return
  zoomAroundPoint(event.clientX, event.clientY, nextScale)
}

const startDrag = (event) => {
  if (event.button !== 0 || scale.value <= fitScale.value || isNear(scale.value, fitScale.value)) return
  event.preventDefault()
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.originX = offsetX.value
  dragState.originY = offsetY.value
  isDragging.value = true
  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', endDrag)
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  offsetX.value = dragState.originX + event.clientX - dragState.startX
  offsetY.value = dragState.originY + event.clientY - dragState.startY
}

const endDrag = () => {
  teardownDrag()
}

const copyImage = async () => {
  if (copying.value) return
  try {
    copying.value = true
    const pngDataUrl = await toClipboardPngDataUrl()
    await window.electronAPI.notebookCopyImageToClipboard({ dataUrl: pngDataUrl })
    message.success(t('common.copied'))
  } catch (err) {
    console.error('[ImageRenderer] Copy image failed:', err)
    message.error(t('common.copyFailed'))
  } finally {
    copying.value = false
  }
}

const toClipboardPngDataUrl = async () => {
  const img = await ensureImageReady()
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) {
    throw new Error('图片尺寸无效')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建画布')
  }
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

const canReset = computed(() => !isNear(scale.value, fitScale.value) || offsetX.value !== 0 || offsetY.value !== 0)
const canSetActualSize = computed(() => !isNear(scale.value, 1) || offsetX.value !== 0 || offsetY.value !== 0)
const zoomLabel = computed(() => {
  if (isNear(scale.value, fitScale.value)) return 'Fit'
  return `${Math.round(scale.value * 100)}%`
})

const imageStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`
}))

const containerClass = computed(() => ({
  'is-zoomed': scale.value > fitScale.value && !isNear(scale.value, fitScale.value),
  'is-dragging': isDragging.value
}))

watch(() => props.content, async () => {
  teardownDrag()
  naturalWidth.value = 0
  naturalHeight.value = 0
  fitScale.value = 1
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  await nextTick()
  updateFitScale()
})

const handleWindowResize = () => {
  nextTick(updateFitScale)
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => updateFitScale())
    resizeObserver.observe(containerRef.value)
  }
  nextTick(updateFitScale)
})

onBeforeUnmount(() => {
  teardownDrag()
  window.removeEventListener('resize', handleWindowResize)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
@import '../../notebook-shared.css';

.image-renderer {
  width: 100%;
  height: 100%;
}

.preview-image-container {
  position: relative;
  width: 100%;
  min-height: 240px;
  height: min(600px, calc(100vh - 280px));
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-tertiary);
  overflow: hidden;
  cursor: default;
}

.preview-image-container.is-zoomed {
  cursor: grab;
}

.preview-image-container.is-dragging {
  cursor: grabbing;
}

.preview-image-container img {
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: transform 0.16s ease;
  transform-origin: center center;
  user-select: none;
}

.preview-image-container.is-dragging img {
  transition: none;
}

.image-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-zoom-badge {
  min-width: 44px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-color-secondary) 92%, transparent);
  color: var(--text-color-muted);
  backdrop-filter: blur(4px);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.image-action-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-color-secondary) 92%, transparent);
  color: var(--text-color-muted);
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: all 0.15s;
}

.image-action-btn:hover:not(:disabled) {
  color: var(--primary-color);
  background: var(--bg-color-secondary);
}

.image-action-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>