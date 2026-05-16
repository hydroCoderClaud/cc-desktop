import './styles.css'
import { setPageTitle } from '@/utils/page-bootstrap'
import {
  OBSERVATION_TYPES,
  createEmptyStation,
  describeObservationTypes,
  describeStatus,
  normalizeStation,
  validateStation
} from './station-model'
import { mountHydrologyAgentPanel } from './agent-panel'
import {
  formatDateTimeLabel as formatDateTimeLabelFromUtils,
  formatDateObjectLabel as formatDateObjectLabelFromUtils,
  formatDateTimeInputValue as formatDateTimeInputValueFromUtils,
  buildTrendStats as buildTrendStatsFromUtils,
  sortRealtimeSlots as sortRealtimeSlotsFromUtils,
  formatNumericValue as formatNumericValueFromUtils,
  clamp as clampFromUtils,
  formatAxisTimeLabel as formatAxisTimeLabelFromUtils,
  getTrendPresetDuration as getTrendPresetDurationFromUtils,
  getVisibleTrendRange as getVisibleTrendRangeFromUtils,
  getTrendAxisStep as getTrendAxisStepFromUtils,
  getTrendAxisLabelStrategy as getTrendAxisLabelStrategyFromUtils,
  alignTrendTick as alignTrendTickFromUtils,
  buildTrendTicks as buildTrendTicksFromUtils,
  buildTrendAxisModel as buildTrendAxisModelFromUtils,
  isTrendKeyTimestamp as isTrendKeyTimestampFromUtils
} from './trend-utils'
import {
  buildTrendHoverCardMarkup as buildTrendHoverCardMarkupFromRenderer,
  buildTrendOverviewSvg as buildTrendOverviewSvgFromRenderer,
  buildTrendChartSvg as buildTrendChartSvgFromRenderer,
  renderTrendPanel as renderTrendPanelFromRenderer
} from './trend-renderer'
import {
  loadRealtimeTrendAction,
  loadRealtimeSlotDetailAction,
  loadRealtimeSlotsAction,
  resetRealtimeFiltersAction,
  applyRealtimeFiltersAction
} from './realtime-actions'
import { renderReviewView } from './review-view'
import {
  renderFunctionTabsView,
  renderHeaderView,
  renderPlaceholderRowsView,
  renderStationFormView,
  renderStationTreeView
} from './workbench-views'
import {
  bindTrendChartHoverView,
  bindTrendViewportInteractionsView,
  renderRealtimeDetailModalView,
  renderSlotCheckResultModalView,
  renderRealtimeViewSection
} from './realtime-view'

setPageTitle('hydrologyWorkbench')

const stationFunctions = [
  {
    key: 'basic',
    label: '基础信息管理',
    meta: '站点基础资料、观测类别和数据源'
  },
  {
    key: 'realtime',
    label: '实时数据列表',
    meta: '水位和气温实时观测数据'
  },
  {
    key: 'review',
    label: '审核任务状态',
    meta: '单时槽质量检查结果与规则判定明细'
  },
  {
    key: 'rule-config',
    label: '规则与算法配置',
    meta: '站点级规则开关、阈值参数与算法使用配置'
  },
  {
    key: 'results',
    label: '工作成果展示',
    meta: '日统计、摘录成果、异常清单和人工确认记录'
  }
]

const COMPARE_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'consistent', label: '一致' },
  { value: 'slightly_diff', label: '轻微偏差' },
  { value: 'significant_diff', label: '明显偏差' },
  { value: 'conflict', label: '冲突' },
  { value: 'missing_reference', label: '缺少对比来源' }
]

const TREND_SERIES_COLORS = {
  manual: '#2563eb',
  telemetry: '#0f766e',
  video_ocr: '#d97706',
  chosen: '#dc2626'
}

let stations = []
let selectedStationId = null
let activeFunctionKey = 'basic'
let realtimeState = {
  selectedObservationType: OBSERVATION_TYPES.waterLevel,
  fromTime: '',
  toTime: '',
  compareStatus: 'all',
  hasAnomalyOnly: false,
  trendViewMode: 'slot',
  trendPreset: '24h',
  trendZoomStart: null,
  trendZoomEnd: null,
  trendDragState: null,
  trendSeriesVisibility: {
    manual: true,
    telemetry: true,
    video_ocr: true,
    chosen: true
  },
  slots: [],
  page: 1,
  pageSize: 10,
  selectedSlotIds: [],
  selectedSlotId: null,
  slotDetail: null,
  slotDetailSource: null,
  trend: null,
  trendHoverModel: null,
  error: '',
  trendError: '',
  correctionError: '',
  observationMutationError: '',
  slotCheckResult: null,
  createSlotDraft: {
    visible: false,
    slotTime: '',
    value: ''
  }
}
let reviewState = {
  selectedObservationType: OBSERVATION_TYPES.waterLevel,
  statusFilter: 'all',
  tasks: [],
  selectedTaskIds: [],
  selectedTaskId: null,
  page: 1,
  pageSize: 10,
  error: '',
  runSummary: null,
  lastSlotCheck: null
}

const stationTreeEl = document.getElementById('stationTree')
const newStationBtn = document.getElementById('newStationBtn')
const currentStationTitleEl = document.getElementById('currentStationTitle')
const currentStationMetaEl = document.getElementById('currentStationMeta')
const functionTabsEl = document.getElementById('functionTabs')
const activeFunctionTitleEl = document.getElementById('activeFunctionTitle')
const activeFunctionMetaEl = document.getElementById('activeFunctionMeta')
const tabContentEl = document.getElementById('tabContent')
const stationForm = document.getElementById('stationForm')
const stationFormError = document.getElementById('stationFormError')
const ruleConfigForm = document.getElementById('ruleConfigForm')
const ruleConfigFormError = document.getElementById('ruleConfigFormError')
const resetStationBtn = document.getElementById('resetStationBtn')
const deleteStationBtn = document.getElementById('deleteStationBtn')
const deleteConfirmOverlayEl = document.getElementById('deleteConfirmOverlay')
const deleteConfirmMessageEl = document.getElementById('deleteConfirmMessage')
const deleteConfirmCancelBtn = document.getElementById('deleteConfirmCancelBtn')
const deleteConfirmOkBtn = document.getElementById('deleteConfirmOkBtn')
const hydrologyAgentPanelEl = document.getElementById('hydrologyAgentPanel')
let agentPanel = null
let pendingDeleteStationId = null
let pendingConfirmAction = null
let trendViewportBindingsController = null
let trendViewportRenderFrame = null

function normalizeReviewObservationTypeForStation(station) {
  if (!station) return
  if (station.observationTypes?.includes(reviewState.selectedObservationType)) {
    return
  }
  reviewState.selectedObservationType = station.observationTypes?.[0] || OBSERVATION_TYPES.waterLevel
}

function syncReviewStateWithSlotTasks(slotTasks = []) {
  const incoming = Array.isArray(slotTasks) ? slotTasks.filter((item) => item?.id) : []
  if (incoming.length === 0 || !Array.isArray(reviewState.tasks) || reviewState.tasks.length === 0) {
    return
  }

  const incomingMap = new Map(incoming.map((item) => [item.id, item]))
  reviewState.tasks = reviewState.tasks
    .map((task) => incomingMap.has(task.id) ? { ...task, ...incomingMap.get(task.id) } : task)
    .filter((task) => {
      if (reviewState.statusFilter === 'needs_review') {
        return task.status !== 'resolved'
      }
      if (reviewState.statusFilter === 'resolved') {
        return task.status === 'resolved'
      }
      return true
    })

  if (!reviewState.tasks.some((item) => item.id === reviewState.selectedTaskId)) {
    reviewState.selectedTaskId = reviewState.tasks[0]?.id || null
  }
}

function notifyAgentContextChanged(force = false) {
  agentPanel?.notifyContextChanged(force)
}

async function loadLatestReviewRunSummary() {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.getHydrologyLatestReviewRunSummary) {
    reviewState.runSummary = null
    return
  }

  try {
    reviewState.runSummary = await window.electronAPI.getHydrologyLatestReviewRunSummary({
      stationId: station.id,
      observationType: reviewState.selectedObservationType,
      scopeType: 'station'
    })
  } catch (err) {
    reviewState.runSummary = null
    reviewState.error = err?.message || String(err)
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getSelectedStation() {
  return stations.find((station) => station.id === selectedStationId) || stations[0] || null
}

function getActiveFunction() {
  return stationFunctions.find((item) => item.key === activeFunctionKey) || stationFunctions[0]
}

function groupStationsByBasin() {
  return stations.reduce((groups, station) => {
    const basin = station.basin || '未分组流域'
    groups[basin] ||= []
    groups[basin].push(station)
    return groups
  }, {})
}

function renderStationTree() {
  renderStationTreeView({
    stationTreeEl,
    stations,
    selectedStationId,
    describeStatus,
    escapeHtml,
    onSelectStation: selectStation
  })
}

function renderFunctionTabs() {
  renderFunctionTabsView({
    functionTabsEl,
    stationFunctions,
    activeFunctionKey,
    escapeHtml,
    onSwitchFunction: async (functionKey) => {
      activeFunctionKey = functionKey
      realtimeState.slotCheckResult = null
      if (activeFunctionKey === 'realtime') {
        realtimeState.selectedSlotId = null
        realtimeState.slotDetail = null
        await loadRealtimeSlots()
      } else if (activeFunctionKey === 'review') {
        reviewState.selectedTaskId = null
        await loadReviewTasks()
      }
      renderWorkbench()
    }
  })
}

function setCheckedValues(name, values) {
  stationForm.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value)
  })
}

function renderStationForm(station) {
  renderStationFormView({
    stationForm,
    stationFormError,
    deleteStationBtn,
    station,
    createEmptyStation
  })
}

function renderRuleConfigForm(station) {
  const waterLevelRules = station?.validationRules?.waterLevel || {}
  const airTemperatureRules = station?.validationRules?.airTemperature || {}

  stationForm.hidden = true
  ruleConfigForm.hidden = false
  ruleConfigForm.dataset.stationId = station?.id || ''
  ruleConfigForm.elements.waterLevelSectionMinElevation.value = waterLevelRules.sectionMinElevation ?? 0
  ruleConfigForm.elements.waterLevelSectionMaxElevation.value = waterLevelRules.sectionMaxElevation ?? 50
  ruleConfigForm.elements.waterLevelMaxHourlyDelta.value = waterLevelRules.maxHourlyDelta ?? 0.1
  ruleConfigForm.elements.waterLevelManualVideoTolerance.value = waterLevelRules.manualVideoTolerance ?? 0.1
  ruleConfigForm.elements.waterLevelRequireManualObservation.checked = waterLevelRules.requireManualObservation !== false
  ruleConfigForm.elements.waterLevelRequireVideoReference.checked = waterLevelRules.requireVideoReference !== false
  document.getElementById('airTemperatureMinDisplay').textContent = String(airTemperatureRules.min ?? -50)
  document.getElementById('airTemperatureMaxDisplay').textContent = String(airTemperatureRules.max ?? 60)
  document.getElementById('airTemperatureMaxHourlyChangeDisplay').textContent = String(airTemperatureRules.maxHourlyChange ?? 8)
  document.getElementById('airTemperatureSpikeThresholdDisplay').textContent = String(airTemperatureRules.spikeThreshold ?? 6)
  ruleConfigFormError.textContent = ''
}

function closeDeleteConfirm() {
  pendingDeleteStationId = null
  pendingConfirmAction = null
  deleteConfirmOverlayEl.hidden = true
  deleteConfirmOkBtn.textContent = '删除'
}

function openDeleteConfirm(station) {
  pendingDeleteStationId = station?.id || null
  pendingConfirmAction = {
    type: 'delete-station'
  }
  deleteConfirmMessageEl.textContent = `确认删除站点“${station?.name || station?.id || ''}”吗？`
  deleteConfirmOverlayEl.hidden = false
}

function openConfirmAction(message, action, confirmLabel = '删除') {
  pendingDeleteStationId = null
  pendingConfirmAction = action
  deleteConfirmMessageEl.textContent = message
  deleteConfirmOkBtn.textContent = confirmLabel
  deleteConfirmOverlayEl.hidden = false
}

function renderPlaceholderRows(rows) {
  renderPlaceholderRowsView({
    tabContentEl,
    rows,
    escapeHtml
  })
}

function renderRuleConfigView(station) {
  tabContentEl.innerHTML = ''
  renderRuleConfigForm(station)
}

function renderReviewTaskView(station) {
  tabContentEl.innerHTML = `${renderReviewView(station, reviewState, {
    describeObservationType
  })}${renderRealtimeDetailModal(realtimeState.slotDetail)}`

  tabContentEl.querySelectorAll('[data-review-observation-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      reviewState.selectedObservationType = button.dataset.reviewObservationType
      reviewState.selectedTaskId = null
      reviewState.page = 1
      reviewState.lastSlotCheck = null
      await loadReviewTasks()
      await loadLatestReviewRunSummary()
      renderWorkbench()
      notifyAgentContextChanged()
    })
  })

  document.getElementById('reviewFilterForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    reviewState.statusFilter = String(formData.get('status') || 'all').trim() || 'all'
    reviewState.selectedTaskId = null
    reviewState.page = 1
    reviewState.lastSlotCheck = null
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  })

  document.querySelector('#reviewFilterForm select[name="status"]')?.addEventListener('change', async (event) => {
    reviewState.statusFilter = String(event.target?.value || 'all').trim() || 'all'
    reviewState.selectedTaskId = null
    reviewState.page = 1
    reviewState.lastSlotCheck = null
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  })

  document.getElementById('reviewRunCheckBtn')?.addEventListener('click', async () => {
    await runReviewQualityCheck()
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  })

  document.getElementById('reviewClearSlotFocusBtn')?.addEventListener('click', async () => {
    reviewState.lastSlotCheck = null
    reviewState.selectedTaskId = null
    reviewState.page = 1
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  })

  tabContentEl.querySelectorAll('[data-review-task-id]').forEach((row) => {
    row.addEventListener('click', () => {
      reviewState.selectedTaskId = row.dataset.reviewTaskId
      renderWorkbench()
      notifyAgentContextChanged()
    })
  })

  tabContentEl.querySelectorAll('[data-review-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.reviewPageAction === 'prev' && reviewState.page > 1) {
        reviewState.page -= 1
      }
      if (button.dataset.reviewPageAction === 'next') {
        reviewState.page += 1
      }
      renderWorkbench()
      notifyAgentContextChanged()
    })
  })

  document.getElementById('reviewPageSizeSelect')?.addEventListener('change', (event) => {
    reviewState.pageSize = Number(event.target.value) || 10
    reviewState.page = 1
    renderWorkbench()
    notifyAgentContextChanged()
  })

  document.getElementById('reviewSelectPageCheckbox')?.addEventListener('change', (event) => {
    const checked = !!event.target?.checked
    const pageTaskIds = Array.isArray(reviewState.tasks)
      ? reviewState.tasks
        .slice((reviewState.page - 1) * (reviewState.pageSize || 10), reviewState.page * (reviewState.pageSize || 10))
        .map((item) => item.id)
      : []
    pageTaskIds.forEach((taskId) => toggleReviewTaskSelection(taskId, checked))
    renderWorkbench()
    notifyAgentContextChanged()
  })

  tabContentEl.querySelectorAll('[data-review-select-task]').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation()
    })
    input.addEventListener('change', (event) => {
      toggleReviewTaskSelection(input.dataset.reviewSelectTask, !!event.target?.checked)
      renderWorkbench()
      notifyAgentContextChanged()
    })
  })

  tabContentEl.querySelectorAll('[data-review-delete-task]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const taskId = button.dataset.reviewDeleteTask
      openConfirmAction('确认删除这条审核任务吗？该操作不会删除原始观测数据。', {
        type: 'delete-review-tasks',
        taskIds: [taskId]
      })
    })
  })

  document.getElementById('reviewDeleteSelectedBtn')?.addEventListener('click', () => {
    if ((reviewState.selectedTaskIds || []).length === 0) return
    openConfirmAction(`确认批量删除 ${reviewState.selectedTaskIds.length} 条审核任务吗？该操作不会删除原始观测数据。`, {
      type: 'delete-review-tasks',
      taskIds: [...reviewState.selectedTaskIds]
    })
  })

  document.getElementById('reviewDeleteAllBtn')?.addEventListener('click', () => {
    const allTaskIds = Array.isArray(reviewState.tasks) ? reviewState.tasks.map((item) => item.id).filter(Boolean) : []
    if (allTaskIds.length === 0) return
    openConfirmAction(`确认删除当前筛选结果中的全部 ${allTaskIds.length} 条审核任务吗？该操作不会删除原始观测数据。`, {
      type: 'delete-review-tasks',
      taskIds: allTaskIds
    })
  })

  tabContentEl.querySelectorAll('[data-review-open-slot]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      await openReviewTaskSlot(button.dataset.reviewOpenSlot, button.dataset.reviewSlotTime)
    })
  })

  document.getElementById('reviewResolveForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const taskId = event.currentTarget
      .querySelector('[data-review-task-resolve]')?.dataset?.reviewTaskResolve
    await resolveReviewTask(taskId, {
      resolvedBy: String(formData.get('resolvedBy') || '').trim() || '系统用户',
      resolutionNote: String(formData.get('resolutionNote') || '').trim() || '人工确认已处理',
      status: 'resolved'
    })
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  })

  document.getElementById('closeRealtimeDetailBtn')?.addEventListener('click', () => {
    closeRealtimeDetail()
  })

  document.getElementById('realtimeDetailOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'realtimeDetailOverlay') {
      closeRealtimeDetail()
    }
  })

  tabContentEl.querySelectorAll('[data-source-save]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      const observationId = button.dataset.sourceSave
      const valueInput = tabContentEl.querySelector(`[data-source-edit-value="${escapeAttribute(observationId)}"]`)
      await mutateRealtimeObservation({
        id: observationId,
        value: valueInput?.value
      }, 'update')
    })
  })

  tabContentEl.querySelectorAll('[data-source-delete]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      await mutateRealtimeObservation({
        id: button.dataset.sourceDelete
      }, 'delete')
    })
  })

  tabContentEl.querySelectorAll('[data-source-create]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      const sourceType = button.dataset.sourceCreate
      const valueInput = tabContentEl.querySelector(`[data-source-create-value="${escapeAttribute(sourceType)}"]`)
      await mutateRealtimeObservation({
        sourceType,
        value: valueInput?.value
      }, 'create')
    })
  })

  tabContentEl.querySelectorAll('[data-source-create-slot]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      const sourceType = button.dataset.sourceCreateSlot
      const observedAt = button.dataset.sourceCreateObservedAt
      const valueInput = tabContentEl.querySelector(`[data-source-create-telemetry="${escapeAttribute(observedAt)}"]`)
      await mutateRealtimeObservation({
        sourceType,
        observedAt,
        slotTime: realtimeState.slotDetail?.slot?.slotTime,
        value: valueInput?.value
      }, 'create')
    })
  })
}

function describeObservationType(type) {
  return type === OBSERVATION_TYPES.airTemperature ? '气温' : '水位'
}

function formatDateTimeLabel(value) {
  return formatDateTimeLabelFromUtils(value)
}

function formatDateObjectLabel(date) {
  return formatDateObjectLabelFromUtils(date)
}

function formatDateTimeInputValue(value) {
  return formatDateTimeInputValueFromUtils(value)
}

function describeCompareStatus(status) {
  const option = COMPARE_STATUS_OPTIONS.find((item) => item.value === status)
  return option?.label || status || '未比较'
}

function describeAnomalyType(type) {
  if (type === 'missing_manual') return '人工值缺失'
  if (type === 'missing_telemetry') return '遥测值缺失'
  if (type === 'missing_video_ocr') return '视频识别缺失'
  if (type === 'source_inconsistency') return '多源不一致'
  return type || '异常'
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function buildTrendStats(trend) {
  return buildTrendStatsFromUtils(trend)
}

function sortRealtimeSlots(slots) {
  return sortRealtimeSlotsFromUtils(slots)
}

function formatNumericValue(value) {
  return formatNumericValueFromUtils(value)
}

function buildSlotTooltip(slot) {
  return [
    `时间：${formatDateTimeLabel(slot.slotTime)}`,
    `人工值：${formatNumericValue(slot.manualValue)}`,
    `遥测参考：${formatNumericValue(slot.telemetryValue)}`,
    `视频识别：${formatNumericValue(slot.videoOcrValue)}`,
    `采用值：${formatNumericValue(slot.chosenValue)}`,
    `对比状态：${describeCompareStatus(slot.compareStatus)}`,
    `异常数量：${slot.anomalyCount || 0}`
  ].join('\n')
}

function getTrendUnit() {
  return realtimeState.selectedObservationType === OBSERVATION_TYPES.airTemperature ? '℃' : 'm'
}

function clamp(value, min, max) {
  return clampFromUtils(value, min, max)
}

function formatAxisTimeLabel(timestamp, mode = 'auto') {
  return formatAxisTimeLabelFromUtils(timestamp, mode)
}

function getTrendPresetDuration(preset) {
  return getTrendPresetDurationFromUtils(preset)
}

function getVisibleTrendRange(sortedSlots) {
  return getVisibleTrendRangeFromUtils(sortedSlots, realtimeState)
}

function getTrendAxisStep(range) {
  return getTrendAxisStepFromUtils(range)
}

function getTrendAxisLabelStrategy(range, innerWidth) {
  return getTrendAxisLabelStrategyFromUtils(range, innerWidth)
}

function alignTrendTick(timestamp, stepHours) {
  return alignTrendTickFromUtils(timestamp, stepHours)
}

function buildTrendTicks(range, step) {
  return buildTrendTicksFromUtils(range, step)
}

function buildTrendAxisModel(range, innerWidth) {
  return buildTrendAxisModelFromUtils(range, innerWidth)
}

function isTrendKeyTimestamp(timestamp, spanHours) {
  return isTrendKeyTimestampFromUtils(timestamp, spanHours)
}

function buildTrendHoverCardMarkup(slotModel) {
  return buildTrendHoverCardMarkupFromRenderer(slotModel, {
    escapeAttribute,
    escapeHtml,
    formatDateTimeLabel,
    formatNumericValue,
    describeCompareStatus
  })
}

function bindTrendChartHover() {
  bindTrendChartHoverView({
    realtimeState,
    buildTrendHoverCardMarkup
  })
}

function bindTrendViewportInteractions(slots) {
  bindTrendViewportInteractionsView(slots, {
    trendViewportBindingsControllerRef: {
      get current() {
        return trendViewportBindingsController
      },
      set current(value) {
        trendViewportBindingsController = value
      }
    },
    trendViewportRenderFrameRef: {
      get current() {
        return trendViewportRenderFrame
      },
      set current(value) {
        trendViewportRenderFrame = value
      }
    },
    realtimeState,
    sortRealtimeSlots,
    getVisibleTrendRange,
    clamp,
    setTrendViewport,
    renderWorkbench
  })
}

function getTrendVisibleSeries() {
  return [
    { key: 'manualValue', sourceType: 'manual', name: '人工值' },
    { key: 'telemetryValue', sourceType: 'telemetry', name: '遥测参考值' },
    { key: 'videoOcrValue', sourceType: 'video_ocr', name: '视频识别值' },
    { key: 'chosenValue', sourceType: 'chosen', name: '采用值' }
  ].filter((item) => realtimeState.trendSeriesVisibility[item.sourceType] !== false)
}

function resetTrendViewport() {
  realtimeState.trendZoomStart = null
  realtimeState.trendZoomEnd = null
  realtimeState.trendDragState = null
}

function setTrendPreset(preset) {
  realtimeState.trendPreset = preset
  resetTrendViewport()
}

function zoomTrendView(direction, slots) {
  const sortedSlots = sortRealtimeSlots(slots)
  const range = getVisibleTrendRange(sortedSlots)
  if (range.start == null || range.end == null || range.allStart == null || range.allEnd == null) return

  if (direction === 'reset') {
    resetTrendViewport()
    realtimeState.trendPreset = '24h'
    return
  }

  const span = range.end - range.start
  const center = range.start + span / 2
  const factor = direction === 'in' ? 0.65 : 1.5
  const nextSpan = clamp(span * factor, 2 * 60 * 60 * 1000, Math.max(range.allEnd - range.allStart, 2 * 60 * 60 * 1000))
  realtimeState.trendPreset = 'custom'
  realtimeState.trendZoomStart = clamp(center - nextSpan / 2, range.allStart, range.allEnd)
  realtimeState.trendZoomEnd = clamp(center + nextSpan / 2, range.allStart, range.allEnd)
}

function setTrendViewport(center, span, bounds) {
  const clampedSpan = clamp(span, 2 * 60 * 60 * 1000, Math.max(bounds.allEnd - bounds.allStart, 2 * 60 * 60 * 1000))
  let nextStart = center - clampedSpan / 2
  let nextEnd = center + clampedSpan / 2

  if (nextStart < bounds.allStart) {
    nextEnd += bounds.allStart - nextStart
    nextStart = bounds.allStart
  }
  if (nextEnd > bounds.allEnd) {
    nextStart -= nextEnd - bounds.allEnd
    nextEnd = bounds.allEnd
  }

  realtimeState.trendPreset = 'custom'
  realtimeState.trendZoomStart = clamp(nextStart, bounds.allStart, bounds.allEnd)
  realtimeState.trendZoomEnd = clamp(nextEnd, bounds.allStart, bounds.allEnd)
}

function buildTrendOverviewSvg(slots) {
  return buildTrendOverviewSvgFromRenderer(slots, {
    getVisibleTrendRange,
    sortRealtimeSlots
  })
}

function buildTrendChartSvg(slots) {
  const result = buildTrendChartSvgFromRenderer(slots, {
    realtimeState,
    trendSeriesColors: TREND_SERIES_COLORS,
    buildSlotTooltip,
    buildTrendAxisModel,
    describeCompareStatus,
    escapeAttribute,
    escapeHtml,
    formatAxisTimeLabel,
    formatDateTimeLabel,
    formatNumericValue,
    getTrendUnit,
    getTrendVisibleSeries,
    getVisibleTrendRange,
    isTrendKeyTimestamp,
    sortRealtimeSlots
  })
  realtimeState.trendHoverModel = result.hoverModel
  return result.markup
}

function renderTrendPanel(slots) {
  const result = renderTrendPanelFromRenderer(slots, {
    realtimeState,
    trendSeriesColors: TREND_SERIES_COLORS,
    buildSlotTooltip,
    buildTrendAxisModel,
    buildTrendStats,
    describeCompareStatus,
    describeObservationType,
    escapeAttribute,
    escapeHtml,
    formatAxisTimeLabel,
    formatDateTimeLabel,
    formatNumericValue,
    getTrendUnit,
    getTrendVisibleSeries,
    getVisibleTrendRange,
    isTrendKeyTimestamp,
    sortRealtimeSlots
  })
  realtimeState.trendHoverModel = result.hoverModel
  return result.markup
}

function renderRealtimeDetailModal(detail) {
  return renderRealtimeDetailModalView(detail, {
    escapeHtml,
    formatDateTimeLabel,
    describeCompareStatus,
    describeObservationType,
    describeAnomalyType,
    realtimeState
  })
}

function renderSlotCheckResultModal(result) {
  return renderSlotCheckResultModalView(result, {
    escapeHtml,
    formatDateTimeLabel,
    describeObservationType
  })
}

function renderRealtimeView(station) {
  renderRealtimeViewSection(station, {
    tabContentEl,
    realtimeState,
    observationTypes: OBSERVATION_TYPES,
    sortRealtimeSlots,
    escapeAttribute,
    escapeHtml,
    formatDateTimeInputValue,
    compareStatusOptions: COMPARE_STATUS_OPTIONS,
    renderTrendPanel,
    renderRealtimeDetailModal,
    renderSlotCheckResultModal,
    formatDateTimeLabel,
    formatNumericValue,
    describeCompareStatus,
    resetTrendViewport,
    loadRealtimeSlots,
    loadRealtimeSlotDetail,
    seedRealtimeData,
    applyRealtimeFilters,
    renderWorkbench,
    setTrendPreset,
    zoomTrendView,
    bindTrendChartHover,
    bindTrendViewportInteractions,
    submitRealtimeCorrection,
    mutateRealtimeObservation,
    runSlotQualityCheck,
    openReviewTaskBoard,
    closeRealtimeDetail,
    openRealtimeSlotCreateForm,
    closeRealtimeSlotCreateForm,
    createRealtimeSlotObservation,
    toggleRealtimeSlotSelection,
    openConfirmAction,
    deleteRealtimeSlots,
    notifyAgentContextChanged
  })
}

async function closeRealtimeDetail() {
  const source = realtimeState.slotDetailSource
  const slotTasks = realtimeState.slotDetail?.reviewTasks || []
  realtimeState.selectedSlotId = null
  realtimeState.slotDetail = null
  realtimeState.slotDetailSource = null
  realtimeState.correctionError = ''
  if (source === 'review') {
    syncReviewStateWithSlotTasks(slotTasks)
    activeFunctionKey = 'review'
    await loadReviewTasks()
    syncReviewStateWithSlotTasks(slotTasks)
  }
  renderWorkbench()
}

function renderTabContent(station) {
  stationForm.hidden = true
  ruleConfigForm.hidden = true
  if (!station) {
    tabContentEl.innerHTML = '<div class="empty-state">请先选择或新建站点。</div>'
    return
  }

  if (activeFunctionKey === 'basic') {
    tabContentEl.innerHTML = ''
    renderStationForm(station)
    return
  }

  if (activeFunctionKey === 'realtime') {
    renderRealtimeView(station)
    return
  }

  if (activeFunctionKey === 'review') {
    renderReviewTaskView(station)
    return
  }

  if (activeFunctionKey === 'rule-config') {
    renderRuleConfigView(station)
    return
  }

  renderPlaceholderRows([
    ['水位日统计', station.schedule?.waterLevelStatAt || '00:00', '待生成', '含摘录与均值误差比较'],
    ['气象日统计', station.schedule?.meteorologicalStatAt || '20:00', '待生成', '气温日统计'],
    ['异常清单', '实时', '待生成', '缺失、可疑、确定性错误'],
    ['人工确认记录', '按需', '待生成', '修正与确认留痕']
  ])
}

function renderHeader(station) {
  renderHeaderView({
    currentStationTitleEl,
    currentStationMetaEl,
    activeFunctionTitleEl,
    activeFunctionMetaEl,
    station,
    activeFunction: getActiveFunction(),
    describeObservationTypes
  })
}

function renderWorkbench() {
  const station = getSelectedStation()
  renderStationTree()
  renderFunctionTabs()
  renderHeader(station)
  renderTabContent(station)
}

async function selectStation(stationId) {
  selectedStationId = stationId
  realtimeState.slotCheckResult = null
  reviewState.lastSlotCheck = null

  if (!stationId) {
    reviewState.runSummary = null
    renderWorkbench()
    notifyAgentContextChanged()
    return
  }

  try {
    if (window.electronAPI?.getHydrologyStation) {
      const detail = await window.electronAPI.getHydrologyStation(stationId)
      if (detail) {
        const normalized = normalizeStation(detail)
        stations = stations.map((station) => station.id === normalized.id ? normalized : station)
        normalizeReviewObservationTypeForStation(normalized)
      }
    }
    if (activeFunctionKey === 'realtime') {
      resetTrendViewport()
      realtimeState.trendPreset = '24h'
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      await loadRealtimeSlots()
    } else if (activeFunctionKey === 'review') {
      reviewState.selectedTaskId = null
      await loadReviewTasks()
      await loadLatestReviewRunSummary()
    } else {
      activeFunctionKey = 'basic'
    }
  } catch (err) {
    console.error('[HydrologyWorkbench] Failed to load station detail:', err)
  }

  renderWorkbench()
  notifyAgentContextChanged()
}

async function loadStations() {
  try {
    if (!window.electronAPI?.listHydrologyStations) {
      return
    }

    const result = await window.electronAPI.listHydrologyStations()
    stations = Array.isArray(result) ? result.map(normalizeStation) : []

    if (stations.length === 0) {
      selectedStationId = null
      return
    }

    if (!selectedStationId || !stations.some((station) => station.id === selectedStationId)) {
      selectedStationId = stations[0].id
    }
  } catch (err) {
    console.error('[HydrologyWorkbench] Failed to load stations:', err)
  }
}

async function openReviewTaskSlot(taskId, slotTime) {
  const station = getSelectedStation()
  if (!station || !taskId || !slotTime) {
    return
  }

  reviewState.selectedTaskId = taskId
  realtimeState.selectedObservationType = reviewState.selectedObservationType
  realtimeState.slotDetailSource = 'review'

  try {
    await loadRealtimeSlots()
    const matchedSlot = realtimeState.slots.find((item) => item.slotTime === slotTime) || null
    if (matchedSlot) {
      realtimeState.selectedSlotId = matchedSlot.id
      await loadRealtimeSlotDetail(matchedSlot.id)
    }
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    reviewState.error = err?.message || String(err)
    realtimeState.slotDetailSource = null
    renderWorkbench()
  }
}

async function openReviewTaskBoard() {
  realtimeState.slotCheckResult = null
  reviewState.selectedObservationType = realtimeState.selectedObservationType
  reviewState.selectedTaskId = null
  reviewState.lastSlotCheck = null
  activeFunctionKey = 'review'
  await loadReviewTasks()
  await loadLatestReviewRunSummary()
  renderWorkbench()
  notifyAgentContextChanged()
}

async function loadRealtimeSlots() {
  await loadRealtimeSlotsAction({
    getSelectedStation,
    realtimeState,
    observationTypes: OBSERVATION_TYPES,
    electronAPI: window.electronAPI,
    loadRealtimeTrend,
    loadRealtimeSlotDetail
  })
  realtimeState.selectedSlotIds = realtimeState.selectedSlotIds.filter((slotId) => realtimeState.slots.some((slot) => slot.id === slotId))
}

async function loadRealtimeSlotDetail(slotId) {
  await loadRealtimeSlotDetailAction(slotId, {
    realtimeState,
    electronAPI: window.electronAPI
  })
}

async function loadRealtimeTrend() {
  await loadRealtimeTrendAction({
    getSelectedStation,
    realtimeState,
    electronAPI: window.electronAPI
  })
}

async function loadReviewTasks() {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.listHydrologyReviewTasks) {
    reviewState.error = ''
    reviewState.tasks = []
    reviewState.selectedTaskId = null
    return
  }

  reviewState.error = ''
  try {
    const tasks = await window.electronAPI.listHydrologyReviewTasks({
      stationId: station.id,
      observationType: reviewState.selectedObservationType,
      status: reviewState.statusFilter
    })
    reviewState.tasks = Array.isArray(tasks) ? tasks : []
    reviewState.selectedTaskIds = reviewState.selectedTaskIds.filter((taskId) => reviewState.tasks.some((item) => item.id === taskId))
    const totalPages = Math.max(1, Math.ceil(reviewState.tasks.length / (reviewState.pageSize || 10)))
    reviewState.page = Math.min(Math.max(reviewState.page || 1, 1), totalPages)
    if (!reviewState.tasks.some((item) => item.id === reviewState.selectedTaskId)) {
      reviewState.selectedTaskId = reviewState.tasks[0]?.id || null
    }
  } catch (err) {
    reviewState.error = err?.message || String(err)
    reviewState.tasks = []
    reviewState.selectedTaskId = null
  }
}

function toggleReviewTaskSelection(taskId, checked) {
  const id = String(taskId || '').trim()
  if (!id) return
  const next = new Set(reviewState.selectedTaskIds)
  if (checked) next.add(id)
  else next.delete(id)
  reviewState.selectedTaskIds = Array.from(next)
}

function toggleRealtimeSlotSelection(slotId, checked) {
  const id = String(slotId || '').trim()
  if (!id) return
  const next = new Set(realtimeState.selectedSlotIds)
  if (checked) next.add(id)
  else next.delete(id)
  realtimeState.selectedSlotIds = Array.from(next)
}

async function deleteReviewTasks(taskIds = []) {
  const ids = Array.isArray(taskIds) ? taskIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (ids.length === 0 || !window.electronAPI?.deleteHydrologyReviewTasks) return
  reviewState.error = ''
  try {
    await window.electronAPI.deleteHydrologyReviewTasks(ids)
    reviewState.selectedTaskIds = reviewState.selectedTaskIds.filter((taskId) => !ids.includes(taskId))
    if (ids.includes(reviewState.selectedTaskId)) {
      reviewState.selectedTaskId = null
    }
    await loadReviewTasks()
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    reviewState.error = err?.message || String(err)
    renderWorkbench()
  }
}

async function createRealtimeSlotObservation(payload = {}) {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.createHydrologyRealtimeObservation) return
  realtimeState.error = ''
  try {
    await window.electronAPI.createHydrologyRealtimeObservation({
      stationId: station.id,
      observationType: realtimeState.selectedObservationType,
      sourceType: 'manual',
      slotTime: payload.slotTime,
      observedAt: payload.observedAt || payload.slotTime,
      value: payload.value
    })
    realtimeState.createSlotDraft.visible = false
    realtimeState.createSlotDraft.slotTime = ''
    realtimeState.createSlotDraft.value = ''
    await loadRealtimeSlots()
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.error = err?.message || String(err)
    renderWorkbench()
  }
}

async function deleteRealtimeSlots(slotIds = []) {
  const station = getSelectedStation()
  const slots = realtimeState.slots.filter((slot) => slotIds.includes(slot.id))
  if (!station || slots.length === 0 || !window.electronAPI?.deleteHydrologyRealtimeSlotObservations) return
  realtimeState.error = ''
  try {
    for (const slot of slots) {
      await window.electronAPI.deleteHydrologyRealtimeSlotObservations({
        stationId: station.id,
        observationType: slot.observationType,
        slotTime: slot.slotTime
      })
    }
    realtimeState.selectedSlotIds = realtimeState.selectedSlotIds.filter((slotId) => !slotIds.includes(slotId))
    if (slotIds.includes(realtimeState.selectedSlotId)) {
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      realtimeState.slotDetailSource = null
    }
    await loadRealtimeSlots()
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.error = err?.message || String(err)
    renderWorkbench()
  }
}

function buildDefaultRealtimeSlotDraft() {
  const latestSlotTime = realtimeState.slots
    .map((slot) => slot?.slotTime)
    .filter(Boolean)
    .sort()
    .at(-1)
  return {
    visible: true,
    slotTime: latestSlotTime ? formatDateTimeInputValue(latestSlotTime) : '',
    value: ''
  }
}

function openRealtimeSlotCreateForm() {
  realtimeState.error = ''
  realtimeState.createSlotDraft = buildDefaultRealtimeSlotDraft()
  renderWorkbench()
}

function closeRealtimeSlotCreateForm() {
  realtimeState.createSlotDraft = {
    visible: false,
    slotTime: '',
    value: ''
  }
  renderWorkbench()
}

async function resolveReviewTask(taskId, payload) {
  if (!taskId || !window.electronAPI?.resolveHydrologyReviewTask) return
  reviewState.error = ''
  try {
    await window.electronAPI.resolveHydrologyReviewTask({
      taskId,
      payload
    })
  } catch (err) {
    reviewState.error = err?.message || String(err)
  }
}

async function runReviewQualityCheck() {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.runHydrologyQualityCheck) {
    return
  }

  reviewState.error = ''
  reviewState.lastSlotCheck = null
  try {
    reviewState.runSummary = await window.electronAPI.runHydrologyQualityCheck({
      stationId: station.id,
      observationType: reviewState.selectedObservationType
    })
  } catch (err) {
    reviewState.error = err?.message || String(err)
  }
}

async function runSlotQualityCheck({ slotId, slotTime } = {}) {
  const station = getSelectedStation()
  if (!station || !slotTime || !window.electronAPI?.runHydrologyQualityCheck) {
    return
  }

  realtimeState.error = ''
  reviewState.error = ''

  try {
    const summary = await window.electronAPI.runHydrologyQualityCheck({
      stationId: station.id,
      observationType: realtimeState.selectedObservationType,
      fromTime: slotTime,
      toTime: slotTime
    })
    const slotResult = Array.isArray(summary?.slotResults)
      ? summary.slotResults.find((item) => item.slotTime === slotTime) || summary.slotResults[0] || null
      : null

    realtimeState.slotCheckResult = {
      stationId: station.id,
      stationCode: station.code,
      stationName: station.name,
      observationType: realtimeState.selectedObservationType,
      slotId: slotId || slotResult?.slotId || null,
      slotTime,
      slot: slotResult?.slot || null,
      hitCount: slotResult?.hitCount || 0,
      hitRuleCodes: Array.isArray(slotResult?.hitRuleCodes) ? slotResult.hitRuleCodes : [],
      hitsBySeverity: slotResult?.hitsBySeverity || {},
      hits: Array.isArray(slotResult?.hits) ? slotResult.hits : [],
      ruleEvaluations: Array.isArray(slotResult?.ruleEvaluations) ? slotResult.ruleEvaluations : []
    }
    if (slotId) realtimeState.selectedSlotId = slotId
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.error = err?.message || String(err)
    renderWorkbench()
  }
}

function resetRealtimeFilters() {
  resetRealtimeFiltersAction({
    realtimeState,
    resetTrendViewport
  })
}

async function applyRealtimeFilters(formData) {
  await applyRealtimeFiltersAction(formData, {
    realtimeState,
    resetTrendViewport,
    loadRealtimeSlots,
    renderWorkbench
  })
}

async function seedRealtimeData() {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.seedHydrologyRealtimeData) {
    return
  }

  realtimeState.error = ''
  realtimeState.slotCheckResult = null
  try {
    await window.electronAPI.seedHydrologyRealtimeData(station.id)
    await loadRealtimeSlots()
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.error = err?.message || String(err)
    renderWorkbench()
  }
}

async function submitRealtimeCorrection(form) {
  const station = getSelectedStation()
  const detail = realtimeState.slotDetail
  if (!station || !detail || !window.electronAPI?.applyHydrologyRealtimeCorrection) {
    return
  }

  realtimeState.correctionError = ''
  realtimeState.slotCheckResult = null
  const formData = new FormData(form)
  try {
    await window.electronAPI.applyHydrologyRealtimeCorrection({
      stationId: station.id,
      observationType: detail.slot.observationType,
      targetTime: detail.slot.slotTime,
      beforeValue: detail.slot.chosenValue ?? detail.manualObservation?.value,
      afterValue: formData.get('afterValue'),
      reason: formData.get('reason')
    })
    await loadRealtimeSlots()
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.correctionError = err?.message || String(err)
    renderWorkbench()
  }
}

async function mutateRealtimeObservation(payload = {}, mode = 'update') {
  const station = getSelectedStation()
  const detail = realtimeState.slotDetail
  if (!station || !detail) return

  realtimeState.observationMutationError = ''
  realtimeState.slotCheckResult = null
  try {
    if (mode === 'delete') {
      if (!window.electronAPI?.deleteHydrologyRealtimeObservation) return
      await window.electronAPI.deleteHydrologyRealtimeObservation(payload.id)
    } else if (mode === 'create') {
      if (!window.electronAPI?.createHydrologyRealtimeObservation) return
      await window.electronAPI.createHydrologyRealtimeObservation({
        stationId: station.id,
        observationType: detail.slot.observationType,
        slotTime: payload.slotTime || detail.slot.slotTime,
        observedAt: payload.observedAt || detail.slot.slotTime,
        sourceType: payload.sourceType,
        value: payload.value
      })
    } else {
      if (!window.electronAPI?.updateHydrologyRealtimeObservation) return
      await window.electronAPI.updateHydrologyRealtimeObservation(payload)
    }
    await loadRealtimeSlots()
    const matchedSlot = realtimeState.slots.find((item) => item.id === detail.slot.id) || null
    if (matchedSlot) {
      realtimeState.selectedSlotId = matchedSlot.id
      await loadRealtimeSlotDetail(matchedSlot.id)
    } else {
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
    }
    if (realtimeState.slotDetailSource === 'review') {
      syncReviewStateWithSlotTasks(realtimeState.slotDetail?.reviewTasks || [])
      await loadReviewTasks()
      syncReviewStateWithSlotTasks(realtimeState.slotDetail?.reviewTasks || [])
    }
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    realtimeState.observationMutationError = err?.message || String(err)
    renderWorkbench()
  }
}

function showCreateStationForm() {
  selectedStationId = null
  activeFunctionKey = 'basic'
  realtimeState.slotCheckResult = null
  renderWorkbench()
  renderStationForm(createEmptyStation())
  notifyAgentContextChanged()
}

function collectStationFromForm() {
  const formData = new FormData(stationForm)
  const currentStation = stations.find((station) => station.id === stationForm.dataset.stationId)
  return normalizeStation({
    ...(currentStation || {}),
    id: stationForm.dataset.stationId || '',
    code: formData.get('code'),
    name: formData.get('name'),
    basin: formData.get('basin'),
    river: formData.get('river'),
    longitude: formData.get('longitude'),
    latitude: formData.get('latitude'),
    elevation: formData.get('elevation'),
    observationTypes: formData.getAll('observationTypes'),
    status: formData.get('status'),
    dataSources: {
      manual: formData.has('manual'),
      videoOcr: formData.has('videoOcr'),
      telemetry: formData.has('telemetry')
    },
    schedule: {
      waterLevelStatAt: formData.get('waterLevelStatAt'),
      meteorologicalStatAt: formData.get('meteorologicalStatAt'),
      waterLevelExcerptEnabled: true
    }
  })
}

function collectRuleConfigFromForm() {
  const stationId = ruleConfigForm.dataset.stationId
  const currentStation = stations.find((station) => station.id === stationId)
  if (!currentStation) {
    throw new Error('当前站点不存在，无法保存规则配置')
  }

  const formData = new FormData(ruleConfigForm)
  return normalizeStation({
    ...currentStation,
    validationRules: {
      ...(currentStation.validationRules || {}),
      waterLevel: {
        ...(currentStation.validationRules?.waterLevel || {}),
        sectionMinElevation: Number(formData.get('waterLevelSectionMinElevation') || 0),
        sectionMaxElevation: Number(formData.get('waterLevelSectionMaxElevation') || 50),
        maxHourlyDelta: Number(formData.get('waterLevelMaxHourlyDelta') || 0.1),
        manualVideoTolerance: Number(formData.get('waterLevelManualVideoTolerance') || 0.1),
        requireManualObservation: formData.has('waterLevelRequireManualObservation'),
        requireVideoReference: formData.has('waterLevelRequireVideoReference')
      }
    }
  })
}

function getAgentContext() {
  const station = getSelectedStation()
  const activeFunction = getActiveFunction()
  const realtimeSlot = activeFunctionKey === 'realtime' ? realtimeState.slotDetail?.slot || null : null
  const reviewTask = activeFunctionKey === 'review'
    ? reviewState.tasks.find((item) => item.id === reviewState.selectedTaskId) || null
    : null
  return {
    title: station ? `${station.name} / ${activeFunction.label}` : activeFunction.label,
    summary: station
      ? `当前站点：${station.name}（${station.code}），当前功能：${activeFunction.label}${realtimeSlot ? `，当前时槽：${formatDateTimeLabel(realtimeSlot.slotTime)}` : ''}${reviewTask ? `，当前审核任务：${reviewTask.ruleCode}` : ''}。`
      : '当前未选择站点。',
    payload: {
      appId: 'hydrology-workbench',
      station,
      function: activeFunction,
      realtimeSlot,
      reviewTask
    }
  }
}

stationForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const nextStation = collectStationFromForm()
  const errors = validateStation(nextStation)
  if (errors.length > 0) {
    stationFormError.textContent = errors.join('；')
    return
  }

  stationFormError.textContent = ''

  try {
    const saved = window.electronAPI?.saveHydrologyStation
      ? await window.electronAPI.saveHydrologyStation(nextStation)
      : nextStation

    await loadStations()
    selectedStationId = saved?.id || nextStation.id || stations[0]?.id || null
    activeFunctionKey = 'basic'
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    stationFormError.textContent = err?.message || String(err)
  }
})

ruleConfigForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  ruleConfigFormError.textContent = ''

  try {
    const nextStation = collectRuleConfigFromForm()
    const saved = window.electronAPI?.saveHydrologyStation
      ? await window.electronAPI.saveHydrologyStation(nextStation)
      : nextStation

    await loadStations()
    selectedStationId = saved?.id || nextStation.id || selectedStationId
    renderWorkbench()
    notifyAgentContextChanged()
  } catch (err) {
    ruleConfigFormError.textContent = err?.message || String(err)
  }
})

resetStationBtn.addEventListener('click', () => {
  showCreateStationForm()
})

newStationBtn.addEventListener('click', () => {
  showCreateStationForm()
})

deleteStationBtn.addEventListener('click', async () => {
  const stationId = stationForm.dataset.stationId
  if (!stationId) {
    return
  }

  const station = stations.find((item) => item.id === stationId)
  openDeleteConfirm(station || { id: stationId })
})

deleteConfirmCancelBtn.addEventListener('click', () => {
  closeDeleteConfirm()
})

deleteConfirmOverlayEl.addEventListener('click', (event) => {
  if (event.target === deleteConfirmOverlayEl) {
    closeDeleteConfirm()
  }
})

deleteConfirmOkBtn.addEventListener('click', async () => {
  stationFormError.textContent = ''
  deleteConfirmOkBtn.disabled = true
  deleteConfirmCancelBtn.disabled = true

  try {
    const action = pendingConfirmAction
    if (!action?.type) {
      closeDeleteConfirm()
      return
    }

    if (action.type === 'delete-station') {
      const stationId = pendingDeleteStationId
      if (!stationId) {
        closeDeleteConfirm()
        return
      }

      if (window.electronAPI?.deleteHydrologyStation) {
        await window.electronAPI.deleteHydrologyStation(stationId)
      }

      closeDeleteConfirm()
      await loadStations()
      activeFunctionKey = 'basic'
      renderWorkbench()
      notifyAgentContextChanged()

      if (stations.length === 0) {
        showCreateStationForm()
      }
      return
    }

    if (action.type === 'delete-review-tasks') {
      closeDeleteConfirm()
      await deleteReviewTasks(action.taskIds || [])
      return
    }

    if (action.type === 'delete-realtime-slots') {
      closeDeleteConfirm()
      await deleteRealtimeSlots(action.slotIds || [])
      return
    }
  } catch (err) {
    stationFormError.textContent = err?.message || String(err)
  } finally {
    deleteConfirmOkBtn.disabled = false
    deleteConfirmCancelBtn.disabled = false
  }
})

agentPanel = mountHydrologyAgentPanel({
  target: hydrologyAgentPanelEl,
  getContext: getAgentContext
})

async function bootstrapWorkbench() {
  await loadStations()
  if (activeFunctionKey === 'realtime') {
    await loadRealtimeSlots()
  }
  if (activeFunctionKey === 'review') {
    await loadReviewTasks()
  }
  renderWorkbench()
  notifyAgentContextChanged(true)
  if (stations.length === 0) {
    showCreateStationForm()
  }
}

bootstrapWorkbench().catch((err) => {
  console.error('[HydrologyWorkbench] Failed to bootstrap workbench:', err)
  renderWorkbench()
  showCreateStationForm()
})
