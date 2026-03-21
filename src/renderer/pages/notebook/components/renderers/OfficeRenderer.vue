<template>
  <div class="office-renderer">
    <!-- Word Renderer -->
    <div v-if="type === 'word'" class="word-container" v-html="content"></div>

    <!-- Excel Renderer -->
    <div v-else-if="type === 'excel'" class="excel-container">
      <div class="excel-toolbar" v-if="sheetNames.length > 1">
        <span class="sheet-label">Sheets:</span>
        <span
          v-for="name in sheetNames"
          :key="name"
          class="sheet-tab"
          :class="{ active: currentSheet === name }"
          @click="currentSheet = name"
        >{{ name }}</span>
      </div>
      <div class="table-wrapper">
        <table class="excel-table">
          <tr v-for="(row, rowIndex) in currentSheetData" :key="rowIndex">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- PPT / Placeholder Renderer -->
    <div v-else class="office-placeholder">
      <div class="placeholder-icon">
        <Icon :name="type === 'pptx' ? 'presentation' : 'fileText'" :size="48" />
      </div>
      <div class="placeholder-text">
        <h3>{{ name }}</h3>
        <p>{{ t('notebook.studio.cannotPreviewOffice') }}</p>
        <button class="open-btn" @click="$emit('open-external')">{{ t('common.openInSystem') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  type: { type: String, required: true }, // 'word' | 'excel' | 'pptx'
  content: { type: String, default: '' },
  name: { type: String, default: '' },
  meta: { type: Object, default: () => ({}) }
})

defineEmits(['open-external'])

const { t } = useLocale()

// 解析所有 sheet 数据
const sheetsData = computed(() => {
  if (props.type !== 'excel' || !props.content) return {}
  try {
    return JSON.parse(props.content)
  } catch (e) {
    console.error('[OfficeRenderer] Parse error:', e)
    return {}
  }
})

// sheet 名称列表
const sheetNames = computed(() => {
  return props.meta?.sheetNames || []
})

// 当前选中的 sheet（手动切换时记录）
const currentSheet = ref('')

// 初始化或重置当前 sheet：props 变化时重置，确保始终指向有效 sheet
watch(sheetNames, (names) => {
  if (names.length > 0 && (!currentSheet.value || !names.includes(currentSheet.value))) {
    currentSheet.value = names[0]
  }
}, { immediate: true })

// 当前 sheet 的数据
const currentSheetData = computed(() => {
  // 当前激活的 sheet 名：优先用手动选中的，否则取第一个
  const activeSheet = currentSheet.value || sheetNames.value[0] || ''
  const data = sheetsData.value[activeSheet]
  if (!data || !data.length) return []

  // 计算最大列数，确保空单元格也能渲染
  const maxCols = data.reduce((m, row) => Math.max(m, row?.length || 0), 0)
  return data.map(row => {
    const normalizedRow = Array.isArray(row) ? [...row] : []
    while (normalizedRow.length < maxCols) {
      normalizedRow.push('')
    }
    return normalizedRow
  })
})
</script>

<style scoped>
@import '../../notebook-shared.css';

.office-renderer {
  width: 100%;
  height: 100%;
  background: #fff;
  color: #333;
}

/* Word Styles */
.word-container {
  padding: 40px;
  line-height: 1.6;
  max-width: 800px;
  margin: 0 auto;
  font-family: "Microsoft YaHei", sans-serif;
}

.word-container :deep(h1), .word-container :deep(h2) {
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  margin-top: 20px;
}

/* Excel Styles */
.excel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.excel-toolbar {
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  display: flex;
  gap: 10px;
  align-items: center;
}

.sheet-label { font-size: 12px; color: #666; font-weight: bold; }
.sheet-tab { padding: 2px 8px; font-size: 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
.sheet-tab.active { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }

.table-wrapper {
  flex: 1;
  overflow: auto;
  padding: 10px;
}

.excel-table {
  border-collapse: collapse;
  font-size: 13px;
  min-width: 100%;
}

.excel-table td {
  border: 1px solid #ddd;
  padding: 6px 12px;
  white-space: nowrap;
  min-width: 40px;
  min-height: 22px;
}

.excel-table tr:nth-child(even) { background: #fafafa; }

/* Placeholder Styles */
.office-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
  background: var(--bg-color-tertiary);
}

.placeholder-icon { margin-bottom: 20px; color: var(--text-color-muted); }
.placeholder-text h3 { margin-bottom: 10px; }
.placeholder-text p { color: var(--text-color-muted); margin-bottom: 20px; font-size: 14px; }

.open-btn {
  padding: 8px 24px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.open-btn:hover { opacity: 0.9; }
</style>
