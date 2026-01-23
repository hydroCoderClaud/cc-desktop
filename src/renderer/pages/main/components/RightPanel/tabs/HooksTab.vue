<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.hooks') }} ({{ hooks.length }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.hooks.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.hooks.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <span>⌕</span>
        </template>
      </n-input>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredHooks.length === 0" class="empty-state">
        <div class="empty-icon">🪝</div>
        <div class="empty-text">{{ t('rightPanel.hooks.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.hooks.emptyHint') }}</div>
      </div>

      <!-- Hooks List -->
      <div v-else class="hooks-list">
        <div
          v-for="category in groupedHooks"
          :key="category.name"
          class="hook-category"
        >
          <div
            class="category-header"
            @click="toggleCategory(category.name)"
          >
            <span class="category-icon">{{ expandedCategories.includes(category.name) ? '▼' : '▶' }}</span>
            <span class="category-name">{{ category.name }}</span>
            <span class="category-count">({{ category.hooks.length }})</span>
          </div>
          <div v-if="expandedCategories.includes(category.name)" class="category-items">
            <div
              v-for="hook in category.hooks"
              :key="hook.id"
              class="hook-item"
              :class="{ 'has-file': hook.filePath }"
              @click="handleOpenHook(hook)"
            >
              <div class="hook-header">
                <span class="hook-name">{{ getHookDisplayName(hook) }}</span>
                <span class="hook-event">{{ hook.event }}</span>
              </div>
              <div class="hook-desc">
                <span v-if="hook.matcher" class="hook-matcher">{{ hook.matcher }}</span>
                <span v-if="hook.command" class="hook-command">{{ hook.command }}</span>
              </div>
              <div v-if="hook.source" class="hook-source">
                {{ hook.category || hook.source }}
                <span v-if="hook.filePath" class="edit-hint">📝</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Hook Modal -->
    <n-modal
      v-model:show="showEditModal"
      preset="card"
      :title="t('rightPanel.hooks.editHook')"
      style="width: 600px"
    >
      <n-form v-if="editingHook">
        <n-form-item :label="t('rightPanel.hooks.event')">
          <n-input v-model:value="editingHook.event" readonly disabled />
        </n-form-item>
        <n-form-item :label="t('rightPanel.hooks.matcher')">
          <n-input
            v-model:value="editingHook.matcher"
            :placeholder="t('rightPanel.hooks.matcherPlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.hooks.type')">
          <n-select
            v-model:value="editingHook.type"
            :options="typeOptions"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.hooks.command')">
          <n-input
            v-model:value="editingHook.command"
            type="textarea"
            :rows="4"
            :placeholder="t('rightPanel.hooks.commandPlaceholder')"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showEditModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleSaveHook">{{ t('common.save') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NInput, NModal, NForm, NFormItem, NButton, NSelect, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

// Type options for select
const typeOptions = [
  { label: 'Command', value: 'command' },
  { label: 'Bash', value: 'bash' },
  { label: 'Block', value: 'block' }
]

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const hooks = ref([])
const expandedCategories = ref([])
const showEditModal = ref(false)
const editingHook = ref(null)
const originalHookData = ref(null)

// Computed
const filteredHooks = computed(() => {
  if (!searchText.value) return hooks.value
  const keyword = searchText.value.toLowerCase()
  return hooks.value.filter(h =>
    h.name.toLowerCase().includes(keyword) ||
    h.event.toLowerCase().includes(keyword) ||
    (h.description && h.description.toLowerCase().includes(keyword))
  )
})

const groupedHooks = computed(() => {
  const groups = {}
  filteredHooks.value.forEach(hook => {
    // 按事件类型分组
    const cat = hook.event || t('rightPanel.hooks.uncategorized')
    if (!groups[cat]) {
      groups[cat] = []
    }
    groups[cat].push(hook)
  })
  return Object.keys(groups).map(name => ({
    name,
    hooks: groups[name]
  }))
})

// Methods
const handleRefresh = async () => {
  await loadHooks()
}

const toggleCategory = (categoryName) => {
  const index = expandedCategories.value.indexOf(categoryName)
  if (index === -1) {
    expandedCategories.value.push(categoryName)
  } else {
    expandedCategories.value.splice(index, 1)
  }
}

const getHookDisplayName = (hook) => {
  // 尝试从 matcher 或 command 提取名称
  if (hook.matcher) {
    // 匹配器可能包含有用信息
    const match = hook.matcher.match(/["']([^"']+)["']/)
    if (match) return match[1]
  }
  return hook.type || 'Hook'
}

const handleOpenHook = async (hook) => {
  if (!hook.filePath) {
    console.warn('Hook has no file path')
    return
  }

  try {
    // 读取配置文件
    const result = await window.electronAPI.readJsonFile(hook.filePath)
    if (!result.success) {
      message.error(t('rightPanel.hooks.readFailed'))
      console.error('Failed to read hook file:', result.error)
      return
    }

    // 保存原始数据用于保存时使用
    originalHookData.value = {
      filePath: hook.filePath,
      fullData: result.data,
      hook: hook
    }

    // 编辑当前 hook
    editingHook.value = {
      event: hook.event,
      matcher: hook.matcher,
      type: hook.type,
      command: hook.command
    }

    showEditModal.value = true
  } catch (err) {
    console.error('Failed to open hook:', err)
    message.error(t('rightPanel.hooks.readFailed'))
  }
}

const handleSaveHook = async () => {
  if (!editingHook.value || !originalHookData.value) return

  try {
    const { filePath, fullData, hook } = originalHookData.value

    // 深拷贝 fullData 以避免修改原始对象，并确保可序列化
    const updatedData = JSON.parse(JSON.stringify(fullData))

    // 更新配置数据
    const hooksConfig = updatedData.hooks || updatedData
    const eventHandlers = hooksConfig[hook.event]

    if (!Array.isArray(eventHandlers)) {
      message.error(t('rightPanel.hooks.saveFailed'))
      return
    }

    // 查找要更新的 handler（通过 matcher 和 command 匹配）
    const handlerIndex = eventHandlers.findIndex(h =>
      (h.matcher || '') === (hook.matcher || '') &&
      ((h.hooks?.[0]?.command || h.command || '') === (hook.command || ''))
    )

    if (handlerIndex === -1) {
      message.error(t('rightPanel.hooks.hookNotFound'))
      return
    }

    // 更新 handler
    const handler = eventHandlers[handlerIndex]
    handler.matcher = editingHook.value.matcher

    if (handler.hooks && handler.hooks[0]) {
      handler.hooks[0].type = editingHook.value.type
      handler.hooks[0].command = editingHook.value.command
    } else {
      handler.type = editingHook.value.type
      handler.command = editingHook.value.command
    }

    // 写入文件
    const writeResult = await window.electronAPI.writeJsonFile(filePath, updatedData)
    if (!writeResult.success) {
      message.error(t('rightPanel.hooks.saveFailed'))
      console.error('Failed to write hook file:', writeResult.error)
      return
    }

    message.success(t('common.saved'))
    showEditModal.value = false

    // 重新加载
    await loadHooks()
  } catch (err) {
    console.error('Failed to save hook:', err)
    message.error(t('rightPanel.hooks.saveFailed'))
  }
}

const loadHooks = async () => {
  loading.value = true
  try {
    // 从已安装的插件中加载 Hooks
    const result = await window.electronAPI.listHooksGlobal()
    hooks.value = result || []

    // 自动展开有内容的分类
    if (hooks.value.length > 0) {
      const categories = [...new Set(hooks.value.map(h => h.event || t('rightPanel.hooks.uncategorized')))]
      expandedCategories.value = categories
    }
  } catch (err) {
    console.error('Failed to load hooks:', err)
    hooks.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHooks()
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
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.tab-toolbar {
  margin-top: 12px;
  padding: 0 12px 12px 12px;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-color-muted);
  font-size: 14px;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
}

/* Hooks List */
.hooks-list {
  padding: 8px 0;
}

.hook-category {
  margin-bottom: 4px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: background 0.15s ease;
}

.category-header:hover {
  background: var(--hover-bg);
}

.category-icon {
  font-size: 10px;
  width: 12px;
}

.category-count {
  font-weight: 400;
  opacity: 0.7;
}

.category-items {
  padding: 0 8px;
}

.hook-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  margin: 2px 0;
  border-radius: 4px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}

.hook-item.has-file {
  cursor: pointer;
}

.hook-item.has-file:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.hook-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.hook-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.hook-event {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--primary-color);
  color: white;
  border-radius: 3px;
  white-space: nowrap;
}

.hook-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  line-height: 1.4;
}

.hook-source {
  font-size: 10px;
  color: var(--text-color-muted);
  opacity: 0.7;
  font-style: italic;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-hint {
  font-size: 12px;
  opacity: 0.6;
}

.hook-matcher,
.hook-command {
  display: block;
  font-size: 10px;
  color: var(--text-color-muted);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Edit Modal */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
