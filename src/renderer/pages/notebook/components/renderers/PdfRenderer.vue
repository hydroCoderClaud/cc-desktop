<script setup>
import { computed } from 'vue'

const props = defineProps({
  content: { type: String, required: true }
})

const fileUrl = computed(() => {
  // 处理 Windows 绝对路径
  let path = props.content.replace(/\\/g, '/')
  if (!path.startsWith('/')) path = '/' + path
  return 'file://' + path
})
</script>

<template>
  <div class="pdf-renderer">
    <div class="preview-pdf-container">
      <!-- 使用 webview 加载 PDF，提供更好的交互支持 -->
      <webview 
        :src="fileUrl" 
        class="pdf-webview"
        partition="persist:notebook-preview"
      ></webview>
    </div>
  </div>
</template>

<style scoped>
@import '../../notebook-shared.css';

.preview-pdf-container {
  height: 600px;
  width: 100%;
  background: var(--bg-color-tertiary);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.pdf-webview {
  width: 100%;
  height: 100%;
}
</style>
