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
      <span class="search-icon">⌕</span>
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
        :class="{ 'drag-over': dragOverId === item.id }"
        :title="t('rightPanel.messageQueue.clickHint')"
        draggable="true"
        @click="handleSend(item)"
        @dragstart="startDrag($event, item, idx)"
        @dragover.prevent
        @dragenter.prevent="enterDrag(item)"
        @dragleave="leaveDrag(item)"
        @drop.prevent="drop(item)"
        @dragend="endDrag"
      >
        <div class="item-index">{{ getGlobalIndex(idx) }}</div>
        <span class="item-content">{{ fullHeight ? item.content : truncateContent(item.content) }}</span>
        <div class="item-actions">
          <button
            class="item-btn move-btn"
            :title="t('rightPanel.messageQueue.moveUp')"
            :disabled="getGlobalIndex(idx) === 1"
            @click.stop="moveUp(item, getGlobalIndex(idx) - 1)"
          >
            ↑
          </button>
          <button
            class="item-btn move-btn"
            :title="t('rightPanel.messageQueue.moveDown')"
            :disabled="getGlobalIndex(idx) === filteredItems.length"
            @click.stop="moveDown(item, getGlobalIndex(idx) - 1)"
          >
            ↓
          </button>
          <button
            class="item-btn edit-btn"
            :title="t('common.edit')"
            @click.stop="openEditModal(item)"
          >
            &#9998;
          </button>
          <button
            class="item-btn delete-btn"
            :title="t('common.delete')"
            @click.stop="remove(item.id)"
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
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ t('rightPanel.messageQueue.editTitle') }}</h3>
          <button class="close-btn" @click="closeEditModal">&times;</button>
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
          <button class="btn btn-secondary" @click="closeEditModal">
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
import { ref, toRef, onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useMessageQueue } from '@composables/useMessageQueue'

const { t } = useLocale()

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

// 使用 composable
const sessionUuidRef = toRef(props, 'sessionUuid')
const {
  items,
  searchKeyword,
  currentPage,
  filteredItems,
  totalPages,
  pagedItems,
  dragOverId,
  loadQueue,
  update,
  remove,
  goToPage,
  getGlobalIndex,
  refreshAndGoToLast,
  moveUp,
  moveDown,
  startDrag,
  enterDrag,
  leaveDrag,
  drop,
  endDrag
} = useMessageQueue(sessionUuidRef)

// 编辑 Modal 状态（UI 相关，保留在组件内）
const showEditModal = ref(false)
const editingItem = ref(null)
const editContent = ref('')

// Load on mount
onMounted(() => {
  if (props.sessionUuid) {
    loadQueue()
  }
})

// UI Helpers
const truncateContent = (content) => {
  const firstLine = content.split('\n')[0]
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
}

// Event Handlers
const handleSend = (item) => {
  emit('send', item.content)
}

const openEditModal = (item) => {
  editingItem.value = item
  editContent.value = item.content
  showEditModal.value = true
}

const closeEditModal = () => {
  showEditModal.value = false
  editingItem.value = null
  editContent.value = ''
}

const handleSaveEdit = async () => {
  if (!editContent.value.trim() || !editingItem.value) return
  await update(editingItem.value.id, editContent.value)
  closeEditModal()
}

// Expose methods
defineExpose({
  refresh: loadQueue,
  refreshAndGoToLast
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
  position: relative;
}

.full-height .search-box {
  margin-bottom: 12px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-muted);
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 10px 6px 28px;
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
  padding: 8px 12px 8px 32px;
  font-size: 13px;
  background: var(--bg-color);
}

.search-input:focus {
  border-color: var(--primary-color);
}

.search-input::placeholder {
  color: var(--text-color-muted);
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

.queue-item.drag-over {
  border-color: var(--primary-color);
  border-style: dashed;
  background: var(--hover-bg);
}

.queue-item[draggable="true"] {
  cursor: grab;
}

.queue-item[draggable="true"]:active {
  cursor: grabbing;
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
