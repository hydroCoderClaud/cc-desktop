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
  const groups = groupStationsByBasin()
  stationTreeEl.innerHTML = Object.entries(groups)
    .map(([basin, basinStations]) => `
      <section class="tree-group">
        <div class="tree-basin">${escapeHtml(basin)}</div>
        ${basinStations.map((station) => `
          <div class="tree-station ${station.id === selectedStationId ? 'active' : ''}">
            <button type="button" data-station-id="${escapeHtml(station.id)}">
              <strong>${escapeHtml(station.name)}</strong>
              <span>${escapeHtml(station.code)} · ${escapeHtml(describeStatus(station.status))}</span>
            </button>
          </div>
        `).join('')}
      </section>
    `)
    .join('')

  stationTreeEl.querySelectorAll('[data-station-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await selectStation(button.dataset.stationId)
    })
  })
}

function renderFunctionTabs() {
  functionTabsEl.innerHTML = stationFunctions
    .map((item) => `
      <button class="function-tab ${item.key === activeFunctionKey ? 'active' : ''}" type="button" data-function-key="${item.key}">
        ${escapeHtml(item.label)}
      </button>
    `)
    .join('')

  functionTabsEl.querySelectorAll('[data-function-key]').forEach((button) => {
    button.addEventListener('click', async () => {
      activeFunctionKey = button.dataset.functionKey
      if (activeFunctionKey === 'realtime') {
        realtimeState.selectedSlotId = null
        realtimeState.slotDetail = null
        await loadRealtimeSlots()
      }
      renderWorkbench()
    })
  })
}

function setCheckedValues(name, values) {
  stationForm.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value)
  })
}

function renderStationForm(station) {
  const nextStation = station || createEmptyStation()
  stationForm.hidden = false
  stationForm.dataset.stationId = nextStation.id || ''
  stationForm.elements.code.value = nextStation.code || ''
  stationForm.elements.name.value = nextStation.name || ''
  stationForm.elements.basin.value = nextStation.basin || ''
  stationForm.elements.river.value = nextStation.river || ''
  stationForm.elements.longitude.value = nextStation.longitude ?? ''
  stationForm.elements.latitude.value = nextStation.latitude ?? ''
  stationForm.elements.elevation.value = nextStation.elevation ?? ''
  stationForm.elements.status.value = nextStation.status || 'active'
  stationForm.elements.manual.checked = !!nextStation.dataSources?.manual
  stationForm.elements.videoOcr.checked = !!nextStation.dataSources?.videoOcr
  stationForm.elements.telemetry.checked = !!nextStation.dataSources?.telemetry
  stationForm.elements.waterLevelStatAt.value = nextStation.schedule?.waterLevelStatAt || '00:00'
  stationForm.elements.meteorologicalStatAt.value = nextStation.schedule?.meteorologicalStatAt || '20:00'
  stationForm.elements.waterLevelMaxHourlyChange.value = nextStation.validationRules?.waterLevel?.maxHourlyChange ?? 2
  setCheckedValues('observationTypes', nextStation.observationTypes || [OBSERVATION_TYPES.waterLevel])
  stationFormError.textContent = ''
  deleteStationBtn.disabled = !nextStation.id
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
  tabContentEl.innerHTML = `
    <div class="data-surface">
      ${rows.map((row) => `
        <div class="data-row">
          <strong>${escapeHtml(row[0])}</strong>
          <span>${escapeHtml(row[1])}</span>
          <span>${escapeHtml(row[2])}</span>
          <em>${escapeHtml(row[3])}</em>
        </div>
      `).join('')}
    </div>
  `
}

function describeObservationType(type) {
  return type === OBSERVATION_TYPES.airTemperature ? '气温' : '水位'
}

function formatDateTimeLabel(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return normalized
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return normalized.replace('T', ' ').slice(0, 16)
  }

  return formatDateObjectLabel(date)
}

function formatDateObjectLabel(date) {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '--'
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hour = String(value.getHours()).padStart(2, '0')
  const minute = String(value.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatDateTimeInputValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized.replace(' ', 'T').slice(0, 16)
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
  const points = (trend?.series || []).flatMap((series) => series.points || [])
  if (points.length === 0) {
    return {
      totalPoints: 0,
      seriesCount: 0,
      rangeLabel: '暂无数据'
    }
  }

  const timestamps = points
    .map(([time]) => new Date(String(time).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))
    .sort((left, right) => left - right)

  return {
    totalPoints: points.length,
    seriesCount: trend.series.length,
    rangeLabel: timestamps.length > 0
      ? `${formatDateObjectLabel(timestamps[0])} - ${formatDateObjectLabel(timestamps[timestamps.length - 1])}`
      : '暂无数据'
  }
}

function sortRealtimeSlots(slots) {
  return [...(slots || [])].sort((left, right) => String(left.slotTime || '').localeCompare(String(right.slotTime || '')))
}

function formatNumericValue(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
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
  return Math.min(Math.max(value, min), max)
}

function formatAxisTimeLabel(timestamp, mode = 'auto') {
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  if (mode === 'date') return `${month}-${day}`
  if (mode === 'dayhour') return `${month}-${day} ${hour}:00`
  if (mode === 'time') return `${hour}:${minute}`
  return `${month}-${day} ${hour}:${minute}`
}

function getTrendPresetDuration(preset) {
  if (preset === '6h') return 6 * 60 * 60 * 1000
  if (preset === '12h') return 12 * 60 * 60 * 1000
  if (preset === '24h') return 24 * 60 * 60 * 1000
  if (preset === '72h') return 72 * 60 * 60 * 1000
  return null
}

function getVisibleTrendRange(sortedSlots) {
  const timestamps = sortedSlots
    .map((slot) => new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))
    .sort((left, right) => left - right)

  if (timestamps.length === 0) {
    return { start: null, end: null, allStart: null, allEnd: null }
  }

  const allStart = timestamps[0]
  const allEnd = timestamps[timestamps.length - 1]

  if (realtimeState.trendZoomStart != null && realtimeState.trendZoomEnd != null) {
    return {
      start: clamp(realtimeState.trendZoomStart, allStart, allEnd),
      end: clamp(realtimeState.trendZoomEnd, allStart, allEnd),
      allStart,
      allEnd
    }
  }

  const duration = getTrendPresetDuration(realtimeState.trendPreset)
  if (!duration) {
    return { start: allStart, end: allEnd, allStart, allEnd }
  }

  return {
    start: Math.max(allStart, allEnd - duration),
    end: allEnd,
    allStart,
    allEnd
  }
}

function getTrendAxisStep(range) {
  const span = range.end - range.start
  if (span <= 12 * 60 * 60 * 1000) return 60 * 60 * 1000
  if (span <= 48 * 60 * 60 * 1000) return 2 * 60 * 60 * 1000
  if (span <= 96 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000
  return 12 * 60 * 60 * 1000
}

function getTrendAxisLabelStrategy(range, innerWidth) {
  const span = range.end - range.start
  const baseStep = getTrendAxisStep(range)
  const mode = span > 36 * 60 * 60 * 1000 ? 'date' : 'auto'
  const sampleLabel = formatAxisTimeLabel(range.end, mode)
  const estimatedLabelWidth = Math.max(sampleLabel.length * 8, mode === 'date' ? 44 : 92)
  const maxTickCount = Math.max(2, Math.floor(innerWidth / estimatedLabelWidth))
  const roughTickCount = Math.max(1, Math.floor(span / baseStep) + 1)
  const densityFactor = Math.max(1, Math.ceil(roughTickCount / maxTickCount))
  return {
    mode,
    step: baseStep * densityFactor
  }
}

function alignTrendTick(timestamp, stepHours) {
  const aligned = new Date(timestamp)
  aligned.setMinutes(0, 0, 0)
  const currentHour = aligned.getHours()
  const remainder = currentHour % stepHours
  aligned.setHours(currentHour - remainder)
  if (aligned.getTime() < timestamp) {
    aligned.setHours(aligned.getHours() + stepHours)
  }
  return aligned.getTime()
}

function buildTrendTicks(range, step) {
  const stepHours = Math.max(1, Math.round(step / (60 * 60 * 1000)))
  const ticks = []
  for (let current = alignTrendTick(range.start, stepHours); current <= range.end; current += step) {
    ticks.push(current)
  }
  return ticks
}

function buildTrendAxisModel(range, innerWidth) {
  const span = range.end - range.start
  const spanHours = span / (60 * 60 * 1000)
  let minorBase = 60 * 60 * 1000
  let majorBase = 3 * 60 * 60 * 1000
  let minorLabelMode = 'time'
  let majorLabelMode = 'dayhour'

  if (spanHours > 12 && spanHours <= 36) {
    minorBase = 2 * 60 * 60 * 1000
    majorBase = 6 * 60 * 60 * 1000
  } else if (spanHours > 36 && spanHours <= 96) {
    minorBase = 6 * 60 * 60 * 1000
    majorBase = 24 * 60 * 60 * 1000
    majorLabelMode = 'date'
  } else if (spanHours > 96) {
    minorBase = 12 * 60 * 60 * 1000
    majorBase = 24 * 60 * 60 * 1000
    minorLabelMode = 'date'
    majorLabelMode = 'date'
  }

  const minorStrategy = getTrendAxisLabelStrategy(
    { start: range.start, end: range.end },
    innerWidth
  )
  const minorStep = Math.max(minorBase, minorStrategy.step)
  const majorStep = Math.max(majorBase, minorStep * Math.ceil(majorBase / minorStep))
  const majorTicks = buildTrendTicks(range, majorStep)
  const majorTickSet = new Set(majorTicks)
  const minorTicks = buildTrendTicks(range, minorStep).filter((tick) => !majorTickSet.has(tick))

  return {
    minorTicks,
    majorTicks,
    minorLabelMode,
    majorLabelMode,
    spanHours
  }
}

function isTrendKeyTimestamp(timestamp, spanHours) {
  const date = new Date(timestamp)
  const hour = date.getHours()
  if (hour === 0) return true
  if (spanHours <= 36) {
    return hour === 6 || hour === 12 || hour === 18
  }
  return false
}

function buildTrendHoverCardMarkup(slotModel) {
  const metricRows = slotModel.markers
    .map((marker) => `
      <div class="trend-hover-row">
        <span><i style="background:${escapeAttribute(marker.color)}"></i>${escapeHtml(marker.label)}</span>
        <strong>${escapeHtml(formatNumericValue(marker.value))}</strong>
      </div>
    `)
    .join('')

  return `
    <div class="trend-hover-time">${escapeHtml(formatDateTimeLabel(slotModel.slotTime))}</div>
    <div class="trend-hover-meta">${escapeHtml(describeCompareStatus(slotModel.compareStatus))} · ${slotModel.anomalyCount || 0} 项异常</div>
    <div class="trend-hover-metrics">${metricRows}</div>
  `
}

function bindTrendChartHover() {
  const shell = document.getElementById('trendChartShell')
  const svg = shell?.querySelector('.trend-chart-svg')
  const hoverCard = shell?.querySelector('[data-trend-hover-card]')
  const crosshair = svg?.querySelector('[data-trend-hover-crosshair]')
  const hoverMarkers = Array.from(svg?.querySelectorAll('[data-trend-hover-marker]') || [])
  const hoverModel = realtimeState.trendHoverModel

  if (!shell || !svg || !hoverCard || !crosshair || !hoverModel?.slots?.length) {
    return
  }

  const markerMap = new Map(hoverMarkers.map((node) => [node.dataset.trendHoverMarker, node]))

  const hideHover = () => {
    hoverCard.hidden = true
    crosshair.style.display = 'none'
    markerMap.forEach((node) => {
      node.style.display = 'none'
    })
  }

  const showHover = (slotModel) => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return

    crosshair.style.display = 'block'
    crosshair.setAttribute('x1', slotModel.x.toFixed(2))
    crosshair.setAttribute('x2', slotModel.x.toFixed(2))
    crosshair.setAttribute('y1', hoverModel.paddingTop.toFixed(2))
    crosshair.setAttribute('y2', (hoverModel.height - hoverModel.paddingBottom).toFixed(2))

    markerMap.forEach((node, sourceType) => {
      const marker = slotModel.markers.find((item) => item.sourceType === sourceType)
      if (!marker) {
        node.style.display = 'none'
        return
      }
      node.style.display = 'block'
      node.setAttribute('cx', marker.x.toFixed(2))
      node.setAttribute('cy', marker.y.toFixed(2))
      node.setAttribute('fill', marker.color)
      node.setAttribute('stroke', '#ffffff')
    })

    hoverCard.hidden = false
    hoverCard.innerHTML = buildTrendHoverCardMarkup(slotModel)

    const anchorPoint = svg.createSVGPoint()
    anchorPoint.x = slotModel.x
    anchorPoint.y = hoverModel.paddingTop + 12
    const screenPoint = anchorPoint.matrixTransform(ctm)
    const shellRect = shell.getBoundingClientRect()
    const cardWidth = 220
    const cardHeight = hoverCard.offsetHeight || 140
    const preferRight = screenPoint.x - shellRect.left + 14
    const preferLeft = screenPoint.x - shellRect.left - cardWidth - 14
    const left = preferRight + cardWidth > shellRect.width - 8
      ? Math.max(12, preferLeft)
      : Math.max(12, preferRight)
    const top = Math.min(12, Math.max(12, shellRect.height - cardHeight - 12))
    hoverCard.style.left = `${left}px`
    hoverCard.style.top = `${top}px`
  }

  const findNearestSlot = (clientX, clientY) => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const localPoint = point.matrixTransform(ctm.inverse())
    if (
      localPoint.x < hoverModel.paddingLeft - 12
      || localPoint.x > hoverModel.width - hoverModel.paddingRight + 12
      || localPoint.y < hoverModel.paddingTop - 12
      || localPoint.y > hoverModel.height - hoverModel.paddingBottom + 12
    ) {
      return null
    }
    return hoverModel.slots.reduce((nearest, current) => {
      if (!nearest) return current
      return Math.abs(current.x - localPoint.x) < Math.abs(nearest.x - localPoint.x) ? current : nearest
    }, null)
  }

  svg.addEventListener('mousemove', (event) => {
    const slotModel = findNearestSlot(event.clientX, event.clientY)
    if (!slotModel) {
      hideHover()
      return
    }
    showHover(slotModel)
  })

  svg.addEventListener('mouseleave', () => {
    hideHover()
  })

  hideHover()
}

function bindTrendViewportInteractions(slots) {
  trendViewportBindingsController?.abort()
  trendViewportBindingsController = new AbortController()
  const { signal } = trendViewportBindingsController
  if (trendViewportRenderFrame != null) {
    window.cancelAnimationFrame(trendViewportRenderFrame)
    trendViewportRenderFrame = null
  }
  const shell = document.getElementById('trendChartShell')
  const svg = shell?.querySelector('.trend-chart-svg')
  const overview = document.getElementById('trendOverview')
  const overviewSvg = overview?.querySelector('.trend-overview-svg')
  const sortedSlots = sortRealtimeSlots(slots)
  const bounds = getVisibleTrendRange(sortedSlots)

  if (!shell || !svg || !overviewSvg || bounds.start == null || bounds.end == null || bounds.allStart == null || bounds.allEnd == null) {
    return
  }

  const startDrag = (payload) => {
    realtimeState.trendDragState = payload
  }

  const stopDrag = () => {
    realtimeState.trendDragState = null
  }

  const requestTrendRender = () => {
    if (trendViewportRenderFrame != null) return
    trendViewportRenderFrame = window.requestAnimationFrame(() => {
      trendViewportRenderFrame = null
      if (!signal.aborted) {
        renderWorkbench()
      }
    })
  }

  const blockSelection = (event) => {
    event.preventDefault()
  }

  shell.addEventListener('mousedown', blockSelection, { signal })
  shell.addEventListener('selectstart', blockSelection, { signal })
  shell.addEventListener('dragstart', blockSelection, { signal })
  svg.addEventListener('dragstart', blockSelection, { signal })
  overviewSvg.addEventListener('dragstart', blockSelection, { signal })
  overviewSvg.addEventListener('selectstart', blockSelection, { signal })

  shell.addEventListener('wheel', (event) => {
    event.preventDefault()
    const rect = shell.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
    const currentRange = getVisibleTrendRange(sortedSlots)
    const currentSpan = currentRange.end - currentRange.start
    const center = currentRange.start + currentSpan * ratio
    const factor = event.deltaY < 0 ? 0.82 : 1.22
    setTrendViewport(center, currentSpan * factor, currentRange)
    requestTrendRender()
  }, { passive: false, signal })

  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const currentRange = getVisibleTrendRange(sortedSlots)
    startDrag({
      type: 'pan',
      originX: event.clientX,
      start: currentRange.start,
      end: currentRange.end,
      bounds: currentRange,
      shellWidth: shell.getBoundingClientRect().width
    })
    svg.setPointerCapture?.(event.pointerId)
  }, { signal })

  overviewSvg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const target = event.target
    if (!target?.dataset?.trendOverviewHandle && target?.dataset?.trendOverviewWindow !== 'true') {
      return
    }
    const currentRange = getVisibleTrendRange(sortedSlots)
    const svgRect = overviewSvg.getBoundingClientRect()
    const ratio = clamp((event.clientX - svgRect.left) / Math.max(svgRect.width, 1), 0, 1)
    const totalSpan = Math.max(currentRange.allEnd - currentRange.allStart, 1)
    const windowStartRatio = (currentRange.start - currentRange.allStart) / totalSpan
    const windowEndRatio = (currentRange.end - currentRange.allStart) / totalSpan
    const windowSpanRatio = Math.max(windowEndRatio - windowStartRatio, 0)
    const edgeThresholdRatio = 0.018
    let handle = target?.dataset?.trendOverviewHandle || null

    if (!handle && target?.dataset?.trendOverviewWindow === 'true') {
      const distanceToLeft = Math.abs(ratio - windowStartRatio)
      const distanceToRight = Math.abs(ratio - windowEndRatio)
      if (distanceToLeft <= edgeThresholdRatio || distanceToRight <= edgeThresholdRatio) {
        handle = distanceToLeft <= distanceToRight ? 'left' : 'right'
      }
    }

    const mode = handle ? `resize-${handle}` : 'move-window'
    startDrag({
      type: mode,
      originX: event.clientX,
      ratio,
      start: currentRange.start,
      end: currentRange.end,
      bounds: currentRange,
      svgRect,
      pointerOffsetRatio: ratio - windowStartRatio,
      windowSpanRatio
    })
    overviewSvg.setPointerCapture?.(event.pointerId)
  }, { signal })

  const onPointerMove = (event) => {
    const dragState = realtimeState.trendDragState
    if (!dragState) return

    if (dragState.type === 'pan') {
      const deltaRatio = (event.clientX - dragState.originX) / Math.max(dragState.shellWidth, 1)
      const span = dragState.end - dragState.start
      const shift = span * deltaRatio
      const center = (dragState.start + dragState.end) / 2 - shift
      setTrendViewport(center, span, dragState.bounds)
      requestTrendRender()
      return
    }

    const ratio = clamp((event.clientX - dragState.svgRect.left) / Math.max(dragState.svgRect.width, 1), 0, 1)
    const totalSpan = dragState.bounds.allEnd - dragState.bounds.allStart
    const currentSpan = dragState.end - dragState.start

    if (dragState.type === 'move-window') {
      const maxStartRatio = Math.max(0, 1 - dragState.windowSpanRatio)
      const nextStartRatio = clamp(ratio - dragState.pointerOffsetRatio, 0, maxStartRatio)
      const center = dragState.bounds.allStart + totalSpan * (nextStartRatio + dragState.windowSpanRatio / 2)
      setTrendViewport(center, currentSpan, dragState.bounds)
      requestTrendRender()
      return
    }

    if (dragState.type === 'resize-left') {
      const nextStart = dragState.bounds.allStart + totalSpan * ratio
      const safeStart = Math.min(nextStart, dragState.end - 2 * 60 * 60 * 1000)
      realtimeState.trendPreset = 'custom'
      realtimeState.trendZoomStart = clamp(safeStart, dragState.bounds.allStart, dragState.bounds.allEnd)
      realtimeState.trendZoomEnd = dragState.end
      requestTrendRender()
      return
    }

    if (dragState.type === 'resize-right') {
      const nextEnd = dragState.bounds.allStart + totalSpan * ratio
      const safeEnd = Math.max(nextEnd, dragState.start + 2 * 60 * 60 * 1000)
      realtimeState.trendPreset = 'custom'
      realtimeState.trendZoomStart = dragState.start
      realtimeState.trendZoomEnd = clamp(safeEnd, dragState.bounds.allStart, dragState.bounds.allEnd)
      requestTrendRender()
    }
  }

  window.addEventListener('pointermove', onPointerMove, { signal })
  window.addEventListener('pointerup', stopDrag, { signal })
  window.addEventListener('pointercancel', stopDrag, { signal })
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
  const sortedSlots = sortRealtimeSlots(slots)
  const timestamps = sortedSlots
    .map((slot) => new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
    .filter((item) => !Number.isNaN(item))

  if (timestamps.length === 0) return ''

  const allStart = Math.min(...timestamps)
  const allEnd = Math.max(...timestamps)
  const chosenPoints = sortedSlots
    .filter((slot) => typeof slot.chosenValue === 'number')
    .map((slot) => ({
      time: new Date(String(slot.slotTime).replace(' ', 'T')).getTime(),
      value: Number(slot.chosenValue)
    }))
    .filter((item) => !Number.isNaN(item.time) && !Number.isNaN(item.value))

  if (chosenPoints.length === 0) return ''

  const width = 960
  const height = 28
  const paddingX = 16
  const paddingY = 8
  const innerWidth = width - paddingX * 2
  const getX = (value) => paddingX + ((value - allStart) / Math.max(allEnd - allStart, 1)) * innerWidth
  const visibleRange = getVisibleTrendRange(sortedSlots)
  const visibleStart = visibleRange.start ?? allStart
  const visibleEnd = visibleRange.end ?? allEnd
  const viewportX = getX(visibleStart)
  const viewportWidth = Math.max(18, getX(visibleEnd) - viewportX)
  const handleWidth = 8
  const handleHitWidth = 24
  const handleY = paddingY + 4
  const handleHeight = 12
  const trackHeight = 4
  const trackY = handleY + handleHeight / 2 - trackHeight / 2
  const baselineY = handleY + handleHeight / 2
  const leftHandleX = viewportX
  const rightHandleX = viewportX + viewportWidth - handleWidth
  const leftHitX = Math.max(paddingX, leftHandleX - (handleHitWidth - handleWidth) / 2)
  const rightHitX = Math.min(
    width - paddingX - handleHitWidth,
    rightHandleX - (handleHitWidth - handleWidth) / 2
  )

  return `
    <svg viewBox="0 0 ${width} ${height}" class="trend-overview-svg" role="img" aria-label="时间导航条">
      <rect x="${paddingX}" y="${trackY}" width="${innerWidth}" height="${trackHeight}" rx="2" fill="rgba(148, 163, 184, 0.10)" />
      <line x1="${paddingX}" y1="${baselineY}" x2="${width - paddingX}" y2="${baselineY}" stroke="rgba(59, 130, 246, 0.65)" stroke-width="1.5" stroke-linecap="round" />
      <rect x="${leftHitX.toFixed(2)}" y="${Math.max(0, handleY - 2)}" width="${handleHitWidth}" height="${handleHeight + 4}" rx="8" class="trend-overview-hitbox" data-trend-overview-handle="left" />
      <rect x="${viewportX.toFixed(2)}" y="${handleY}" width="${viewportWidth.toFixed(2)}" height="${handleHeight}" rx="6" class="trend-overview-window" data-trend-overview-window="true" />
      <rect x="${rightHitX.toFixed(2)}" y="${Math.max(0, handleY - 2)}" width="${handleHitWidth}" height="${handleHeight + 4}" rx="8" class="trend-overview-hitbox" data-trend-overview-handle="right" />
      <rect x="${leftHandleX.toFixed(2)}" y="${handleY}" width="${handleWidth}" height="${handleHeight}" rx="4" class="trend-overview-handle left" data-trend-overview-handle="left" />
      <rect x="${rightHandleX.toFixed(2)}" y="${handleY}" width="${handleWidth}" height="${handleHeight}" rx="4" class="trend-overview-handle right" data-trend-overview-handle="right" />
    </svg>
  `
}

function buildTrendChartSvg(slots) {
  const sortedSlots = sortRealtimeSlots(slots)
  const range = getVisibleTrendRange(sortedSlots)
  if (range.start == null || range.end == null) {
    realtimeState.trendHoverModel = null
    return ''
  }

  const visibleSlots = sortedSlots.filter((slot) => {
    const time = new Date(String(slot.slotTime).replace(' ', 'T')).getTime()
    return !Number.isNaN(time) && time >= range.start && time <= range.end
  })

  const series = getTrendVisibleSeries()
    .map((item) => ({
      ...item,
      points: visibleSlots
        .filter((slot) => typeof slot[item.key] === 'number')
        .map((slot) => ({
          slotId: slot.id,
          slotTime: slot.slotTime,
          value: slot[item.key],
          tooltip: buildSlotTooltip(slot),
          hasAnomaly: !!slot.hasAnomaly
        }))
    }))
    .filter((item) => item.points.length > 0)

  if (series.length === 0) {
    realtimeState.trendHoverModel = null
    return ''
  }

  const flatPoints = series.flatMap((item) => item.points.map((point) => ({
    time: new Date(String(point.slotTime).replace(' ', 'T')).getTime(),
    value: Number(point.value)
  }))).filter((item) => !Number.isNaN(item.time) && !Number.isNaN(item.value))

  if (flatPoints.length === 0) {
    realtimeState.trendHoverModel = null
    return ''
  }

  const minX = range.start
  const maxX = range.end
  const minY = Math.min(...flatPoints.map((item) => item.value))
  const maxY = Math.max(...flatPoints.map((item) => item.value))
  const yPadding = Math.max((maxY - minY) * 0.12, 0.05)
  const paddedMinY = minY - yPadding
  const paddedMaxY = maxY + yPadding
  const width = 960
  const height = 340
  const paddingLeft = 72
  const paddingRight = 26
  const paddingTop = 20
  const paddingBottom = 74
  const innerWidth = width - paddingLeft - paddingRight
  const innerHeight = height - paddingTop - paddingBottom
  const getX = (value) => (maxX === minX ? paddingLeft + innerWidth / 2 : paddingLeft + ((value - minX) / (maxX - minX)) * innerWidth)
  const getY = (value) => (paddedMaxY === paddedMinY
    ? paddingTop + innerHeight / 2
    : paddingTop + innerHeight - ((value - paddedMinY) / (paddedMaxY - paddedMinY)) * innerHeight)

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const value = paddedMaxY - (paddedMaxY - paddedMinY) * ratio
    const y = paddingTop + innerHeight * ratio
    return { value, y }
  })

  const yGridLines = yTicks.map((tick) => `
    <line x1="${paddingLeft}" y1="${tick.y.toFixed(2)}" x2="${width - paddingRight}" y2="${tick.y.toFixed(2)}" stroke="rgba(148, 163, 184, 0.18)" stroke-width="1" />
    <text x="${paddingLeft - 12}" y="${(tick.y + 4).toFixed(2)}" text-anchor="end" class="trend-axis-label">${tick.value.toFixed(2)}</text>
  `).join('')

  const axisModel = buildTrendAxisModel(range, innerWidth)
  const minorGridLines = axisModel.minorTicks.map((tick) => {
    const x = getX(tick)
    return `
      <line x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${height - paddingBottom}" class="trend-grid-line minor" />
      <text x="${x.toFixed(2)}" y="${height - 30}" text-anchor="middle" class="trend-axis-label minor">${escapeHtml(formatAxisTimeLabel(tick, axisModel.minorLabelMode))}</text>
    `
  }).join('')

  const majorGridLines = axisModel.majorTicks.map((tick) => {
    const x = getX(tick)
    const keyClass = isTrendKeyTimestamp(tick, axisModel.spanHours) ? ' key' : ''
    return `
      <line x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${height - paddingBottom}" class="trend-grid-line major${keyClass}" />
      <text x="${x.toFixed(2)}" y="${height - 10}" text-anchor="middle" class="trend-axis-label major">${escapeHtml(formatAxisTimeLabel(tick, axisModel.majorLabelMode))}</text>
    `
  }).join('')

  const anomalyBands = visibleSlots
    .filter((slot) => slot.hasAnomaly)
    .map((slot) => {
      const x = getX(new Date(String(slot.slotTime).replace(' ', 'T')).getTime())
      return `<rect x="${(x - 5).toFixed(2)}" y="${paddingTop}" width="10" height="${innerHeight}" fill="rgba(220, 38, 38, 0.06)" />`
    })
    .join('')

  const viewWindowSummary = `${formatAxisTimeLabel(range.start)} - ${formatAxisTimeLabel(range.end)}`

  const lineMarkup = series.map((item) => {
    const color = TREND_SERIES_COLORS[item.sourceType] || '#64748b'
    const points = item.points
      .map((point) => ({
        ...point,
        x: getX(new Date(String(point.slotTime).replace(' ', 'T')).getTime()),
        y: getY(Number(point.value))
      }))
      .filter((point) => !Number.isNaN(point.x) && !Number.isNaN(point.y))

    if (points.length === 0) return ''

    const strokeWidth = item.key === 'chosenValue' ? 3.2 : 1.8
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
    const circles = points
      .map((point) => {
        const radius = item.key === 'chosenValue' ? 4.6 : 2.8
        const interactive = item.key === 'chosenValue'
          ? ` data-slot-id="${escapeAttribute(point.slotId)}" class="trend-slot-point"`
          : ''
        const stroke = point.hasAnomaly ? 'rgba(220, 38, 38, 0.95)' : color
        const strokeWidthPoint = point.hasAnomaly ? 2.2 : 0
        return `<circle${interactive} cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${radius}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidthPoint}"><title>${escapeHtml(point.tooltip)}</title></circle>`
      })
      .join('')

    const dash = item.key === 'videoOcrValue' ? ' stroke-dasharray="6 4"' : ''
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash} />${circles}`
  }).join('')

  const hoverSlots = visibleSlots
    .map((slot) => {
      const time = new Date(String(slot.slotTime).replace(' ', 'T')).getTime()
      if (Number.isNaN(time)) return null
      const markers = getTrendVisibleSeries()
        .map((item) => {
          if (typeof slot[item.key] !== 'number') return null
          return {
            sourceType: item.sourceType,
            label: item.name,
            value: Number(slot[item.key]),
            color: TREND_SERIES_COLORS[item.sourceType] || '#64748b',
            x: getX(time),
            y: getY(Number(slot[item.key]))
          }
        })
        .filter(Boolean)
      if (markers.length === 0) return null
      return {
        slotId: slot.id,
        slotTime: slot.slotTime,
        compareStatus: slot.compareStatus,
        anomalyCount: slot.anomalyCount || 0,
        x: getX(time),
        markers
      }
    })
    .filter(Boolean)

  realtimeState.trendHoverModel = {
    width,
    height,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    slots: hoverSlots
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" role="img" aria-label="实时过程图">
      <rect x="${paddingLeft}" y="${paddingTop}" width="${innerWidth}" height="${innerHeight}" rx="16" fill="rgba(148, 163, 184, 0.04)" />
      ${anomalyBands}
      ${yGridLines}
      ${minorGridLines}
      ${majorGridLines}
      ${lineMarkup}
      <g class="trend-hover-layer" aria-hidden="true">
        <line data-trend-hover-crosshair class="trend-hover-crosshair" x1="0" y1="0" x2="0" y2="0" />
        ${['manual', 'telemetry', 'video_ocr', 'corrected'].map((sourceType) => `
          <circle data-trend-hover-marker="${sourceType}" class="trend-hover-marker" cx="0" cy="0" r="${sourceType === 'corrected' ? 5 : 4}"></circle>
        `).join('')}
      </g>
      <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="rgba(148, 163, 184, 0.34)" stroke-width="1" />
      <line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="rgba(148, 163, 184, 0.34)" stroke-width="1" />
      <text x="20" y="${paddingTop + 8}" class="trend-axis-unit">${escapeHtml(getTrendUnit())}</text>
      <text x="${width - paddingRight}" y="${paddingTop + 12}" text-anchor="end" class="trend-window-label">${escapeHtml(viewWindowSummary)}</text>
    </svg>
  `
}

function renderTrendPanel(slots) {
  const trend = realtimeState.trend
  const stats = buildTrendStats(trend)
  const sortedSlots = sortRealtimeSlots(slots)
  const anomalyCount = sortedSlots.filter((slot) => slot.hasAnomaly).length
  return `
    <section class="trend-panel">
      <div class="trend-head">
        <div class="section-title">过程图</div>
        <div class="trend-tools">
          <div class="trend-presets">
            ${[
              ['6h', '6h'],
              ['12h', '12h'],
              ['24h', '24h'],
              ['72h', '72h'],
              ['all', '全部']
            ].map(([value, label]) => `
              <button type="button" class="trend-chip ${realtimeState.trendPreset === value ? 'active' : ''}" data-trend-preset="${value}">${label}</button>
            `).join('')}
          </div>
          <div class="trend-zoom-actions">
            <button type="button" class="secondary-action" data-trend-zoom="out">缩小</button>
            <button type="button" class="secondary-action" data-trend-zoom="in">放大</button>
            <button type="button" class="secondary-action" data-trend-zoom="reset">重置</button>
          </div>
        </div>
      </div>
      ${realtimeState.trendError ? `<div class="inline-error">${escapeHtml(realtimeState.trendError)}</div>` : ''}
      <div class="detail-cards trend-summary-cards">
        <div class="detail-card">
          <label>观测类型</label>
          <strong>${escapeHtml(describeObservationType(realtimeState.selectedObservationType))}</strong>
          <span>图上整点可点击查看时槽明细</span>
        </div>
        <div class="detail-card">
          <label>时槽数量</label>
          <strong>${sortedSlots.length}</strong>
          <span>${stats.totalPoints} 个过程点</span>
        </div>
        <div class="detail-card">
          <label>异常时槽</label>
          <strong>${anomalyCount}</strong>
          <span>${escapeHtml(stats.rangeLabel)}</span>
        </div>
      </div>
      <div class="trend-chart-shell" id="trendChartShell">
        ${sortedSlots.length > 0 ? buildTrendChartSvg(sortedSlots) : '<div class="empty-state compact">当前筛选条件下暂无实时数据。</div>'}
        <div class="trend-hover-card" data-trend-hover-card hidden></div>
      </div>
      <div class="trend-overview-shell" id="trendOverview">
        ${sortedSlots.length > 0 ? buildTrendOverviewSvg(sortedSlots) : ''}
      </div>
      <div class="trend-legend">
        ${[
          { sourceType: 'manual', name: '人工值' },
          { sourceType: 'telemetry', name: '遥测参考值' },
          { sourceType: 'video_ocr', name: '视频识别值' },
          { sourceType: 'corrected', name: '采用值' }
        ].map((series) => `
          <button type="button" class="trend-legend-item ${realtimeState.trendSeriesVisibility[series.sourceType] === false ? 'muted' : 'active'}" data-trend-series="${escapeAttribute(series.sourceType)}">
            <i style="background:${escapeAttribute(TREND_SERIES_COLORS[series.sourceType] || '#64748b')}"></i>
            ${escapeHtml(series.name)}
          </button>
        `).join('')}
      </div>
    </section>
  `
}

function renderRealtimeDetailModal(detail) {
  if (!detail) return ''
  return `
    <div id="realtimeDetailOverlay" class="realtime-detail-overlay">
      <div class="realtime-detail-card" role="dialog" aria-modal="true" aria-labelledby="realtimeDetailTitle">
        <div class="realtime-detail-head">
          <div>
            <h4 id="realtimeDetailTitle">时槽明细</h4>
            <p>${escapeHtml(formatDateTimeLabel(detail.slot.slotTime))} · ${escapeHtml(describeCompareStatus(detail.slot.compareStatus))}</p>
          </div>
          <button type="button" id="closeRealtimeDetailBtn" class="secondary-action">关闭</button>
        </div>
        <div class="detail-cards">
          <div class="detail-card">
            <label>采用值</label>
            <strong>${detail.slot.chosenValue ?? '--'}</strong>
            <span>${escapeHtml(describeObservationType(detail.slot.observationType))}</span>
          </div>
          <div class="detail-card">
            <label>人工值</label>
            <strong>${detail.manualObservation?.value ?? '--'}</strong>
            <span>${escapeHtml(detail.manualObservation?.observedAt ? formatDateTimeLabel(detail.manualObservation.observedAt) : '无人工记录')}</span>
          </div>
          <div class="detail-card">
            <label>视频识别</label>
            <strong>${detail.videoOcrObservation?.value ?? '--'}</strong>
            <span>${escapeHtml(detail.videoOcrObservation?.observedAt ? formatDateTimeLabel(detail.videoOcrObservation.observedAt) : '无识别记录')}</span>
          </div>
        </div>
        <div class="section-title">异常命中</div>
        ${(detail.anomalies || []).length > 0 ? `
          <div class="data-surface compact-surface">
            ${detail.anomalies.map((item) => `
              <div class="data-row anomaly-row">
                <strong>${escapeHtml(describeAnomalyType(item.anomalyType))}</strong>
                <span>${escapeHtml(item.severity || 'warning')}</span>
                <span>${escapeHtml(item.status || 'open')}</span>
                <em>${escapeHtml(item.description || '')}</em>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state compact">当前时槽未发现需要提示的异常。</div>'}
        <div class="section-title">5 分钟遥测明细</div>
        <div class="data-surface compact-surface">
          ${(detail.telemetryObservations || []).length > 0 ? detail.telemetryObservations.map((item) => `
            <div class="data-row telemetry-row">
              <strong>${escapeHtml(formatDateTimeLabel(item.observedAt))}</strong>
              <span>遥测</span>
              <span>${item.value ?? '--'}</span>
              <em>原始明细</em>
            </div>
          `).join('') : '<div class="empty-state compact">当前时槽没有 5 分钟遥测明细。</div>'}
        </div>
        <form id="realtimeCorrectionForm" class="correction-form">
          <div class="section-title">人工修正</div>
          <div class="form-grid compact">
            <label>修正前值<input name="beforeValue" type="number" step="0.01" value="${detail.slot.chosenValue ?? detail.manualObservation?.value ?? ''}" readonly></label>
            <label>修正后值<input name="afterValue" type="number" step="0.01" placeholder="输入修正值"></label>
            <label class="span-2">修正原因<input name="reason" type="text" placeholder="例如：人工复核确认录入有误"></label>
          </div>
          ${realtimeState.correctionError ? `<div class="form-error">${escapeHtml(realtimeState.correctionError)}</div>` : ''}
          <div class="form-actions">
            <button type="submit" class="primary-action">提交修正</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function renderRealtimeView(station) {
  const slots = sortRealtimeSlots(realtimeState.slots)
  const pageSize = realtimeState.pageSize || 10
  const totalPages = Math.max(1, Math.ceil(slots.length / pageSize))
  const currentPage = Math.min(Math.max(realtimeState.page || 1, 1), totalPages)
  realtimeState.page = currentPage
  const pageStart = (currentPage - 1) * pageSize
  const pagedSlots = slots.slice(pageStart, pageStart + pageSize)
  const detail = realtimeState.slotDetail
  const canViewAirTemperature = station.observationTypes?.includes(OBSERVATION_TYPES.airTemperature)

  tabContentEl.innerHTML = `
    <section class="realtime-layout">
      <div class="realtime-toolbar">
        <div class="realtime-type-switch">
          <button type="button" class="mini-tab ${realtimeState.selectedObservationType === OBSERVATION_TYPES.waterLevel ? 'active' : ''}" data-observation-type="${OBSERVATION_TYPES.waterLevel}">水位</button>
          <button type="button" class="mini-tab ${realtimeState.selectedObservationType === OBSERVATION_TYPES.airTemperature ? 'active' : ''}" data-observation-type="${OBSERVATION_TYPES.airTemperature}" ${canViewAirTemperature ? '' : 'disabled'}>气温</button>
        </div>
        <button type="button" id="seedRealtimeBtn" class="secondary-action">生成演示数据</button>
      </div>
      <form id="realtimeFilterForm" class="realtime-filter-bar">
        <label>开始时间
          <input name="fromTime" type="datetime-local" value="${escapeAttribute(formatDateTimeInputValue(realtimeState.fromTime))}">
        </label>
        <label>结束时间
          <input name="toTime" type="datetime-local" value="${escapeAttribute(formatDateTimeInputValue(realtimeState.toTime))}">
        </label>
        <label>对比状态
          <select name="compareStatus">
            ${COMPARE_STATUS_OPTIONS.map((item) => `
              <option value="${escapeAttribute(item.value)}" ${item.value === realtimeState.compareStatus ? 'selected' : ''}>${escapeHtml(item.label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="checkbox-label">
          <input name="hasAnomalyOnly" type="checkbox" ${realtimeState.hasAnomalyOnly ? 'checked' : ''}>
          仅看异常
        </label>
        <div class="realtime-filter-actions">
          <button type="submit" class="secondary-action">应用筛选</button>
          <button type="button" id="resetRealtimeFiltersBtn" class="secondary-action">重置</button>
        </div>
      </form>
      ${realtimeState.error ? `<div class="inline-error">${escapeHtml(realtimeState.error)}</div>` : ''}
      ${renderTrendPanel(slots)}
      <section class="realtime-table-panel">
        <div class="realtime-table-head">
          <div class="section-title">时槽二维表</div>
          <div class="table-page-meta">第 ${currentPage} / ${totalPages} 页 · 共 ${slots.length} 条</div>
        </div>
        ${slots.length === 0 ? '<div class="empty-state compact">暂无实时数据，请先生成演示数据。</div>' : `
          <div class="realtime-table-shell">
            <table class="realtime-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>人工值</th>
                  <th>遥测参考</th>
                  <th>视频识别</th>
                  <th>采用值</th>
                  <th>对比状态</th>
                  <th>异常</th>
                </tr>
              </thead>
              <tbody>
                ${pagedSlots.map((slot) => `
                  <tr class="${slot.id === realtimeState.selectedSlotId ? 'active' : ''}" data-slot-id="${escapeAttribute(slot.id)}">
                    <td>${escapeHtml(formatDateTimeLabel(slot.slotTime))}</td>
                    <td>${formatNumericValue(slot.manualValue)}</td>
                    <td>${formatNumericValue(slot.telemetryValue)}</td>
                    <td>${formatNumericValue(slot.videoOcrValue)}</td>
                    <td>${formatNumericValue(slot.chosenValue)}</td>
                    <td>${escapeHtml(describeCompareStatus(slot.compareStatus))}</td>
                    <td>${slot.hasAnomaly ? `${slot.anomalyCount} 项` : '无'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="realtime-pagination">
            <div class="realtime-pagination-group">
              <button type="button" class="secondary-action" data-page-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
              <button type="button" class="secondary-action" data-page-action="next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
            </div>
            <label class="realtime-page-size">
              每页
              <select id="realtimePageSizeSelect">
                ${[10, 20].map((size) => `
                  <option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>
                `).join('')}
              </select>
              行
            </label>
          </div>
        `}
      </section>
      ${renderRealtimeDetailModal(detail)}
    </section>
  `

  tabContentEl.querySelectorAll('[data-observation-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      realtimeState.selectedObservationType = button.dataset.observationType
      realtimeState.page = 1
      resetTrendViewport()
      realtimeState.trendPreset = '24h'
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      await loadRealtimeSlots()
      renderWorkbench()
    })
  })

  document.getElementById('seedRealtimeBtn')?.addEventListener('click', async () => {
    await seedRealtimeData()
  })

  document.getElementById('realtimeFilterForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await applyRealtimeFilters(new FormData(event.currentTarget))
  })

  document.getElementById('resetRealtimeFiltersBtn')?.addEventListener('click', async () => {
    resetRealtimeFilters()
    await loadRealtimeSlots()
    renderWorkbench()
  })

  tabContentEl.querySelectorAll('[data-slot-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadRealtimeSlotDetail(button.dataset.slotId)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.pageAction === 'prev' && realtimeState.page > 1) {
        realtimeState.page -= 1
      }
      if (button.dataset.pageAction === 'next' && realtimeState.page < totalPages) {
        realtimeState.page += 1
      }
      renderWorkbench()
    })
  })

  document.getElementById('realtimePageSizeSelect')?.addEventListener('change', (event) => {
    realtimeState.pageSize = Number(event.target.value) || 10
    realtimeState.page = 1
    renderWorkbench()
  })

  tabContentEl.querySelectorAll('[data-trend-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      setTrendPreset(button.dataset.trendPreset)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-trend-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      zoomTrendView(button.dataset.trendZoom, slots)
      renderWorkbench()
    })
  })

  tabContentEl.querySelectorAll('[data-trend-series]').forEach((button) => {
    button.addEventListener('click', () => {
      const sourceType = button.dataset.trendSeries
      realtimeState.trendSeriesVisibility[sourceType] = realtimeState.trendSeriesVisibility[sourceType] === false
      renderWorkbench()
    })
  })

  bindTrendChartHover()
  bindTrendViewportInteractions(slots)

  document.getElementById('closeRealtimeDetailBtn')?.addEventListener('click', () => {
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.correctionError = ''
    renderWorkbench()
  })

  document.getElementById('realtimeDetailOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'realtimeDetailOverlay') {
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
      realtimeState.correctionError = ''
      renderWorkbench()
    }
  })

  document.getElementById('realtimeCorrectionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await submitRealtimeCorrection(event.currentTarget)
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
    renderPlaceholderRows([
      ['边界值', '待实现', describeObservationTypes(station.observationTypes), '按站点规则集检查'],
      ['时序合法性', '待实现', '水位 / 气温', '检查缺测、乱序、重复'],
      ['变幅与毛刺', '待实现', '水位', '识别突变和毛刺'],
      ['一致性比对', station.dataSources?.videoOcr ? '待实现' : '未启用', '水位', '人工值 vs 视频识别值']
    ])
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
  const activeFunction = getActiveFunction()
  currentStationTitleEl.textContent = station?.name || '未选择站点'
  currentStationMetaEl.textContent = station
    ? `${station.code} · ${describeObservationTypes(station.observationTypes)} · ${station.basin || '未配置流域'}`
    : '请从左侧站点树选择站点'
  activeFunctionTitleEl.textContent = activeFunction.label
  activeFunctionMetaEl.textContent = activeFunction.meta
}

function renderWorkbench() {
  const station = getSelectedStation()
  renderStationTree()
  renderFunctionTabs()
  renderHeader(station)
  renderTabContent(station)
  agentPanel?.notifyContextChanged()
}

async function selectStation(stationId) {
  selectedStationId = stationId

  if (!stationId) {
    renderWorkbench()
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
    } else {
      activeFunctionKey = 'basic'
    }
  } catch (err) {
    console.error('[HydrologyWorkbench] Failed to load station detail:', err)
  }

  renderWorkbench()
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
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.listHydrologyRealtimeSlots) {
    realtimeState.slots = []
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.trend = null
    return
  }

  if (!station.observationTypes?.includes(realtimeState.selectedObservationType)) {
    realtimeState.selectedObservationType = station.observationTypes?.[0] || OBSERVATION_TYPES.waterLevel
  }

  realtimeState.error = ''
  realtimeState.trendError = ''
  try {
    const slots = await window.electronAPI.listHydrologyRealtimeSlots({
      stationId: station.id,
      observationType: realtimeState.selectedObservationType,
      fromTime: realtimeState.fromTime || null,
      toTime: realtimeState.toTime || null,
      compareStatus: realtimeState.compareStatus,
      hasAnomaly: realtimeState.hasAnomalyOnly
    })
    realtimeState.slots = Array.isArray(slots) ? slots : []
    const totalPages = Math.max(1, Math.ceil(realtimeState.slots.length / (realtimeState.pageSize || 10)))
    realtimeState.page = Math.min(Math.max(realtimeState.page || 1, 1), totalPages)
    const hasSelectedSlot = realtimeState.selectedSlotId
      && realtimeState.slots.some((slot) => slot.id === realtimeState.selectedSlotId)
    if (!hasSelectedSlot) {
      realtimeState.selectedSlotId = null
      realtimeState.slotDetail = null
    }
    await loadRealtimeTrend()
    if (hasSelectedSlot && realtimeState.selectedSlotId) {
      await loadRealtimeSlotDetail(realtimeState.selectedSlotId)
    }
  } catch (err) {
    realtimeState.error = err?.message || String(err)
    realtimeState.slots = []
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.trend = null
  }
}

async function loadRealtimeSlotDetail(slotId) {
  if (!slotId || !window.electronAPI?.getHydrologyRealtimeSlotDetail) {
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    return
  }
  realtimeState.selectedSlotId = slotId
  realtimeState.slotDetail = await window.electronAPI.getHydrologyRealtimeSlotDetail(slotId)
}

async function loadRealtimeTrend() {
  const station = getSelectedStation()
  if (!station || !window.electronAPI?.listHydrologyRealtimeTrend) {
    realtimeState.trend = null
    return
  }

  realtimeState.trendError = ''
  try {
    realtimeState.trend = await window.electronAPI.listHydrologyRealtimeTrend({
      stationId: station.id,
      observationType: realtimeState.selectedObservationType,
      fromTime: realtimeState.fromTime || null,
      toTime: realtimeState.toTime || null,
      compareStatus: realtimeState.compareStatus,
      hasAnomaly: realtimeState.hasAnomalyOnly,
      viewMode: realtimeState.trendViewMode
    })
  } catch (err) {
    realtimeState.trend = null
    realtimeState.trendError = err?.message || String(err)
  }
}

function resetRealtimeFilters() {
  realtimeState.fromTime = ''
  realtimeState.toTime = ''
  realtimeState.compareStatus = 'all'
  realtimeState.hasAnomalyOnly = false
  realtimeState.page = 1
  resetTrendViewport()
  realtimeState.trendPreset = '24h'
}

async function applyRealtimeFilters(formData) {
  realtimeState.fromTime = String(formData.get('fromTime') || '').trim()
  realtimeState.toTime = String(formData.get('toTime') || '').trim()
  realtimeState.compareStatus = String(formData.get('compareStatus') || 'all').trim() || 'all'
  realtimeState.hasAnomalyOnly = formData.has('hasAnomalyOnly')
  realtimeState.page = 1
  resetTrendViewport()
  realtimeState.trendPreset = '24h'
  realtimeState.selectedSlotId = null
  realtimeState.slotDetail = null
  await loadRealtimeSlots()
  renderWorkbench()
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
  return {
    title: station ? `${station.name} / ${activeFunction.label}` : activeFunction.label,
    summary: station
      ? `当前站点：${station.name}（${station.code}），当前功能：${activeFunction.label}${realtimeSlot ? `，当前时槽：${formatDateTimeLabel(realtimeSlot.slotTime)}。` : '。'}`
      : '当前未选择站点。',
    payload: {
      appId: 'hydrology-workbench',
      station,
      function: activeFunction,
      realtimeSlot
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
  renderWorkbench()
  if (stations.length === 0) {
    showCreateStationForm()
  }
}

bootstrapWorkbench().catch((err) => {
  console.error('[HydrologyWorkbench] Failed to bootstrap workbench:', err)
  renderWorkbench()
  showCreateStationForm()
})
