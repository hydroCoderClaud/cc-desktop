<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.skills') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.skills.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.skills.search')"
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
      <div v-else-if="filteredSkills.length === 0" class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-text">{{ t('rightPanel.skills.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.skills.emptyHint') }}</div>
      </div>

      <!-- Skills List -->
      <div v-else class="skills-list">
        <div
          v-for="category in groupedSkills"
          :key="category.name"
          class="skill-category"
        >
          <div
            class="category-header"
            @click="toggleCategory(category.name)"
          >
            <span class="category-icon">{{ expandedCategories.includes(category.name) ? '▼' : '▶' }}</span>
            <span class="category-name">{{ category.name }}</span>
            <span class="category-count">({{ category.skills.length }})</span>
          </div>
          <div v-if="expandedCategories.includes(category.name)" class="category-items">
            <div
              v-for="skill in category.skills"
              :key="skill.name"
              class="skill-item"
              @click="handleInsertSkill(skill)"
            >
              <span class="skill-name">/{{ skill.name }}</span>
              <span class="skill-desc">{{ skill.description }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
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
const skills = ref([])
const expandedCategories = ref([])

// Computed
const filteredSkills = computed(() => {
  if (!searchText.value) return skills.value
  const keyword = searchText.value.toLowerCase()
  return skills.value.filter(s =>
    s.name.toLowerCase().includes(keyword) ||
    (s.description && s.description.toLowerCase().includes(keyword))
  )
})

const groupedSkills = computed(() => {
  const groups = {}
  filteredSkills.value.forEach(skill => {
    const cat = skill.category || t('rightPanel.skills.uncategorized')
    if (!groups[cat]) {
      groups[cat] = []
    }
    groups[cat].push(skill)
  })
  return Object.keys(groups).map(name => ({
    name,
    skills: groups[name]
  }))
})

// Methods
const handleRefresh = async () => {
  await loadSkills()
}

const toggleCategory = (categoryName) => {
  const index = expandedCategories.value.indexOf(categoryName)
  if (index === -1) {
    expandedCategories.value.push(categoryName)
  } else {
    expandedCategories.value.splice(index, 1)
  }
}

const handleInsertSkill = (skill) => {
  emit('insert-to-input', `/${skill.name}`)
}

const loadSkills = async () => {
  loading.value = true
  try {
    // TODO: Load skills from Claude Code
    // Mock data for now
    skills.value = []
  } catch (err) {
    console.error('Failed to load skills:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSkills()
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
  padding: 12px 16px;
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
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

/* Skills List */
.skills-list {
  padding: 8px 0;
}

.skill-category {
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

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.skill-item:hover {
  background: var(--hover-bg);
}

.skill-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color);
  font-family: monospace;
}

.skill-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
