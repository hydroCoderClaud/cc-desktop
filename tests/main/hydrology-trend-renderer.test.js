import { describe, expect, it } from 'vitest'
import {
  buildTrendHoverCardMarkup,
  buildTrendOverviewSvg,
  buildTrendChartSvg,
  renderTrendPanel
} from '../../src/renderer/pages/hydrology-workbench/trend-renderer.js'
import {
  buildTrendAxisModel,
  buildTrendStats,
  formatAxisTimeLabel,
  formatDateTimeLabel,
  formatNumericValue,
  getVisibleTrendRange,
  isTrendKeyTimestamp,
  sortRealtimeSlots
} from '../../src/renderer/pages/hydrology-workbench/trend-utils.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

const trendSeriesColors = {
  manual: '#2563eb',
  telemetry: '#0f766e',
  video_ocr: '#d97706',
  corrected: '#dc2626'
}

const realtimeState = {
  selectedObservationType: 'waterLevel',
  trendPreset: '24h',
  trendZoomStart: null,
  trendZoomEnd: null,
  trendError: '',
  trendSeriesVisibility: {
    manual: true,
    telemetry: true,
    video_ocr: true,
    corrected: true
  },
  trend: {
    series: [
      {
        name: '采用值',
        points: [
          ['2026-05-12 00:00', 10.2],
          ['2026-05-12 01:00', 10.5]
        ]
      }
    ]
  }
}

const slots = [
  {
    id: 'slot-1',
    slotTime: '2026-05-12 00:00',
    manualValue: 10.1,
    telemetryValue: 10.0,
    videoOcrValue: 10.2,
    chosenValue: 10.1,
    compareStatus: 'consistent',
    anomalyCount: 0,
    hasAnomaly: false
  },
  {
    id: 'slot-2',
    slotTime: '2026-05-12 01:00',
    manualValue: 10.8,
    telemetryValue: 10.4,
    videoOcrValue: 10.6,
    chosenValue: 10.7,
    compareStatus: 'conflict',
    anomalyCount: 2,
    hasAnomaly: true
  }
]

function createDeps() {
  return {
    realtimeState,
    trendSeriesColors,
    buildSlotTooltip: (slot) => `${slot.slotTime} / ${slot.chosenValue}`,
    buildTrendAxisModel,
    buildTrendStats,
    describeCompareStatus: (status) => ({ consistent: '一致', conflict: '冲突' }[status] || status),
    describeObservationType: (type) => (type === 'airTemperature' ? '气温' : '水位'),
    escapeAttribute,
    escapeHtml,
    formatAxisTimeLabel,
    formatDateTimeLabel,
    formatNumericValue,
    getTrendUnit: () => 'm',
    getTrendVisibleSeries: () => [
      { key: 'manualValue', sourceType: 'manual', name: '人工值' },
      { key: 'telemetryValue', sourceType: 'telemetry', name: '遥测参考值' },
      { key: 'videoOcrValue', sourceType: 'video_ocr', name: '视频识别值' },
      { key: 'chosenValue', sourceType: 'corrected', name: '采用值' }
    ],
    getVisibleTrendRange: (sortedSlots) => getVisibleTrendRange(sortedSlots, realtimeState),
    isTrendKeyTimestamp,
    sortRealtimeSlots
  }
}

describe('hydrology trend renderer', () => {
  it('builds hover card markup with compare status and metrics', () => {
    const markup = buildTrendHoverCardMarkup({
      slotTime: '2026-05-12 01:00',
      compareStatus: 'conflict',
      anomalyCount: 2,
      markers: [
        { color: '#2563eb', label: '人工值', value: 10.8 },
        { color: '#dc2626', label: '采用值', value: 10.7 }
      ]
    }, createDeps())

    expect(markup).toContain('2026-05-12 01:00')
    expect(markup).toContain('冲突')
    expect(markup).toContain('2 项异常')
    expect(markup).toContain('10.80')
    expect(markup).toContain('10.70')
  })

  it('builds overview svg with draggable handles', () => {
    const markup = buildTrendOverviewSvg(slots, createDeps())

    expect(markup).toContain('trend-overview-svg')
    expect(markup).toContain('data-trend-overview-window="true"')
    expect(markup).toContain('data-trend-overview-handle="left"')
    expect(markup).toContain('data-trend-overview-handle="right"')
  })

  it('builds chart svg and hover model for visible slots', () => {
    const result = buildTrendChartSvg(slots, createDeps())

    expect(result.markup).toContain('trend-chart-svg')
    expect(result.markup).toContain('实时过程图')
    expect(result.markup).toContain('data-slot-id="slot-1"')
    expect(result.markup).toContain('trend-hover-crosshair')
    expect(result.hoverModel?.slots).toHaveLength(2)
    expect(result.hoverModel?.slots[1].compareStatus).toBe('conflict')
  })

  it('renders trend panel summary, chart and legend', () => {
    const result = renderTrendPanel(slots, createDeps())

    expect(result.markup).toContain('过程图')
    expect(result.markup).toContain('时槽数量')
    expect(result.markup).toContain('异常时槽')
    expect(result.markup).toContain('trend-legend-item')
    expect(result.markup).toContain('图上整点可点击查看时槽明细')
    expect(result.hoverModel?.slots).toHaveLength(2)
  })
})
