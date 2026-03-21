<template>
  <div class="notebook-file-preview">
    <!-- Header -->
    <div class="detail-header">
      <button class="detail-back-btn" @click="$emit('back')" :title="t('common.back')">
        <Icon name="chevronLeft" :size="16" />
      </button>
      <span class="detail-title">{{ item.name }}</span>
      
      <!-- Actions -->
      <div class="header-actions">
        <template v-if="type === 'source'">
          <button class="detail-external-btn" @click="$emit('open-external', item)" :title="t('notebook.source.openExternal')">
            <Icon name="externalLink" :size="16" />
          </button>
        </template>
        <template v-else-if="type === 'achievement'">
          <button class="detail-external-btn" @click="$emit('export', item)" :title="t('notebook.studio.export')">
            <Icon name="export" :size="16" />
          </button>
          <button class="detail-external-btn" @click="$emit('copy', item)" :title="t('notebook.studio.copy')">
            <Icon name="copy" :size="16" />
          </button>
          <button class="detail-external-btn danger" @click="$emit('delete', item)" :title="t('notebook.studio.delete')">
            <Icon name="delete" :size="16" />
          </button>
        </template>
      </div>
    </div>

    <!-- Metadata Section -->
    <div class="detail-summary-section">
      <div class="detail-summary-header" @click="summaryCollapsed = !summaryCollapsed">
        <Icon 
          :name="type === 'source' ? 'lightning' : getAchievementIcon(item.type)" 
          :size="14" 
          :color="type === 'source' ? '#5c6bc0' : getAchievementColor(item.type)" 
        />
        <span class="detail-summary-title">
          {{ type === 'source' ? t('notebook.source.guide') : item.name }}
        </span>
        <Icon :name="summaryCollapsed ? 'chevronDown' : 'chevronUp'" :size="14" class="summary-toggle-icon" />
      </div>
<template v-if="!summaryCollapsed">
  <!-- Source Summary -->
  <template v-if="type === 'source'">
    <p class="detail-summary-text">{{ formatSummary(item.summary) }}</p>
    <div class="detail-tags" v-if="item.tags?.length">
      <span v-for="tag in item.tags" :key="tag" class="detail-tag">{{ tag }}</span>
    </div>
  </template>

        <template v-else>
          <div class="achievement-detail-meta">
            <span>{{ t('notebook.studio.sources', { count: item.sourceCount || 0 }) }}</span>
            <span class="dot">•</span>
            <span>{{ item.time }}</span>
          </div>
          <p v-if="item.prompt" class="detail-summary-text" style="margin-top: 10px; font-style: italic; opacity: 0.8;">
            "{{ item.prompt }}"
          </p>
        </template>
      </template>
    </div>

    <!-- Content Section (Delegated to Renderers) -->
    <div class="detail-content-section" :class="{ 'has-url': type === 'source' && item.url }">
      <a v-if="type === 'source' && item.url" :href="item.url" class="detail-source-url" target="_blank">
        {{ item.url }}
      </a>

      <div class="content-container">
        <!-- Status Handling -->
        <div v-if="loading" class="preview-placeholder">
          <Icon name="loading" :size="32" class="spin" />
          <span>{{ t('common.loading') }}</span>
        </div>
        <div v-else-if="error" class="preview-placeholder">
          <Icon name="warning" :size="32" color="var(--danger-color)" />
          <span>{{ error }}</span>
        </div>

        <!-- Renderers -->
        <template v-else>
          <TextRenderer v-if="contentType === 'text'" :content="content" :type="item.type" />
          <ImageRenderer v-else-if="contentType === 'image'" :content="content" :name="item.name" />
          <PdfRenderer v-else-if="contentType === 'pdf'" :content="content" />
          <HtmlRenderer v-else-if="contentType === 'html'" :content="content" />
          <MediaRenderer v-else-if="contentType === 'audio' || contentType === 'video'" :content="content" :type="contentType" />
          <OfficeRenderer 
            v-else-if="['word', 'excel', 'pptx'].includes(contentType)" 
            :type="contentType" 
            :content="content" 
            :name="item.name"
            :meta="meta"
            @open-external="handleOpenExternal"
          />
          
          <div v-else class="preview-placeholder">
            <Icon :name="item.type === 'video' ? 'video' : 'fileText'" :size="32" />
            <span>{{ t('agent.files.cannotPreview') }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'

// Import Renderers
import TextRenderer from './renderers/TextRenderer.vue'
import ImageRenderer from './renderers/ImageRenderer.vue'
import PdfRenderer from './renderers/PdfRenderer.vue'
import MediaRenderer from './renderers/MediaRenderer.vue'
import HtmlRenderer from './renderers/HtmlRenderer.vue'
import OfficeRenderer from './renderers/OfficeRenderer.vue'

const props = defineProps({
  item: { type: Object, required: true },
  type: { type: String, default: 'source' }
})

const emit = defineEmits(['back', 'open-external', 'export', 'copy', 'delete'])

const { t } = useLocale()
const summaryCollapsed = ref(false)
const content = ref('')
const contentType = ref('text')
const meta = ref({})
const loading = ref(false)
const error = ref('')

const getNotebookId = () => props.item.notebookId || window.currentNotebookId

const loadContent = async () => {
  const notebookId = getNotebookId()
  if (!notebookId || !props.item.path) {
    content.value = props.item.content || ''
    contentType.value = 'text'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const result = await window.electronAPI.notebookReadFileContent({
      notebookId,
      relPath: props.item.path
    })
    content.value = result.content
    contentType.value = result.type
    meta.value = result.meta || {}
  } catch (err) {
    console.error('[NotebookPreview] Failed to load content:', err)
    error.value = t('messages.loadFailed')
  } finally {
    loading.value = false
  }
}

const handleOpenExternal = () => {
  if (props.item.path) {
    // 这里需要获取绝对路径并打开，或者触发外部打开事件
    emit('open-external', props.item)
  }
}

const formatSummary = (summary) => {
  if (!summary) return ''
  
  // 1. 尝试解析新版的结构化 JSON
  try {
    const data = JSON.parse(summary)
    if (data.i18nKey) {
      return t(data.i18nKey, data.params || {})
    }
  } catch (e) {
    // 不是 JSON，继续后续逻辑
  }

  // 2. 兼容旧版的硬编码英文格式： "Imported from [path] at [time]"
  const legacyRegex = /^Imported from (.*) at (.*)$/
  const match = summary.match(legacyRegex)
  if (match) {
    return t('notebook.source.importInfo', { path: match[1], time: match[2] })
  }

  return summary
}

onMounted(loadContent)
watch(() => props.item.id, loadContent)

const getAchievementIcon = (type) => {
  const map = { audio: 'audio', video: 'video', report: 'fileText', presentation: 'presentation', mindmap: 'mindmap', flashcard: 'heart', quiz: 'clipboard', infographic: 'image', table: 'table' }
  return map[type] || 'fileText'
}

const getAchievementColor = (type) => {
  const map = { audio: '#1976D2', video: '#388E3C', report: '#FFA000', presentation: '#F57C00', mindmap: '#7B1FA2', flashcard: '#C2185B', quiz: '#D84315', infographic: '#0097A7', table: '#512DA8' }
  return map[type] || 'var(--text-color-muted)'
}
</script>

<style>
@import '../notebook-shared.css';
</style>

<style scoped>
.notebook-file-preview { display: flex; flex-direction: column; height: 100%; }
.header-actions { display: flex; align-items: center; gap: 4px; }
.achievement-detail-meta { font-size: 12px; color: var(--text-color-muted); display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.dot { font-size: 8px; }
.content-container { max-height: 600px; overflow-y: auto; }
.preview-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-color-muted); font-size: 13px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
