<template>
  <div class="text-renderer">
    <!-- 之后可以增加 Markdown 语法高亮 -->
    <pre 
      class="detail-raw-text" 
      :class="{ 'detail-markdown': isMarkdown }"
    >{{ content || t('notebook.studio.empty') }}</pre>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  content: { type: String, default: '' },
  type: { type: String, default: 'text' }
})

const { t } = useLocale()
const isMarkdown = computed(() => props.type === 'markdown' || props.type === 'achievement')
</script>

<style scoped>
@import '../../notebook-shared.css';

.text-renderer {
  width: 100%;
  height: 100%;
}
</style>
