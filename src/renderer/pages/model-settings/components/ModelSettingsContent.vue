<template>
  <div class="model-page" :style="cssVars">
    <div class="model-header">
      <div>
        <h1>{{ t('modelSettings.title') }}</h1>
        <p class="model-subtitle">{{ t('modelSettings.subtitle') }}</p>
      </div>
    </div>

    <div class="model-layout">
      <aside class="model-sidebar">
        <div class="sidebar-title">{{ t('modelSettings.sidebarTitle') }}</div>
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          class="model-nav-item"
          :class="{ active: activeSection === item.id }"
          @click="activeSection = item.id"
        >
          <div class="model-nav-copy">
            <span class="model-nav-label">{{ item.label }}</span>
            <span class="model-nav-description">{{ item.description }}</span>
          </div>
        </button>
      </aside>

      <section class="model-content">
        <KeepAlive>
          <component :is="currentSectionComponent" />
        </KeepAlive>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, ref } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import EmbeddedProfileManager from './EmbeddedProfileManager.vue'
import EmbeddedProviderManager from './EmbeddedProviderManager.vue'

const { cssVars } = useTheme()
const { t } = useLocale()

const sections = computed(() => ([
  {
    id: 'providers',
    label: t('modelSettings.sections.providers.label'),
    description: t('modelSettings.sections.providers.description')
  },
  {
    id: 'profiles',
    label: t('modelSettings.sections.profiles.label'),
    description: t('modelSettings.sections.profiles.description')
  }
]))

const sectionComponents = {
  profiles: markRaw(EmbeddedProfileManager),
  providers: markRaw(EmbeddedProviderManager)
}

const activeSection = ref('providers')

const currentSectionComponent = computed(() => sectionComponents[activeSection.value] || sectionComponents.providers)
</script>

<style scoped>
.model-page {
  min-height: 100vh;
  padding: 24px;
}

.model-header {
  margin-bottom: 20px;
}

.model-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
}

.model-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color-2);
}

.model-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  min-height: calc(100vh - 120px);
}

.model-sidebar {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--card-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-color-3);
}

.model-nav-item {
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  padding: 14px 12px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.model-nav-item:hover {
  background: var(--hover-color);
}

.model-nav-item.active {
  border-color: var(--primary-color);
  background: var(--hover-color);
}

.model-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-nav-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.model-nav-description {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-2);
}

.model-content {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--card-color);
}

@media (max-width: 900px) {
  .model-page {
    padding: 16px;
  }

  .model-layout {
    grid-template-columns: 1fr;
  }

  .model-sidebar {
    padding: 12px;
  }
}
</style>
