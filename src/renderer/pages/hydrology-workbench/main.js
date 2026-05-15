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
  renderRealtimeViewSection
} from './realtime-view'

setPageTitle('hydrologyWorkbench')

const stationFunctions = [
  {
    key: 'basic',
    label: '基础信息管理',
    meta: '站点基础资料、观测类别、数据源和校验阈值'
  },
  {
    key: 'realtime',
    label: '实时数据列表',
    meta: '水位和气温实时观测数据'
  },
  {
    key: 'review',
    label: '审核任务状态',
    meta: '缺测、边界、时序、变幅、毛刺和一致性检查'
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
  corrected: '#dc2626'
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
    corrected: true
  },
  slots: [],
  page: 1,
  pageSize: 10,
  selectedSlotId: null,
  slotDetail: null,
  trend: null,
  trendHoverModel: null,
  error: '',
  trendError: '',
  correctionError: ''
}
let reviewState = {
  selectedObservationType: OBSERVATION_TYPES.waterLevel,
  statusFilter: 'all',
  tasks: [],
  selectedTaskId: null,
  error: ''
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
const resetStationBtn = document.getElementById('resetStationBtn')
const deleteStationBtn = document.getElementById('deleteStationBtn')
const deleteConfirmOverlayEl = document.getElementById('deleteConfirmOverlay')
const deleteConfirmMessageEl = document.getElementById('deleteConfirmMessage')
const deleteConfirmCancelBtn = document.getElementById('deleteConfirmCancelBtn')
const deleteConfirmOkBtn = document.getElementById('deleteConfirmOkBtn')
const hydrologyAgentPanelEl = document.getElementById('hydrologyAgentPanel')
let agentPanel = null
let pendingDeleteStationId = null
let trendViewportBindingsController = null
let trendViewportRenderFrame = null

function notifyAgentContextChanged(force = false) {
  agentPanel?.notifyContextChanged(force)
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

function closeDeleteConfirm() {
  pendingDeleteStationId = null
  deleteConfirmOverlayEl.hidden = true
}

function openDeleteConfirm(station) {
  pendingDeleteStationId = station?.id || null
  deleteConfirmMessageEl.textContent = `确认删除站点“${station?.name || station?.id || ''}”吗？`
  deleteConfirmOverlayEl.hidden = false
}

function renderPlaceholderRows(rows) {
  renderPlaceholderRowsView({
    tabContentEl,
    rows,
    escapeHtml
  })
}

function renderReviewTaskView(station) {
  tabContentEl.innerHTML = renderReviewView(station, reviewState, {
    describeObservationType
  })

  tabContentEl.querySelectorAll('[data-review-observation-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      reviewState.selectedObservationType = button.dataset.reviewObservationType
      reviewState.selectedTaskId = null
      await loadReviewTasks()
      renderWorkbench()
      notifyAgentContextChanged()
    })
  })

  document.getElementById('reviewFilterForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    reviewState.statusFilter = String(formData.get('status') || 'all').trim() || 'all'
    reviewState.selectedTaskId = null
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
    { key: 'chosenValue', sourceType: 'corrected', name: '采用值' }
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
    submitRealtimeCorrection
  })
}

function renderTabContent(station) {
  stationForm.hidden = true
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

  if (!stationId) {
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

async function loadRealtimeSlots() {
  await loadRealtimeSlotsAction({
    getSelectedStation,
    realtimeState,
    observationTypes: OBSERVATION_TYPES,
    electronAPI: window.electronAPI,
    loadRealtimeTrend,
    loadRealtimeSlotDetail
  })
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
    if (!reviewState.tasks.some((item) => item.id === reviewState.selectedTaskId)) {
      reviewState.selectedTaskId = reviewState.tasks[0]?.id || null
    }
  } catch (err) {
    reviewState.error = err?.message || String(err)
    reviewState.tasks = []
    reviewState.selectedTaskId = null
  }
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

function showCreateStationForm() {
  selectedStationId = null
  activeFunctionKey = 'basic'
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
    },
    validationRules: {
      ...(currentStation?.validationRules || {}),
      waterLevel: {
        ...(currentStation?.validationRules?.waterLevel || {}),
        maxHourlyChange: Number(formData.get('waterLevelMaxHourlyChange') || 0)
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
  const stationId = pendingDeleteStationId
  if (!stationId) {
    closeDeleteConfirm()
    return
  }

  stationFormError.textContent = ''
  deleteConfirmOkBtn.disabled = true
  deleteConfirmCancelBtn.disabled = true

  try {
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
