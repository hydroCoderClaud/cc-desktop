export function renderStationTreeView({
  stationTreeEl,
  stations,
  selectedStationId,
  describeStatus,
  escapeHtml,
  onSelectStation
}) {
  const groups = stations.reduce((result, station) => {
    const basin = station.basin || '未分组流域'
    result[basin] ||= []
    result[basin].push(station)
    return result
  }, {})

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
      await onSelectStation(button.dataset.stationId)
    })
  })
}

export function renderFunctionTabsView({
  functionTabsEl,
  stationFunctions,
  activeFunctionKey,
  escapeHtml,
  onSwitchFunction
}) {
  functionTabsEl.innerHTML = stationFunctions
    .map((item) => `
      <button class="function-tab ${item.key === activeFunctionKey ? 'active' : ''}" type="button" data-function-key="${item.key}">
        ${escapeHtml(item.label)}
      </button>
    `)
    .join('')

  functionTabsEl.querySelectorAll('[data-function-key]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onSwitchFunction(button.dataset.functionKey)
    })
  })
}

export function renderStationFormView({
  stationForm,
  stationFormError,
  deleteStationBtn,
  station,
  createEmptyStation
}) {
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
  stationForm.querySelectorAll('input[name="observationTypes"]').forEach((input) => {
    input.checked = (nextStation.observationTypes || []).includes(input.value)
  })
  stationFormError.textContent = ''
  deleteStationBtn.disabled = !nextStation.id
}

export function renderPlaceholderRowsView({
  tabContentEl,
  rows,
  escapeHtml
}) {
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

export function renderHeaderView({
  currentStationTitleEl,
  currentStationMetaEl,
  activeFunctionTitleEl,
  activeFunctionMetaEl,
  station,
  activeFunction,
  describeObservationTypes
}) {
  currentStationTitleEl.textContent = station?.name || '未选择站点'
  currentStationMetaEl.textContent = station
    ? `${station.code} · ${describeObservationTypes(station.observationTypes)} · ${station.basin || '未配置流域'}`
    : '请从左侧站点树选择站点'
  activeFunctionTitleEl.textContent = activeFunction.label
  activeFunctionMetaEl.textContent = activeFunction.meta
}
