<template>
  <div class="channel-page" :class="{ embedded: props.embedded }" :style="cssVars">
    <div class="channel-header">
      <div>
        <h1>{{ t('channelSettings.title') }}</h1>
        <p class="channel-subtitle">{{ t('channelSettings.subtitle') }}</p>
      </div>
    </div>

    <div class="channel-layout">
      <aside class="channel-sidebar">
        <div class="sidebar-title">{{ t('channelSettings.sidebarTitle') }}</div>
        <button
          v-for="channel in channels"
          :key="channel.id"
          type="button"
          class="channel-nav-item"
          :class="{ active: activeChannel === channel.id }"
          @click="activeChannel = channel.id"
        >
          <div class="channel-nav-copy">
            <span class="channel-nav-label">{{ channel.label }}</span>
            <span class="channel-nav-description">{{ channel.description }}</span>
          </div>
        </button>
      </aside>

      <section class="channel-content">
        <KeepAlive>
          <component :is="currentChannelComponent" />
        </KeepAlive>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, ref } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import ChannelCommonSettings from './ChannelCommonSettings.vue'
import EmbeddedDingTalkSettings from './EmbeddedDingTalkSettings.vue'
import EmbeddedFeishuSettings from './EmbeddedFeishuSettings.vue'
import EmbeddedEnterpriseWeixinSettings from './EmbeddedEnterpriseWeixinSettings.vue'

const PERSONAL_WEIXIN_ENABLED = false

const { cssVars } = useTheme()
const { t } = useLocale()
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})

const channels = computed(() => ([
  {
    id: 'common',
    label: t('channelSettings.channels.common.label'),
    description: t('channelSettings.channels.common.description')
  },
  {
    id: 'dingtalk',
    label: t('channelSettings.channels.dingtalk.label'),
    description: t('channelSettings.channels.dingtalk.description')
  },
  {
    id: 'feishu',
    label: t('channelSettings.channels.feishu.label'),
    description: t('channelSettings.channels.feishu.description')
  },
  {
    id: 'enterprise-weixin',
    label: t('channelSettings.channels.enterpriseWeixin.label'),
    description: t('channelSettings.channels.enterpriseWeixin.description')
  }
].filter(channel => PERSONAL_WEIXIN_ENABLED || channel.id !== 'weixin')))

const channelComponents = {
  common: markRaw(ChannelCommonSettings),
  dingtalk: markRaw(EmbeddedDingTalkSettings),
  feishu: markRaw(EmbeddedFeishuSettings),
  'enterprise-weixin': markRaw(EmbeddedEnterpriseWeixinSettings)
}

const activeChannel = ref('common')

const currentChannelComponent = computed(() => channelComponents[activeChannel.value] || channelComponents.common)
</script>

<style scoped>
.channel-page {
  min-height: 100vh;
  padding: 24px;
}

.channel-page.embedded {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  padding: 20px;
}

.channel-header {
  margin-bottom: 20px;
}

.channel-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
}

.channel-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color-2);
}

.channel-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  min-height: calc(100vh - 120px);
}

.channel-page.embedded .channel-layout {
  flex: 1;
  min-height: 0;
}

.channel-page.embedded .channel-content {
  overflow: auto;
}

.channel-sidebar {
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

.channel-nav-item {
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  padding: 14px 12px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.channel-nav-item:hover {
  background: var(--hover-color);
}

.channel-nav-item.active {
  border-color: var(--primary-color);
  background: var(--hover-color);
}

.channel-nav-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.channel-nav-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.channel-nav-description {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-2);
}

.channel-content {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--card-color);
}

@media (max-width: 900px) {
  .channel-page {
    padding: 16px;
  }

  .channel-layout {
    grid-template-columns: 1fr;
  }

  .channel-sidebar {
    padding: 12px;
  }
}
</style>
