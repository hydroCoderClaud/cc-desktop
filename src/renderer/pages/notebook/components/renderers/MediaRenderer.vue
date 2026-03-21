<template>
  <div class="media-renderer">
    <!-- Audio -->
    <div v-if="type === 'audio'" class="preview-audio-container">
      <audio :src="content" controls autoplay class="audio-player"></audio>
    </div>

    <!-- Video -->
    <div v-else-if="isVideo" class="preview-video-container">
      <video 
        :src="content" 
        controls 
        autoplay 
        class="video-player"
      ></video>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  content: { type: String, required: true },
  type: { type: String, required: true } // 'audio' | 'video'
})

const isVideo = computed(() => props.type === 'video')
</script>

<style scoped>
@import '../../notebook-shared.css';

.preview-audio-container {
  padding: 40px 20px;
  display: flex;
  justify-content: center;
  background: var(--bg-color-tertiary);
  border-radius: 8px;
}

.audio-player {
  width: 100%;
  max-width: 500px;
}

.preview-video-container {
  padding: 10px;
  background: #000;
  display: flex;
  justify-content: center;
  max-height: 500px;
  border-radius: 8px;
  overflow: hidden;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
  outline: none;
}
</style>
