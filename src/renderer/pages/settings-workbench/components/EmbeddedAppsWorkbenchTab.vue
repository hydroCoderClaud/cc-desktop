<template>
  <div class="embedded-apps-tab">
    <div class="tab-header">
      <div class="title-line">{{ t('embeddedApps.title') }}</div>
      <div class="subtitle">{{ t('embeddedApps.subtitle') }}</div>
    </div>

    <n-alert type="info" show-icon class="boundary-alert">
      {{ t('embeddedApps.boundary') }}
    </n-alert>

    <n-card :title="t('embeddedApps.demoTitle')" class="app-card">
      <template #header-extra>
        <n-tag size="small" type="success" round>{{ t('embeddedApps.demoTag') }}</n-tag>
      </template>

      <div class="app-copy">
        <p>{{ t('embeddedApps.demoDescription') }}</p>
        <ul class="feature-list">
          <li>{{ t('embeddedApps.featureConnect') }}</li>
          <li>{{ t('embeddedApps.featureSession') }}</li>
          <li>{{ t('embeddedApps.featureStreaming') }}</li>
          <li>{{ t('embeddedApps.featureTheme') }}</li>
        </ul>
      </div>

      <div class="action-row">
        <n-button type="primary" @click="openDemo">
          <Icon name="folderOpen" :size="14" />
          {{ t('embeddedApps.openDemo') }}
        </n-button>
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const openDemo = async () => {
  try {
    const result = await window.electronAPI?.openEmbeddedAppDemo?.()
    if (!result?.success) {
      throw new Error(result?.error || t('embeddedApps.openFailed'))
    }
  } catch (err) {
    console.error('[EmbeddedAppsWorkbenchTab] Failed to open demo:', err)
    message.error(err.message || t('embeddedApps.openFailed'))
  }
}
</script>

<style scoped>
.embedded-apps-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title-line {
  font-size: 22px;
  font-weight: 700;
}

.subtitle {
  color: var(--text-secondary, #7a7a7a);
  line-height: 1.6;
}

.boundary-alert {
  margin-bottom: 4px;
}

.app-card :deep(.n-card-header__main) {
  font-weight: 700;
}

.app-copy {
  color: var(--text-color-2, #666);
  line-height: 1.7;
}

.app-copy p {
  margin: 0 0 12px;
}

.feature-list {
  margin: 0;
  padding-left: 18px;
}

.feature-list li + li {
  margin-top: 6px;
}

.action-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-start;
}
</style>
