<template>
  <div class="image-renderer">
    <div class="preview-image-container">
      <img :src="content" :alt="name" @click="toggleZoom" :class="{ 'zoomed': isZoomed }" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  content: { type: String, required: true },
  name: { type: String, default: '' }
})

const isZoomed = ref(false)
const toggleZoom = () => { isZoomed.value = !isZoomed.value }
</script>

<style scoped>
@import '../../notebook-shared.css';

.preview-image-container {
  padding: 20px;
  display: flex;
  justify-content: center;
  background: var(--bg-color-tertiary);
  cursor: zoom-in;
}

.preview-image-container img {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: transform 0.3s ease;
}

.preview-image-container img.zoomed {
  max-width: none;
  transform: scale(1.5);
  cursor: zoom-out;
}
</style>
