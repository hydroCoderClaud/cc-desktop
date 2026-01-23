<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">
        {{ t('rightPanel.tabs.commands') }} ({{ totalCount }})
        <span class="deprecated-badge">{{ t('rightPanel.commands.legacy') }}</span>
      </span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.commands.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.commands.search')"
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
      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon">⌨️</div>
        <div class="empty-text">{{ t('rightPanel.commands.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.commands.emptyHint') }}</div>
        <div class="empty-hint deprecated">{{ t('rightPanel.commands.deprecated') }}</div>
      </div>

      <!-- Commands List -->
      <div v-else class="commands-list">
        <!-- Project Commands -->
        <div v-if="filteredProjectCommands.length > 0" class="command-group">
          <div class="group-header">
            <span class="group-icon">📁</span>
            <span class="group-name">{{ t('rightPanel.commands.project') }}</span>
            <span class="group-count">({{ filteredProjectCommands.length }})</span>
          </div>
          <div class="group-items">
            <div
              v-for="cmd in filteredProjectCommands"
              :key="cmd.fullName"
              class="command-item"
              @click="handleCommandClick(cmd)"
            >
              <span class="command-name">/{{ cmd.fullName }}</span>
              <span class="command-desc">{{ cmd.description }}</span>
            </div>
          </div>
        </div>

        <!-- Global Commands -->
        <div v-if="filteredGlobalCommands.length > 0" class="command-group">
          <div class="group-header">
            <span class="group-icon">🌐</span>
            <span class="group-name">{{ t('rightPanel.commands.global') }}</span>
            <span class="group-count">({{ filteredGlobalCommands.length }})</span>
          </div>
          <div class="group-items">
            <div
              v-for="category in groupedGlobalCommands"
              :key="category.name"
              class="command-category"
            >
              <div
                class="category-header"
                @click="toggleCategory(category.name)"
              >
                <span class="category-icon">{{ expandedCategories.includes(category.name) ? '▼' : '▶' }}</span>
                <span class="category-name">{{ category.name }}</span>
                <span class="category-count">({{ category.commands.length }})</span>
              </div>
              <div v-if="expandedCategories.includes(category.name)" class="category-items">
                <div
                  v-for="cmd in category.commands"
                  :key="cmd.fullName"
                  class="command-item"
                  @click="handleCommandClick(cmd)"
                >
                  <span class="command-name">/{{ cmd.fullName }}</span>
                  <span class="command-desc">{{ cmd.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const globalCommands = ref([])
const projectCommands = ref([])
const expandedCategories = ref([])

// Computed
const totalCount = computed(() => globalCommands.value.length + projectCommands.value.length)

const matchCommand = (cmd, keyword) => {
  return cmd.name.toLowerCase().includes(keyword) ||
    cmd.fullName.toLowerCase().includes(keyword) ||
    (cmd.description && cmd.description.toLowerCase().includes(keyword))
}

const filteredGlobalCommands = computed(() => {
  if (!searchText.value) return globalCommands.value
  const keyword = searchText.value.toLowerCase()
  return globalCommands.value.filter(c => matchCommand(c, keyword))
})

const filteredProjectCommands = computed(() => {
  if (!searchText.value) return projectCommands.value
  const keyword = searchText.value.toLowerCase()
  return projectCommands.value.filter(c => matchCommand(c, keyword))
})

const groupedGlobalCommands = computed(() => {
  const groups = {}
  filteredGlobalCommands.value.forEach(cmd => {
    const cat = cmd.category || t('rightPanel.commands.uncategorized')
    if (!groups[cat]) {
      groups[cat] = []
    }
    groups[cat].push(cmd)
  })
  return Object.keys(groups).map(name => ({
    name,
    commands: groups[name]
  }))
})

// Methods
const handleRefresh = async () => {
  await loadCommands()
}

const toggleCategory = (categoryName) => {
  const index = expandedCategories.value.indexOf(categoryName)
  if (index === -1) {
    expandedCategories.value.push(categoryName)
  } else {
    expandedCategories.value.splice(index, 1)
  }
}

// 单击发送到终端
const handleCommandClick = (cmd) => {
  emit('send-command', `/${cmd.fullName}`)
}

const loadCommands = async () => {
  loading.value = true
  try {
    const projectPath = props.currentProject?.path || null
    const result = await window.electronAPI.listCommandsAll(projectPath)

    // 按 source 分离全局和项目命令
    globalCommands.value = (result || []).filter(c => c.source === 'plugin')
    projectCommands.value = (result || []).filter(c => c.source === 'project')
  } catch (err) {
    console.error('Failed to load commands:', err)
    globalCommands.value = []
    projectCommands.value = []
  } finally {
    loading.value = false
  }
}

// Watch project change
watch(() => props.currentProject, () => {
  loadCommands()
})

onMounted(() => {
  loadCommands()
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.deprecated-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--warning-bg, rgba(255, 193, 7, 0.15));
  color: var(--warning-color, #ffc107);
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

.empty-hint.deprecated {
  margin-top: 8px;
  color: var(--warning-color, #ffc107);
  opacity: 1;
}

/* Commands List */
.commands-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.command-group {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  border-bottom: 1px solid var(--border-color);
}

.group-icon {
  font-size: 14px;
}

.group-name {
  flex: 1;
}

.group-count {
  font-weight: 400;
  opacity: 0.7;
}

.group-items {
  padding: 4px 0;
}

.command-category {
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

.command-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.command-item:hover {
  background: var(--hover-bg);
}

.command-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color);
}

.command-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
