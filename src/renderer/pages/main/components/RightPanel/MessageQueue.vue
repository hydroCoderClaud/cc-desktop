<template>
  <div class="message-queue" :class="{ 'full-height': fullHeight }">
    <div class="queue-header">
      <div class="header-left">
        <span class="queue-label">{{ t('rightPanel.messageQueue.label') }}</span>
        <span class="queue-count" v-if="filteredItems.length > 0">{{ filteredItems.length }}</span>
      </div>
      <!-- Pagination Controls -->
      <div class="pagination" v-if="totalPages > 1">
        <button
          class="page-btn"
          :disabled="currentPage === 1"
          :title="t('rightPanel.messageQueue.firstPage')"
          @click="goToPage(1)"
        >⟪</button>
        <button
          class="page-btn"
          :disabled="currentPage === 1"
          :title="t('rightPanel.messageQueue.prevPage')"
          @click="goToPage(currentPage - 1)"
        >‹</button>
        <span class="page-info">{{ currentPage }}/{{ totalPages }}</span>
        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          :title="t('rightPanel.messageQueue.nextPage')"
          @click="goToPage(currentPage + 1)"
        >›</button>
        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          :title="t('rightPanel.messageQueue.lastPage')"
          @click="goToPage(totalPages)"
        >⟫</button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-box">
      <input
        v-model="searchKeyword"
        type="text"
        class="search-input"
        :placeholder="t('rightPanel.messageQueue.searchPlaceholder')"
      />
    </div>

    <!-- Queue List -->
    <div class="queue-list" v-if="filteredItems.length > 0">
      <div
        v-for="(item, idx) in pagedItems"
        :key="item.id"
        class="queue-item"
        :title="t('rightPanel.messageQueue.clickHint')"
        @click="handleSend(item)"
      >
        <div class="item-index">{{ getGlobalIndex(idx) }}</div>
        <span class="item-content">{{ fullHeight ? item.content : truncateContent(item.content) }}</span>
        <div class="item-actions">
          <button
            class="item-btn move-btn"
            :title="t('rightPanel.messageQueue.moveUp')"
            :disabled="getGlobalIndex(idx) === 1"
            @click.stop="handleMoveUp(item, getGlobalIndex(idx) - 1)"
          >
            ↑
          </button>
          <button
            class="item-btn move-btn"
            :title="t('rightPanel.messageQueue.moveDown')"
            :disabled="getGlobalIndex(idx) === filteredItems.length"
            @click.stop="handleMoveDown(item, getGlobalIndex(idx) - 1)"
          >
            ↓
          </button>
          <button
            class="item-btn edit-btn"
            :title="t('common.edit')"
            @click.stop="handleEdit(item)"
          >
            &#9998;
          </button>
          <button
            class="item-btn delete-btn"
            :title="t('common.delete')"
            @click.stop="handleDelete(item)"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
    <div class="queue-empty" v-else-if="items.length === 0">
      <div class="empty-icon">📋</div>
      <div class="empty-text">{{ t('rightPanel.messageQueue.empty') }}</div>
      <div class="empty-hint">{{ t('rightPanel.quickInput.hint') }}</div>
    </div>
    <div class="queue-empty" v-else>
      {{ t('rightPanel.messageQueue.noResults') }}
    </div>

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ t('rightPanel.messageQueue.editTitle') }}</h3>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <textarea
            v-model="editContent"
            class="edit-textarea"
            rows="6"
            @keydown.ctrl.enter="handleSaveEdit"
          />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">
            {{ t('common.cancel') }}
          </button>
          <button
            class="btn btn-primary"
            :disabled="!editContent.trim()"
            @click="handleSaveEdit"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const {
  getQueue,
  updateQueueItem,
  deleteQueueItem,
  swapQueueOrder
} = window.electronAPI

const props = defineProps({
  sessionUuid: {
    type: String,
    default: ''
  },
  fullHeight: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send'])

// State
const items = ref([])
const searchKeyword = ref('')
const showEditModal = ref(false)
const editingItem = ref(null)
const editContent = ref('')
const currentPage = ref(1)
const pageSize = 10

// Computed
const filteredItems = computed(() => {
  if (!searchKeyword.value.trim()) {
    return items.value
  }
  const keyword = searchKeyword.value.toLowerCase()
  return items.value.filter(item =>
    item.content.toLowerCase().includes(keyword)
  )
})

// Pagination computed
const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize) || 1)

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredItems.value.slice(start, end)
})

// Get global index for display
const getGlobalIndex = (localIdx) => {
  return (currentPage.value - 1) * pageSize + localIdx + 1
}

// Pagination methods
const goToPage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

// Reset page when search changes
watch(searchKeyword, () => {
  currentPage.value = 1
})

// Watch sessionUuid changes
watch(() => props.sessionUuid, async (newUuid) => {
  if (newUuid) {
    await loadQueue()
  } else {
    items.value = []
  }
})

// Load on mount (for tab switching)
onMounted(() => {
  if (props.sessionUuid) {
    loadQueue()
  }
})

// Load queue
const loadQueue = async () => {
  if (!props.sessionUuid) {
    items.value = []
    return
  }
  try {
    const result = await getQueue(props.sessionUuid)
    items.value = result || []
  } catch (error) {
    console.error('Failed to load queue:', error)
    items.value = []
  }
}

// Truncate content for display
const truncateContent = (content) => {
  const firstLine = content.split('\n')[0]
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
}

// Send to terminal (click)
const handleSend = (item) => {
  emit('send', item.content)
}

// Edit item
const handleEdit = (item) => {
  editingItem.value = item
  editContent.value = item.content
  showEditModal.value = true
}

// Save edit
const handleSaveEdit = async () => {
  if (!editContent.value.trim() || !editingItem.value) return
  try {
    await updateQueueItem({
      id: editingItem.value.id,
      content: editContent.value.trim()
    })
    await loadQueue()
    closeModal()
  } catch (error) {
    console.error('Failed to update item:', error)
  }
}

// Delete item
const handleDelete = async (item) => {
  try {
    await deleteQueueItem(item.id)
    await loadQueue()
    // If current page is empty and not first page, go to previous page
    if (pagedItems.value.length === 0 && currentPage.value > 1) {
      currentPage.value = currentPage.value - 1
    }
  } catch (error) {
    console.error('Failed to delete item:', error)
  }
}

// Move item up
const handleMoveUp = async (item, index) => {
  if (index <= 0) return
  const prevItem = filteredItems.value[index - 1]
  try {
    await swapQueueOrder({ id1: item.id, id2: prevItem.id })
    await loadQueue()
  } catch (error) {
    console.error('Failed to move item:', error)
  }
}

// Move item down
const handleMoveDown = async (item, index) => {
  if (index >= filteredItems.value.length - 1) return
  const nextItem = filteredItems.value[index + 1]
  try {
    await swapQueueOrder({ id1: item.id, id2: nextItem.id })
    await loadQueue()
  } catch (error) {
    console.error('Failed to move item:', error)
  }
}

// Close modal
const closeModal = () => {
  showEditModal.value = false
  editingItem.value = null
  editContent.value = ''
}

// Expose refresh method
defineExpose({
  refresh: loadQueue
})
</script>

<style scoped>
.message-queue {
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  padding: 8px 12px;
  flex-shrink: 0;
}

/* 全高度模式 */
.message-queue.full-height {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-bottom: none;
  background: var(--bg-color-secondary);
  padding: 12px 16px;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.full-height .queue-header {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.page-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  font-size: 11px;
  color: var(--text-color-muted);
  min-width: 32px;
  text-align: center;
}

.queue-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.full-height .queue-label {
  font-size: 14px;
}

.queue-count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--primary-color);
  color: white;
}

.search-box {
  margin-bottom: 8px;
}

.full-height .search-box {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.full-height .search-input {
  padding: 8px 12px;
  font-size: 13px;
  background: var(--bg-color);
}

.search-input:focus {
  border-color: var(--primary-color);
}

.search-input::placeholder {
  color: var(--text-color-muted);
}

.queue-list {
  /* 分页模式不需要滚动 */
}

.full-height .queue-list {
  flex: 1;
}

.queue-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.full-height .queue-item {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--bg-color);
}

.queue-item:last-child {
  margin-bottom: 0;
}

.queue-item:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.item-index {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--primary-color);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  font-size: 12px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.full-height .item-content {
  font-size: 13px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.queue-item:hover .item-actions {
  opacity: 1;
}

.item-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-color-muted);
  transition: all 0.15s ease;
}

.item-btn:hover {
  background: var(--bg-color);
}

.edit-btn:hover {
  color: var(--primary-color);
}

.delete-btn:hover {
  color: #dc3545;
}

.move-btn:hover {
  color: var(--primary-color);
}

.move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.move-btn:disabled:hover {
  background: transparent;
  color: var(--text-color-muted);
}

.queue-empty {
  font-size: 11px;
  color: var(--text-color-muted);
  text-align: center;
  padding: 8px 0;
}

.full-height .queue-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--text-color-muted);
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
  color: var(--text-color-muted);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal-content {
  background: var(--bg-color);
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-color);
}

.modal-body {
  padding: 16px;
}

.edit-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.edit-textarea:focus {
  border-color: var(--primary-color);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--hover-bg);
}

.btn-primary {
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
