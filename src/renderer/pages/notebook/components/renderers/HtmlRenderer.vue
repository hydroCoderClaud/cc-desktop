<script setup>
import { computed } from 'vue'
import { toFileUrl } from '../../utils/helpers.js'

const props = defineProps({
  content: { type: String, required: true }
})

const fileUrl = computed(() => toFileUrl(props.content))
</script>

<template>
  <div class="html-renderer">
    <div class="preview-html-container">
      <!-- 使用 webview 替代 iframe，以获得更好的兼容性和隔离性 -->
      <webview 
        :src="fileUrl" 
        class="html-webview"
        partition="persist:notebook-preview"
        allowpopups
      ></webview>
    </div>
  </div>
</template>

<style scoped>
@import '../../notebook-shared.css';

.preview-html-container {
  height: 600px;
  width: 100%;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.html-webview {
  width: 100%;
  height: 100%;
  background: #fff;
}
</style>
