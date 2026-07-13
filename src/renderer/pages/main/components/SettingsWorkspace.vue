<template>
  <section class="settings-workspace">
    <aside class="settings-navigation" :aria-label="t('main.settingsMenu')">
      <button class="settings-return" type="button" @click="closeSettings">
        <Icon name="arrowLeft" :size="16" />
        <span>{{ t('common.back') }}</span>
      </button>

      <div class="settings-navigation-title">{{ t('main.settingsMenu') }}</div>
      <nav class="settings-navigation-list">
        <button
          v-for="item in sections"
          :key="item.id"
          class="settings-navigation-item"
          :class="{ active: activeSection === item.id }"
          type="button"
          @click="selectSection(item.id)"
        >
          <Icon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <div class="settings-workspace-content">
      <n-notification-provider>
        <KeepAlive>
          <component
            :is="currentSectionComponent"
            :key="activeSection"
            v-bind="currentSectionProps"
            @close="closeSettings"
          />
        </KeepAlive>
      </n-notification-provider>
    </div>
  </section>
</template>

<script setup>
import { computed, markRaw } from 'vue'
import { useLocale } from '@composables/useLocale'
import { SettingsSection, useSettingsNavigation } from '@composables/useSettingsNavigation'
import Icon from '@components/icons/Icon.vue'
import ModelSettingsContent from '@/pages/model-settings/components/ModelSettingsContent.vue'
import ChannelSettingsContent from '@/pages/channel-settings/components/ChannelSettingsContent.vue'
import GlobalSettingsContent from '@/pages/global-settings/components/GlobalSettingsContent.vue'
import AppearanceSettingsContent from '@/pages/appearance-settings/components/AppearanceSettingsContent.vue'
import SettingsWorkbenchContent from '@/pages/settings-workbench/components/SettingsWorkbenchContent.vue'
import UpdateManagerContent from '@/pages/update-manager/components/UpdateManagerContent.vue'
import '@/styles/settings-common.css'

const { t } = useLocale()
const { settingsRequest, openSettings, closeSettings } = useSettingsNavigation()

const sections = computed(() => ([
  { id: SettingsSection.MODELS, icon: 'key', label: t('settingsMenu.modelSettings') },
  { id: SettingsSection.CHANNELS, icon: 'chat', label: t('settingsMenu.channelSettings') },
  { id: SettingsSection.GENERAL, icon: 'settings', label: t('settingsMenu.globalSettings') },
  { id: SettingsSection.APPEARANCE, icon: 'sliders', label: t('settingsMenu.appearanceSettings') },
  { id: SettingsSection.CAPABILITIES, icon: 'wrench', label: t('settingsMenu.capabilityWorkbench') },
  { id: SettingsSection.SESSION_APPS, icon: 'sessionApp', label: t('settingsMenu.sessionApps') },
  { id: SettingsSection.UPDATES, icon: 'download', label: t('settingsMenu.appUpdate') }
]))

const sectionComponents = {
  [SettingsSection.MODELS]: markRaw(ModelSettingsContent),
  [SettingsSection.CHANNELS]: markRaw(ChannelSettingsContent),
  [SettingsSection.GENERAL]: markRaw(GlobalSettingsContent),
  [SettingsSection.APPEARANCE]: markRaw(AppearanceSettingsContent),
  [SettingsSection.CAPABILITIES]: markRaw(SettingsWorkbenchContent),
  [SettingsSection.SESSION_APPS]: markRaw(SettingsWorkbenchContent),
  [SettingsSection.UPDATES]: markRaw(UpdateManagerContent)
}

const activeSection = computed(() => settingsRequest.value?.section || SettingsSection.MODELS)
const currentSectionComponent = computed(() => sectionComponents[activeSection.value] || sectionComponents[SettingsSection.MODELS])
const currentSectionProps = computed(() => {
  const context = settingsRequest.value?.context || {}
  const isWorkbench = activeSection.value === SettingsSection.CAPABILITIES
    || activeSection.value === SettingsSection.SESSION_APPS

  if (isWorkbench) {
    return {
      embedded: true,
      context: {
        ...context,
        section: activeSection.value === SettingsSection.SESSION_APPS ? 'session-apps' : ''
      }
    }
  }

  return { embedded: true }
})

const selectSection = (section) => {
  openSettings({
    section,
    context: settingsRequest.value?.context
  })
}
</script>

<style scoped>
.settings-workspace {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: var(--bg-color);
}

.settings-navigation {
  min-width: 0;
  padding: 14px 12px;
  border-right: 1px solid var(--panel-border, var(--border-color));
  background: var(--panel-bg, var(--bg-color-secondary));
}

.settings-return,
.settings-navigation-item {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font: inherit;
  text-align: left;
}

.settings-return {
  min-height: 36px;
  padding: 0 8px;
  color: var(--text-color-secondary, var(--text-color-2));
}

.settings-return:hover,
.settings-navigation-item:hover {
  background: var(--hover-color);
}

.settings-navigation-title {
  margin: 24px 8px 8px;
  color: var(--text-color-secondary, var(--text-color-2));
  font-size: 12px;
  font-weight: 600;
}

.settings-navigation-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-navigation-item {
  min-height: 38px;
  padding: 0 10px;
}

.settings-navigation-item.active {
  background: var(--primary-ghost, var(--hover-color));
  color: var(--primary-color);
}

.settings-workspace-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--bg-color);
}

.settings-workspace-content :deep(.settings-page.workspace-embedded) {
  min-height: 100%;
}

@media (max-width: 760px) {
  .settings-workspace {
    grid-template-columns: 1fr;
  }

  .settings-navigation {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
    padding: 8px 10px;
    border-right: 0;
    border-bottom: 1px solid var(--panel-border, var(--border-color));
  }

  .settings-return {
    width: auto;
    flex: 0 0 auto;
  }

  .settings-navigation-title {
    display: none;
  }

  .settings-navigation-list {
    flex-direction: row;
  }

  .settings-navigation-item {
    width: auto;
    flex: 0 0 auto;
    white-space: nowrap;
  }
}
</style>
