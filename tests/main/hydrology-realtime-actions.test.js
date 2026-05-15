import { describe, expect, it, vi } from 'vitest'
import {
  applyRealtimeFiltersAction,
  loadRealtimeSlotDetailAction,
  loadRealtimeSlotsAction,
  loadRealtimeTrendAction,
  resetRealtimeFiltersAction
} from '../../src/renderer/pages/hydrology-workbench/realtime-actions.js'

describe('hydrology realtime actions', () => {
  it('loads trend data through injected electron api', async () => {
    const realtimeState = {
      selectedObservationType: 'waterLevel',
      fromTime: '',
      toTime: '',
      compareStatus: 'all',
      hasAnomalyOnly: false,
      trendViewMode: 'slot',
      trend: null,
      trendError: ''
    }
    const listHydrologyRealtimeTrend = vi.fn(async () => ({ series: [{ name: '采用值', points: [] }] }))

    await loadRealtimeTrendAction({
      getSelectedStation: () => ({ id: 'station-1' }),
      realtimeState,
      electronAPI: { listHydrologyRealtimeTrend }
    })

    expect(listHydrologyRealtimeTrend).toHaveBeenCalledOnce()
    expect(realtimeState.trend).toEqual({ series: [{ name: '采用值', points: [] }] })
    expect(realtimeState.trendError).toBe('')
  })

  it('loads slot detail and updates selected slot', async () => {
    const realtimeState = {
      selectedSlotId: null,
      slotDetail: null
    }
    const getHydrologyRealtimeSlotDetail = vi.fn(async () => ({ slot: { id: 'slot-1' } }))

    await loadRealtimeSlotDetailAction('slot-1', {
      realtimeState,
      electronAPI: { getHydrologyRealtimeSlotDetail }
    })

    expect(getHydrologyRealtimeSlotDetail).toHaveBeenCalledWith('slot-1')
    expect(realtimeState.selectedSlotId).toBe('slot-1')
    expect(realtimeState.slotDetail).toEqual({ slot: { id: 'slot-1' } })
  })

  it('loads slot list and refreshes trend plus current detail', async () => {
    const realtimeState = {
      selectedObservationType: 'waterLevel',
      fromTime: '',
      toTime: '',
      compareStatus: 'all',
      hasAnomalyOnly: false,
      pageSize: 10,
      page: 1,
      selectedSlotId: 'slot-1',
      slotDetail: { slot: { id: 'slot-1' } },
      slots: [],
      trend: null,
      error: '',
      trendError: ''
    }
    const listHydrologyRealtimeSlots = vi.fn(async () => [{ id: 'slot-1' }, { id: 'slot-2' }])
    const loadRealtimeTrend = vi.fn(async () => {})
    const loadRealtimeSlotDetail = vi.fn(async () => {})

    await loadRealtimeSlotsAction({
      getSelectedStation: () => ({ id: 'station-1', observationTypes: ['waterLevel', 'airTemperature'] }),
      realtimeState,
      observationTypes: {
        waterLevel: 'waterLevel'
      },
      electronAPI: { listHydrologyRealtimeSlots },
      loadRealtimeTrend,
      loadRealtimeSlotDetail
    })

    expect(listHydrologyRealtimeSlots).toHaveBeenCalledOnce()
    expect(realtimeState.slots).toHaveLength(2)
    expect(realtimeState.page).toBe(1)
    expect(loadRealtimeTrend).toHaveBeenCalledOnce()
    expect(loadRealtimeSlotDetail).toHaveBeenCalledWith('slot-1')
  })

  it('resets realtime filters and viewport state', () => {
    const realtimeState = {
      fromTime: '2026-05-12T00:00',
      toTime: '2026-05-13T00:00',
      compareStatus: 'conflict',
      hasAnomalyOnly: true,
      page: 2,
      trendPreset: '72h'
    }
    const resetTrendViewport = vi.fn()

    resetRealtimeFiltersAction({
      realtimeState,
      resetTrendViewport
    })

    expect(realtimeState.fromTime).toBe('')
    expect(realtimeState.toTime).toBe('')
    expect(realtimeState.compareStatus).toBe('all')
    expect(realtimeState.hasAnomalyOnly).toBe(false)
    expect(realtimeState.page).toBe(1)
    expect(realtimeState.trendPreset).toBe('24h')
    expect(resetTrendViewport).toHaveBeenCalledOnce()
  })

  it('applies filters then reloads data and rerenders', async () => {
    const realtimeState = {
      fromTime: '',
      toTime: '',
      compareStatus: 'all',
      hasAnomalyOnly: false,
      page: 3,
      trendPreset: 'all',
      selectedSlotId: 'slot-1',
      slotDetail: { slot: { id: 'slot-1' } }
    }
    const resetTrendViewport = vi.fn()
    const loadRealtimeSlots = vi.fn(async () => {})
    const renderWorkbench = vi.fn()
    const formData = new FormData()
    formData.set('fromTime', '2026-05-12T00:00')
    formData.set('toTime', '2026-05-13T00:00')
    formData.set('compareStatus', 'conflict')
    formData.set('hasAnomalyOnly', 'on')

    await applyRealtimeFiltersAction(formData, {
      realtimeState,
      resetTrendViewport,
      loadRealtimeSlots,
      renderWorkbench
    })

    expect(realtimeState.fromTime).toBe('2026-05-12T00:00')
    expect(realtimeState.toTime).toBe('2026-05-13T00:00')
    expect(realtimeState.compareStatus).toBe('conflict')
    expect(realtimeState.hasAnomalyOnly).toBe(true)
    expect(realtimeState.page).toBe(1)
    expect(realtimeState.trendPreset).toBe('24h')
    expect(realtimeState.selectedSlotId).toBe(null)
    expect(realtimeState.slotDetail).toBe(null)
    expect(resetTrendViewport).toHaveBeenCalledOnce()
    expect(loadRealtimeSlots).toHaveBeenCalledOnce()
    expect(renderWorkbench).toHaveBeenCalledOnce()
  })
})
