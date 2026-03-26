<template>
  <div class="notebook-file-preview">
    <!-- Header -->
    <div class="detail-header">
      <button class="detail-back-btn" @click="handleBack" :title="t('common.back')">
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
          <button class="detail-external-btn" @click="handleOpenExternal" :title="t('common.openInSystem')">
            <Icon name="externalLink" :size="16" />
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
          {{ type === 'source' ? t('notebook.source.guide') : t('notebook.studio.summaryTitle') }}
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
            <div class="achievement-detail-top">
              <div v-if="item.absolutePath" class="achievement-detail-row achievement-detail-path-row">
                <span class="achievement-detail-label">{{ t('notebook.studio.pathLabel') }}</span>
                <span class="achievement-detail-value path" :title="item.absolutePath">{{ item.absolutePath }}</span>
              </div>
              <div class="achievement-detail-row achievement-detail-time-row">
                <span class="achievement-detail-label">{{ t('notebook.studio.timeLabel') }}</span>
                <span class="achievement-detail-value">{{ item.time }}</span>
              </div>
            </div>
            <div class="achievement-detail-bottom">
              <div class="achievement-detail-row achievement-detail-sources-row">
                <span class="achievement-detail-label">{{ t('notebook.studio.sourcesLabel') }}</span>
                <div class="achievement-detail-sources-block">
                  <span class="achievement-detail-sources-count">{{ t('notebook.studio.sources', { count: item.sourceCount || 0 }) }}</span>
                  <div class="achievement-detail-source-list" :title="fullSourceNamesText">
                    <span class="achievement-detail-source-primary">{{ primarySourceName }}</span>
                    <button
                      v-if="hasMoreSources"
                      class="achievement-detail-source-more"
                      @click="sourcesExpanded = !sourcesExpanded"
                    >
                      {{ sourcesExpanded ? t('common.collapse') : t('common.expand') }}
                    </button>
                  </div>
                  <div v-if="sourcesExpanded && hasMoreSources" class="achievement-detail-source-extra">
                    {{ extraSourceNamesText }}
                  </div>
                </div>
              </div>
            </div>
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
          <TextRenderer
            v-if="contentType === 'text'"
            :content="editableContent"
            :type="item.type"
            :editable="isTextEditable"
            :dirty="isTextDirty"
            :saving="savingText"
            :save-success="saveSuccess"
            @update:content="editableContent = $event"
            @save="handleSaveText"
            @cancel="handleCancelEdit"
          />
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
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
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
  type: { type: String, default: 'source' },
  notebookId: { type: String, default: null }
})

const emit = defineEmits(['back', 'open-external', 'export'])

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()
const summaryCollapsed = ref(false)
const sourcesExpanded = ref(false)
const content = ref('')
const editableContent = ref('')
const originalContent = ref('')
const contentType = ref('text')
const meta = ref({})
const loading = ref(false)
const savingText = ref(false)
const saveSuccess = ref(false)
const error = ref('')

const isTextEditable = computed(() => {
  if (contentType.value !== 'text') return false
  return !!props.item?.path
})

const isTextDirty = computed(() => editableContent.value !== originalContent.value)

const getNotebookId = () => props.notebookId || props.item.notebookId || window.currentNotebookId

const fullSourceNamesText = computed(() => {
  const names = props.item.sourceNames || []
  if (names.length) return names.join('、')
  return t('notebook.studio.sources', { count: props.item.sourceCount || 0 })
})

const primarySourceName = computed(() => {
  const names = props.item.sourceNames || []
  if (names.length) return names[0]
  return t('notebook.studio.sources', { count: props.item.sourceCount || 0 })
})

const hasMoreSources = computed(() => {
  const names = props.item.sourceNames || []
  return names.length > 1
})

const extraSourceNamesText = computed(() => {
  const names = props.item.sourceNames || []
  return names.slice(1).join('、')
})

const loadContent = async () => {
  const notebookId = getNotebookId()
  if (!notebookId || !props.item.path) {
    content.value = props.item.content || ''
    editableContent.value = content.value
    originalContent.value = content.value
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
    editableContent.value = result.content
    originalContent.value = result.content
    saveSuccess.value = false
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

const handleSaveText = async () => {
  const notebookId = getNotebookId()
  if (!notebookId || !props.item?.path || !isTextEditable.value || savingText.value) return
  try {
    savingText.value = true
    await window.electronAPI.notebookWriteFileContent({
      notebookId,
      relPath: props.item.path,
      content: editableContent.value
    })
    content.value = editableContent.value
    originalContent.value = editableContent.value
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 1500)
  } catch (err) {
    console.error('[NotebookPreview] Failed to save text:', err)
    message.error(t('notebook.textEditor.saveFailed', { error: err.message }))
  } finally {
    savingText.value = false
  }
}

const handleCancelEdit = () => {
  editableContent.value = originalContent.value
}

const handleBack = () => {
  if (isTextEditable.value && isTextDirty.value) {
    dialog.warning({
      title: t('common.confirm'),
      content: t('notebook.textEditor.discardConfirm'),
      positiveText: t('common.confirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => emit('back')
    })
    return
  }
  emit('back')
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
watch(() => props.item.id, () => {
  sourcesExpanded.value = false
  editableContent.value = ''
  originalContent.value = ''
  saveSuccess.value = false
  loadContent()
})

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
.achievement-detail-meta { display: flex; flex-direction: column; gap: 10px; }
.achievement-detail-top,
.achievement-detail-bottom { display: flex; flex-direction: column; gap: 8px; }
.achievement-detail-row { display: flex; align-items: flex-start; gap: 10px; }
.achievement-detail-label { flex-shrink: 0; width: 64px; font-size: 12px; color: var(--text-color-muted); }
.achievement-detail-value { font-size: 12px; color: var(--text-color); line-height: 1.5; word-break: break-all; }
.achievement-detail-value.path { opacity: 0.88; }
.achievement-detail-sources-block { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.achievement-detail-sources-count { font-size: 12px; color: var(--text-color-muted); }
.achievement-detail-source-list { display: flex; align-items: center; gap: 8px; min-width: 0; }
.achievement-detail-source-primary { font-size: 12px; color: var(--text-color); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.achievement-detail-source-more { border: none; background: transparent; color: var(--primary-color); cursor: pointer; padding: 0; font-size: 12px; flex-shrink: 0; }
.achievement-detail-source-extra { font-size: 12px; color: var(--text-color-muted); line-height: 1.5; word-break: break-word; }
.dot { font-size: 8px; }
.content-container { max-height: 600px; overflow-y: auto; }
.preview-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-color-muted); font-size: 13px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
