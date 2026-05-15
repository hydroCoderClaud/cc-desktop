export async function loadRealtimeTrendAction(deps) {
  const {
    getSelectedStation,
    realtimeState,
    electronAPI
  } = deps

  const station = getSelectedStation()
  if (!station || !electronAPI?.listHydrologyRealtimeTrend) {
    realtimeState.trend = null
    return
  }

  realtimeState.trendError = ''
  try {
    realtimeState.trend = await electronAPI.listHydrologyRealtimeTrend({
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

export async function loadRealtimeSlotDetailAction(slotId, deps) {
  const {
    realtimeState,
    electronAPI
  } = deps

  if (!slotId || !electronAPI?.getHydrologyRealtimeSlotDetail) {
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    return
  }

  realtimeState.selectedSlotId = slotId
  realtimeState.slotDetail = await electronAPI.getHydrologyRealtimeSlotDetail(slotId)
}

export async function loadRealtimeSlotsAction(deps) {
  const {
    getSelectedStation,
    realtimeState,
    observationTypes,
    electronAPI,
    loadRealtimeTrend,
    loadRealtimeSlotDetail
  } = deps

  const station = getSelectedStation()
  if (!station || !electronAPI?.listHydrologyRealtimeSlots) {
    realtimeState.slots = []
    realtimeState.selectedSlotId = null
    realtimeState.slotDetail = null
    realtimeState.trend = null
    return
  }

  if (!station.observationTypes?.includes(realtimeState.selectedObservationType)) {
    realtimeState.selectedObservationType = station.observationTypes?.[0] || observationTypes.waterLevel
  }

  realtimeState.error = ''
  realtimeState.trendError = ''
  try {
    const slots = await electronAPI.listHydrologyRealtimeSlots({
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

export function resetRealtimeFiltersAction(deps) {
  const { realtimeState, resetTrendViewport } = deps
  realtimeState.fromTime = ''
  realtimeState.toTime = ''
  realtimeState.compareStatus = 'all'
  realtimeState.hasAnomalyOnly = false
  realtimeState.page = 1
  resetTrendViewport()
  realtimeState.trendPreset = '24h'
}

export async function applyRealtimeFiltersAction(formData, deps) {
  const {
    realtimeState,
    resetTrendViewport,
    loadRealtimeSlots,
    renderWorkbench
  } = deps

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
