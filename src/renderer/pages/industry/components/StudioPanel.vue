<template>
  <div v-if="showRightPanel" class="right-panel" :style="{ width: rightWidth + 'px' }">
    <div class="panel-header">
      <template v-if="expandedAchievement">
        <span class="panel-title">{{ t('industry.studio.title') }}</span>
        <Icon name="chevronRight" :size="14" class="breadcrumb-icon" />
        <span class="panel-title">{{ getTypeName(expandedAchievement.type) }}</span>
        <button class="header-btn" style="margin-left:auto" :title="t('common.back')" @click="closeDetail">
          <Icon name="chevronRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
      <template v-else>
        <span class="panel-title">{{ t('industry.studio.title') }}</span>
        <button class="header-btn" style="margin-left:auto" :title="t('common.collapse')" @click="showRightPanel = false">
          <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
    </div>

    <div class="panel-content">
      <!-- 列表视图 -->
      <template v-if="!expandedAchievement">
        <div class="type-grid">
          <div
            v-for="type in availableTypes"
            :key="type.id"
            class="type-card"
            :style="{ background: type.bgColor }"
            :title="type.tip"
          >
            <div class="type-card-top">
              <div class="type-icon-content" :style="{ color: type.color }">
                <Icon :name="type.icon" :size="16" />
              </div>
              <span v-if="type.beta" class="beta-badge">{{ t('industry.studio.betaBadge') }}</span>
            </div>
            <span class="type-name">{{ t('industry.types.' + type.id) }}</span>
            <button class="type-edit-btn">
              <Icon name="edit" :size="14" />
            </button>
          </div>
        </div>

        <div class="panel-divider"></div>

        <div class="achievements-section">
          <div class="section-title">{{ t('industry.studio.generated') }}</div>
          <div v-if="achievements.length === 0" class="empty-achievements">
            <p>{{ t('industry.studio.empty') }}</p>
            <p class="hint">{{ t('industry.studio.emptyHint') }}</p>
          </div>
          <div v-else class="achievements-list">
            <div
              v-for="achievement in achievements"
              :key="achievement.id"
              class="achievement-item"
              @click="openDetail(achievement)"
            >
              <Icon :name="achievement.icon" :size="20" :color="achievement.color" />
              <div class="achievement-info">
                <div class="achievement-name">{{ achievement.name }}</div>
                <div class="achievement-meta">
                  <span>{{ t('industry.studio.sources', { count: achievement.sourceCount }) }}</span>
                  <span class="dot">•</span>
                  <span>{{ achievement.time }}</span>
                </div>
              </div>
              <div class="achievement-actions">
                <button v-if="achievement.type === 'video' || achievement.type === 'audio'" class="action-icon-btn" @click.stop>
                  <Icon name="play" :size="16" />
                </button>
                <button class="action-icon-btn" @click.stop>
                  <Icon name="moreVertical" :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 详情视图 -->
      <template v-else>
        <div class="detail-header">
          <button class="detail-back-btn" @click="closeDetail" :title="t('common.back')">
            <Icon name="chevronLeft" :size="16" />
          </button>
          <span class="detail-title">{{ expandedAchievement.name }}</span>
          <button class="detail-external-btn" :title="t('industry.studio.export')">
            <Icon name="export" :size="16" />
          </button>
          <button class="detail-external-btn" :title="t('industry.studio.copy')">
            <Icon name="copy" :size="16" />
          </button>
          <button class="detail-external-btn danger" :title="t('industry.studio.delete')">
            <Icon name="delete" :size="16" />
          </button>
        </div>

        <div class="detail-summary-section">
          <div class="detail-summary-header">
            <Icon :name="expandedAchievement.icon" :size="14" :color="expandedAchievement.color" />
            <span class="detail-summary-title">{{ expandedAchievement.name }}</span>
          </div>
          <div class="achievement-detail-meta">
            <span>{{ t('industry.studio.sources', { count: expandedAchievement.sourceCount }) }}</span>
            <span class="dot">•</span>
            <span>{{ expandedAchievement.time }}</span>
          </div>
        </div>

        <div class="detail-content-section">
          <pre class="detail-raw-text">{{ expandedAchievement.content || t('industry.studio.empty') }}</pre>
        </div>
      </template>
    </div>
  </div>

  <!-- 折叠条 -->
  <div v-else class="panel-collapsed-strip panel-collapsed-right">
    <div class="strip-header">
      <button class="header-btn" @click="showRightPanel = true" :title="t('industry.studio.expand')">
        <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
      </button>
    </div>
    <div class="strip-body">
      <div class="strip-content strip-content-top">
        <div
          v-for="type in availableTypes"
          :key="type.id"
          class="strip-icon-item type-icon-item"
          :style="{ background: type.bgColor }"
          :title="t('industry.types.' + type.id)"
        >
          <div class="type-icon-small" :style="{ color: type.color }">
            <Icon :name="type.icon" :size="18" />
          </div>
          <span class="type-plus">+</span>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="strip-content strip-content-bottom">
        <div v-for="achievement in achievements" :key="achievement.id" class="strip-icon-item" :title="achievement.name">
          <Icon :name="achievement.icon" :size="20" :color="achievement.color" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useIndustryLayout } from '../composables/useIndustryLayout'

defineProps({
  achievements: { type: Array, default: () => [] },
  availableTypes: { type: Array, default: () => [] }
})

const { t } = useLocale()
const { rightWidth, showRightPanel, expandPanel, collapsePanel } = useIndustryLayout()

const expandedAchievement = ref(null)

const openDetail = (achievement) => {
  expandedAchievement.value = achievement
  expandPanel('right')
}

const closeDetail = () => {
  expandedAchievement.value = null
  collapsePanel('right')
}

const getTypeName = (typeId) => t('industry.types.' + typeId)
</script>

<style>
@import '../industry-shared.css';
</style>

<style scoped>
.right-panel {
  flex-shrink: 0;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
  margin-bottom: 20px;
}

.type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
  overflow: hidden;
  min-width: 0;
}

.type-card:hover { transform: translateY(-1px); box-shadow: 0 3px 10px var(--shadow-color); }

.type-card-top { display: flex; align-items: center; gap: 6px; }

.type-icon-content {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.type-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  text-align: left;
  line-height: 1.3;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beta-badge {
  font-size: 9px;
  background: var(--text-color);
  color: var(--bg-color-secondary);
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  white-space: nowrap;
}

.type-edit-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--text-color-muted);
}

.type-card:hover .type-edit-btn { opacity: 1; }

.panel-divider { height: 1px; background: var(--border-color); margin: 0 0 20px; }

.achievements-section { margin-bottom: 20px; }

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.empty-achievements { padding: 30px 20px; text-align: center; color: var(--text-color-muted); }
.empty-achievements p { margin: 0 0 4px; font-size: 13px; }
.empty-achievements .hint { font-size: 12px; }

.achievements-list { display: flex; flex-direction: column; gap: 8px; }

.achievement-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-color-tertiary);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.achievement-item:hover { background: var(--hover-bg); }

.achievement-info { flex: 1; min-width: 0; }

.achievement-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.achievement-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot { font-size: 8px; }

.achievement-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.achievement-item:hover .achievement-actions { opacity: 1; }

.action-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-color-muted);
  transition: background 0.15s;
}

.action-icon-btn:hover { background: var(--border-color); color: var(--text-color); }

.achievement-detail-meta {
  font-size: 12px;
  color: var(--text-color-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.type-icon-item { width: 36px; height: 36px; border-radius: 8px; }
.type-icon-item:hover { transform: scale(1.05); }

.type-icon-small { display: flex; align-items: center; justify-content: center; }

.type-plus {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 10px;
  font-weight: bold;
  color: var(--text-color-muted);
  background: var(--bg-color-secondary);
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-collapsed-right { border-left: none; border-right: none; }
</style>
