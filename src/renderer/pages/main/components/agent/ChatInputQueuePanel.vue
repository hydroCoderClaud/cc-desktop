<template>
  <div v-if="queue.length > 0" class="queue-wrapper" ref="queueWrapperRef">
    <span class="queue-badge" @click="showQueuePanel = !showQueuePanel">
      {{ queue.length }}
    </span>
    <Transition name="dropdown">
      <div v-if="showQueuePanel" class="queue-panel">
        <div class="queue-panel-header">
          <span>{{ t('agent.queueTitle') }}</span>
          <span class="queue-panel-count">{{ queue.length }}</span>
        </div>
        <div class="queue-panel-list">
          <div
            v-for="(msg, idx) in queue"
            :key="msg.id"
            class="queue-item"
            :class="{ editing: editingId === msg.id, dragging: draggingId === msg.id }"
            draggable="true"
            @dragstart="handleDragStart(idx, $event)"
            @dragover.prevent="handleDragOver($event)"
            @drop="handleDrop(idx, $event)"
            @dragend="handleDragEnd"
          >
            <Icon name="menu" :size="14" class="queue-item-drag-handle" />
            <span class="queue-item-index">{{ idx + 1 }}</span>

            <input
              v-if="editingId === msg.id"
              v-model="editingText"
              class="queue-item-input"
              @keydown.enter="saveEdit(idx)"
              @keydown.esc="cancelEdit"
              @blur="saveEdit(idx)"
              ref="editInputRef"
            />
            <span v-else class="queue-item-text" @click.stop="startEdit(msg)">
              {{ msg.text }}
            </span>

            <button class="queue-item-del" :title="t('common.delete')" @click.stop="removeFromQueue(idx)">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
        <button v-if="queue.length > 1" class="queue-clear-btn" @click="clearQueue">
          {{ t('agent.queueClearAll') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  queue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:queue'])
const { t } = useLocale()

const queueWrapperRef = ref(null)
const showQueuePanel = ref(false)
const editingId = ref(null)
const editingText = ref('')
const editInputRef = ref(null)
const draggingId = ref(null)
let dragStartIndex = null

const updateQueue = (nextQueue) => {
  emit('update:queue', nextQueue)
}

const clearQueue = () => {
  updateQueue([])
  showQueuePanel.value = false
}

const removeFromQueue = (index) => {
  const nextQueue = [...props.queue]
  nextQueue.splice(index, 1)
  updateQueue(nextQueue)
  if (nextQueue.length === 0) {
    showQueuePanel.value = false
  }
}

const startEdit = (msg) => {
  editingId.value = msg.id
  editingText.value = msg.text
  nextTick(() => {
    if (editInputRef.value) {
      editInputRef.value.focus()
      editInputRef.value.select()
    }
  })
}

const saveEdit = (index) => {
  if (editingId.value === null) return
  const text = editingText.value.trim()
  if (text) {
    const nextQueue = [...props.queue]
    nextQueue[index] = { ...nextQueue[index], text }
    updateQueue(nextQueue)
  }
  editingId.value = null
  editingText.value = ''
}

const cancelEdit = () => {
  editingId.value = null
  editingText.value = ''
}

const handleDragStart = (index, event) => {
  draggingId.value = props.queue[index].id
  dragStartIndex = index
  event.dataTransfer.effectAllowed = 'move'
}

const handleDragOver = (event) => {
  event.dataTransfer.dropEffect = 'move'
}

const handleDrop = (dropIndex, event) => {
  event.preventDefault()
  if (dragStartIndex === null || dragStartIndex === dropIndex) return

  const nextQueue = [...props.queue]
  const item = nextQueue.splice(dragStartIndex, 1)[0]
  nextQueue.splice(dropIndex, 0, item)
  updateQueue(nextQueue)
  dragStartIndex = null
}

const handleDragEnd = () => {
  draggingId.value = null
  dragStartIndex = null
}

const handleDocumentClick = (event) => {
  if (!queueWrapperRef.value?.contains(event.target)) {
    showQueuePanel.value = false
  }
}

watch(() => props.queue.length, (length) => {
  if (length === 0) {
    showQueuePanel.value = false
  }
})

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.queue-wrapper {
  position: absolute;
  right: 56px;
  bottom: 10px;
  z-index: 18;
}

.queue-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.queue-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: 320px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  box-shadow: 0 14px 28px rgb(0 0 0 / 12%);
  padding: 8px;
}

.queue-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 12px;
  color: var(--text-color-3);
}

.queue-panel-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 8px;
  background: var(--input-bg);
}

.queue-item-drag-handle,
.queue-item-del {
  color: var(--text-color-3);
}

.queue-item-index {
  font-size: 12px;
  color: var(--text-color-3);
}

.queue-item-text,
.queue-item-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-color);
}

.queue-item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}

.queue-item-input {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  padding: 4px 6px;
}

.queue-item-del,
.queue-clear-btn {
  border: none;
  background: transparent;
  cursor: pointer;
}

.queue-clear-btn {
  margin-top: 8px;
  width: 100%;
  border-radius: 8px;
  padding: 8px;
  background: var(--hover-bg);
  color: var(--text-color);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
