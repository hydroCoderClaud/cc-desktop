<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.prompts') }}</span>
      <div class="tab-actions">
        <button
          class="icon-btn favorite-filter-btn"
          :class="{ active: showFavoritesOnly }"
          :title="showFavoritesOnly ? t('sessionManager.showAll') : t('sessionManager.showFavorites')"
          @click="toggleFavoritesFilter"
        >
          <Icon :name="showFavoritesOnly ? 'starFilled' : 'star'" :size="14" />
        </button>
        <button class="icon-btn" :title="t('rightPanel.prompts.add')" @click="handleAdd">
          <Icon name="add" :size="14" />
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchQuery"
        :placeholder="t('rightPanel.prompts.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <Icon name="search" :size="14" />
        </template>
      </n-input>

      <!-- Scope Filter -->
      <div class="scope-filter">
        <n-button-group size="tiny">
          <n-button
            :type="currentScope === 'all' ? 'primary' : 'default'"
            @click="setScope('all')"
          >
            {{ t('common.all') || '全部' }}
          </n-button>
          <n-button
            :type="currentScope === 'global' ? 'primary' : 'default'"
            @click="setScope('global')"
          >
            {{ t('rightPanel.mcp.global') }}
          </n-button>
          <n-button
            v-if="currentProject"
            :type="currentScope === 'project' ? 'primary' : 'default'"
            @click="setScope('project', currentProject.id)"
          >
            {{ t('rightPanel.mcp.project') }}
          </n-button>
        </n-button-group>
      </div>

      <!-- Tags Filter -->
      <div v-if="tags.length > 0" class="tags-filter">
        <div class="filter-label">{{ t('sessionManager.tags') }}:</div>
        <div class="tags-list">
          <button
            v-if="selectedTagIds.length > 0"
            class="tag-action-btn"
            @click="clearTagFilter"
            :title="t('common.clearAll') || '清除筛选'"
          >
            <Icon name="close" :size="12" />
          </button>
          <!-- 显示前几个标签 -->
          <span
            v-for="tag in visibleTags"
            :key="tag.id"
            class="tag-chip"
            :class="{ selected: selectedTagIds.includes(tag.id) }"
            :style="{ '--tag-color': tag.color }"
            @click="toggleTagFilter(tag.id)"
          >
            {{ tag.name }}
          </span>
          <!-- 更多标签下拉 -->
          <n-popover
            v-if="hiddenTags.length > 0"
            trigger="click"
            placement="bottom-start"
            :show-arrow="false"
          >
            <template #trigger>
              <button class="more-tags-btn">
                +{{ hiddenTags.length }}
              </button>
            </template>
            <div class="hidden-tags-panel">
              <span
                v-for="tag in hiddenTags"
                :key="tag.id"
                class="tag-chip"
                :class="{ selected: selectedTagIds.includes(tag.id) }"
                :style="{ '--tag-color': tag.color }"
                @click="toggleTagFilter(tag.id)"
              >
                {{ tag.name }}
              </span>
            </div>
          </n-popover>
          <button class="icon-btn mini" :title="t('sessionManager.manageTags')" @click="showTagManager = true">
            <Icon name="settings" :size="12" />
          </button>
        </div>
      </div>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredPrompts.length === 0" class="empty-state">
        <div class="empty-icon"><Icon name="message" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.prompts.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.prompts.emptyHint') }}</div>
        <button class="add-btn" @click="handleAdd">
          {{ t('rightPanel.prompts.addFirst') }}
        </button>
      </div>

      <!-- Prompts List -->
      <div v-else class="prompts-list">
        <div
          v-for="prompt in filteredPrompts"
          :key="prompt.id"
          class="prompt-item"
        >
          <div class="prompt-main" @click="handleInsert(prompt)">
            <div class="prompt-header">
              <span class="prompt-name">{{ prompt.name }}</span>
              <span class="prompt-scope" :class="prompt.scope">
                <Icon :name="prompt.scope === 'global' ? 'globe' : 'folder'" :size="12" />
              </span>
              <span
                class="favorite-icon"
                :class="{ active: prompt.is_favorite }"
                @click.stop="handleToggleFavorite(prompt)"
              >
                <Icon :name="prompt.is_favorite ? 'starFilled' : 'star'" :size="12" />
              </span>
            </div>
            <div class="prompt-preview">{{ prompt.content }}</div>
            <div v-if="prompt.tags && prompt.tags.length > 0" class="prompt-tags">
              <span
                v-for="tag in prompt.tags"
                :key="tag.id"
                class="tag-chip small"
                :style="{ '--tag-color': tag.color }"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>
          <div class="prompt-actions">
            <button
              class="icon-btn small"
              :title="t('rightPanel.prompts.insertToInput')"
              @click="handleInsertToInput(prompt)"
            >
              <Icon name="insertDown" :size="12" />
            </button>
            <button
              class="icon-btn small"
              :title="t('rightPanel.quickInput.addToQueue')"
              @click="handleAddToQueue(prompt)"
            >
              <Icon name="add" :size="12" />
            </button>
            <button
              class="icon-btn small"
              :title="t('common.edit')"
              @click="handleEdit(prompt)"
            >
              <Icon name="edit" :size="12" />
            </button>
            <button
              class="icon-btn small"
              :title="t('common.delete')"
              @click="handleDelete(prompt)"
            >
              <Icon name="delete" :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editingPrompt ? t('rightPanel.prompts.edit') : t('rightPanel.prompts.add')"
      style="width: 450px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('rightPanel.prompts.name')">
          <n-input
            v-model:value="formData.name"
            :placeholder="t('rightPanel.prompts.namePlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.prompts.content')">
          <n-input
            v-model:value="formData.content"
            type="textarea"
            :rows="6"
            :placeholder="t('rightPanel.prompts.contentPlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.prompts.scope')">
          <n-radio-group v-model:value="formData.scope">
            <n-radio value="global">{{ t('rightPanel.mcp.global') }}</n-radio>
            <n-radio v-if="currentProject" value="project">{{ t('rightPanel.mcp.project') }}</n-radio>
          </n-radio-group>
        </n-form-item>
        <n-form-item :label="t('sessionManager.tags')">
          <div class="form-tags">
            <span
              v-for="tag in tags"
              :key="tag.id"
              class="tag-chip"
              :class="{ selected: formData.tagIds.includes(tag.id) }"
              :style="{ '--tag-color': tag.color }"
              @click="toggleFormTag(tag.id)"
            >
              {{ tag.name }}
            </span>
            <button
              type="button"
              class="create-tag-btn"
              @click="showTagManager = true"
            >
              + {{ t('sessionManager.createTag') }}
            </button>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Tag Manager Modal -->
    <n-modal
      v-model:show="showTagManager"
      preset="card"
      :title="t('sessionManager.manageTags')"
      style="width: 400px;"
    >
      <div class="tag-manager">
        <div class="tag-form">
          <n-input
            v-model:value="newTagName"
            :placeholder="t('sessionManager.tagNamePlaceholder')"
            size="small"
            style="flex: 1;"
            @keydown.enter="handleCreateTag"
          />
          <n-color-picker
            v-model:value="newTagColor"
            :swatches="tagColors"
            size="small"
            :show-alpha="false"
            :modes="['hex']"
          />
          <n-button size="small" type="primary" @click="handleCreateTag">
            {{ t('common.add') }}
          </n-button>
        </div>
        <div class="tag-list-manager">
          <span
            v-for="tag in tags"
            :key="tag.id"
            class="tag-chip deletable"
            :style="{ '--tag-color': tag.color }"
            @click="handleDeleteTag(tag)"
          >
            {{ tag.name }}
            <span class="tag-delete-icon">×</span>
          </span>
          <div v-if="tags.length === 0" class="empty-tags">
            {{ t('sessionManager.noTagsHint') }}
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  NInput,
  NModal,
  NForm,
  NFormItem,
  NButton,
  NButtonGroup,
  NRadioGroup,
  NRadio,
  NColorPicker,
  NPopover,
  useMessage,
  useDialog
} from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { usePrompts } from '@composables/usePrompts'
import { TAG_COLORS, DEFAULT_TAG_COLOR, MAX_VISIBLE_TAGS } from '@composables/constants'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['send-command', 'insert-to-input', 'add-to-queue'])

// Use prompts composable
const {
  tags,
  loading,
  filteredPrompts,
  currentScope,
  selectedTagIds,
  searchQuery,
  showFavoritesOnly,
  loadPrompts,
  loadTags,
  createPrompt,
  updatePrompt,
  deletePrompt,
  incrementUsage,
  toggleFavorite,
  createTag,
  deleteTag,
  setScope,
  toggleFavoritesFilter
} = usePrompts()

// Local state
const showModal = ref(false)
const showTagManager = ref(false)
const editingPrompt = ref(null)
const formData = ref({
  name: '',
  content: '',
  scope: 'global',
  tagIds: []
})

// Tag manager state
const newTagName = ref('')
const newTagColor = ref(DEFAULT_TAG_COLOR)

// 可见的标签（前几个）
const visibleTags = computed(() => {
  return tags.value.slice(0, MAX_VISIBLE_TAGS)
})

// 隐藏的标签（超出部分）
const hiddenTags = computed(() => {
  return tags.value.slice(MAX_VISIBLE_TAGS)
})

// Use shared tag colors
const tagColors = TAG_COLORS

// Methods
const handleAdd = () => {
  openCreateWithContent('')
}

// Open create modal with initial content (exposed for external call)
const openCreateWithContent = (content = '') => {
  editingPrompt.value = null
  formData.value = {
    name: '',
    content: content,
    scope: currentScope.value === 'project' ? 'project' : 'global',
    tagIds: []
  }
  showModal.value = true
}

const handleEdit = async (prompt) => {
  editingPrompt.value = prompt
  formData.value = {
    name: prompt.name,
    content: prompt.content,
    scope: prompt.scope,
    tagIds: prompt.tags ? prompt.tags.map(t => t.id) : []
  }
  showModal.value = true
}

const handleDelete = async (prompt) => {
  dialog.warning({
    title: t('common.confirm'),
    content: t('rightPanel.prompts.deleteConfirm', { name: prompt.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deletePrompt(prompt.id)
        message.success(t('common.deleted'))
      } catch (err) {
        message.error(t('messages.deleteFailed'))
      }
    }
  })
}

const handleInsert = async (prompt) => {
  emit('send-command', prompt.content)
  await incrementUsage(prompt.id)
}

const handleInsertToInput = (prompt) => {
  emit('insert-to-input', prompt.content)
}

const handleAddToQueue = (prompt) => {
  emit('add-to-queue', prompt.content)
}

const handleToggleFavorite = async (prompt) => {
  try {
    await toggleFavorite(prompt.id)
  } catch (err) {
    message.error(t('messages.operationFailed'))
  }
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    message.warning(t('rightPanel.prompts.nameRequired'))
    return
  }
  if (!formData.value.content.trim()) {
    message.warning(t('rightPanel.prompts.contentRequired'))
    return
  }

  // Convert to plain object for IPC serialization
  const promptData = {
    name: formData.value.name.trim(),
    content: formData.value.content.trim(),
    scope: formData.value.scope,
    project_id: formData.value.scope === 'project' ? props.currentProject?.id : null,
    tagIds: [...formData.value.tagIds]  // Clone array
  }

  try {
    if (editingPrompt.value) {
      await updatePrompt(editingPrompt.value.id, promptData)
    } else {
      await createPrompt(promptData)
    }
    showModal.value = false
    message.success(t('common.saved'))
  } catch (err) {
    console.error('Save prompt error:', err)
    message.error(t('messages.saveFailed'))
  }
}

// Tag filter toggle
const toggleTagFilter = (tagId) => {
  const index = selectedTagIds.value.indexOf(tagId)
  if (index === -1) {
    selectedTagIds.value.push(tagId)
  } else {
    selectedTagIds.value.splice(index, 1)
  }
  loadPrompts()
}

// Clear tag filter
const clearTagFilter = () => {
  selectedTagIds.value = []
  loadPrompts()
}

// Form tag toggle
const toggleFormTag = (tagId) => {
  const index = formData.value.tagIds.indexOf(tagId)
  if (index === -1) {
    formData.value.tagIds.push(tagId)
  } else {
    formData.value.tagIds.splice(index, 1)
  }
}

// Tag management
const handleCreateTag = async () => {
  if (!newTagName.value.trim()) {
    message.warning(t('sessionManager.tagNamePlaceholder'))
    return
  }
  try {
    await createTag(newTagName.value.trim(), newTagColor.value)
    newTagName.value = ''
    message.success(t('sessionManager.tagCreateSuccess'))
  } catch (err) {
    message.error(t('messages.saveFailed'))
  }
}

const handleDeleteTag = async (tag) => {
  dialog.warning({
    title: t('common.confirm'),
    content: t('sessionManager.deleteTagConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deleteTag(tag.id)
        message.success(t('sessionManager.tagDeleteSuccess'))
      } catch (err) {
        message.error(t('messages.deleteFailed'))
      }
    }
  })
}

// Watch project change
watch(() => props.currentProject, () => {
  if (currentScope.value === 'project' && props.currentProject) {
    loadPrompts({ projectId: props.currentProject.id })
  }
})

// Initialize
onMounted(async () => {
  await loadTags()
  await loadPrompts()
})

// Expose methods for external access
defineExpose({
  openCreateWithContent
})
</script>

<style scoped>
.tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 40px;
  border-bottom: 1px solid var(--border-color);
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-filter {
  display: flex;
  justify-content: center;
}

.tags-filter {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-color-muted);
  flex-shrink: 0;
  line-height: 20px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.more-tags-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg-color-tertiary);
  color: var(--text-color-muted);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.more-tags-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
  border-color: var(--primary-color);
}

.hidden-tags-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 200px;
  padding: 4px;
}

.tag-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
  color: #f44336;
}

.tag-action-btn:hover {
  background: #f44336;
  color: white;
  border-color: #f44336;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-muted);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
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
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 16px;
}

.add-btn {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-btn:hover {
  opacity: 0.9;
}

/* Prompts List */
.prompts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.prompt-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.prompt-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.prompt-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.prompt-scope {
  font-size: 11px;
  opacity: 0.6;
}

.favorite-icon {
  font-size: 12px;
  opacity: 0.4;
  cursor: pointer;
  transition: all 0.15s ease;
}

.favorite-icon:hover,
.favorite-icon.active {
  opacity: 1;
  color: var(--primary-color);
}

.prompt-preview {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.prompt-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.prompt-item:hover .prompt-actions {
  opacity: 1;
}

/* Modal */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.create-tag-btn {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: transparent;
  color: var(--primary-color);
  border: 1px dashed var(--primary-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.create-tag-btn:hover {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

/* Tag Manager */
.tag-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tag-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tag-form :deep(.n-color-picker) {
  width: 36px !important;
}

.tag-form :deep(.n-color-picker-trigger) {
  width: 36px !important;
  padding: 0 !important;
}

.tag-form :deep(.n-color-picker-trigger__value) {
  display: none !important;
}

.tag-list-manager {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}

.empty-tags {
  text-align: center;
  padding: 24px;
  color: var(--text-color-muted);
  font-size: 13px;
  width: 100%;
}
</style>

<style>
/* Import shared tag styles (non-scoped for global application) */
@import '@styles/tag-common.css';
</style>
