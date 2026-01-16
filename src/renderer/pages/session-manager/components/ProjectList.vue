<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span>{{ t('sessionManager.projects') }}</span>
      <n-tag size="small">{{ projects.length }}</n-tag>
    </div>
    <n-scrollbar ref="scrollbarRef" style="max-height: calc(100vh - 220px)">
      <n-spin :show="loadingProjects">
        <div v-if="projects.length === 0 && !loadingProjects" class="empty-state">
          <n-empty :description="t('sessionManager.noProjects')" />
          <n-button size="small" @click="$emit('sync')" style="margin-top: 12px">
            {{ t('sessionManager.syncNow') }}
          </n-button>
        </div>
        <div
          v-for="project in projects"
          :key="project.id"
          :data-project-id="project.id"
          class="project-item"
          :class="{ active: selectedProject?.id === project.id }"
          @click="$emit('select', project)"
        >
          <div class="project-name">{{ project.name }}</div>
          <div class="project-meta">
            <span>{{ project.session_count || 0 }} {{ t('sessionManager.sessions') }}</span>
          </div>
        </div>
      </n-spin>
    </n-scrollbar>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  projects: {
    type: Array,
    required: true
  },
  selectedProject: {
    type: Object,
    default: null
  },
  loadingProjects: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select', 'sync'])

const scrollbarRef = ref(null)

// 滚动到选中的项目
const scrollToSelected = () => {
  if (!props.selectedProject) return

  nextTick(() => {
    const el = document.querySelector(`[data-project-id="${props.selectedProject.id}"]`)
    if (el) {
      if (scrollbarRef.value) {
        try {
          // 获取元素相对于父容器的偏移
          const offsetTop = el.offsetTop
          const elHeight = el.offsetHeight
          // 获取滚动容器高度
          const scrollbarEl = scrollbarRef.value.$el
          const containerHeight = scrollbarEl?.clientHeight || 300
          // 计算目标位置（使元素居中）
          const targetTop = offsetTop - (containerHeight / 2) + (elHeight / 2)
          scrollbarRef.value.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
        } catch (e) {
          // 回退到原生 scrollIntoView
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  })
}

defineExpose({ scrollToSelected })
</script>

<style scoped>
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-weight: 600;
  font-size: 14px;
}

.project-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.15s;
}

.project-item:hover {
  background: var(--hover-color, #f5f5f5);
}

.project-item.active {
  background: var(--primary-color-light, #e6f4ff);
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta {
  font-size: 11px;
  color: #888;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
}

:root[data-theme="dark"] .sidebar {
  background: #252525;
  border-color: #333;
}

:root[data-theme="dark"] .project-item:hover {
  background: #333;
}

:root[data-theme="dark"] .project-item.active {
  background: #2a3f4f;
}
</style>
