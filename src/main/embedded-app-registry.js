const EMBEDDED_APPS = [
  {
    id: 'agent-platform-demo',
    menuKey: 'embedded-app-demo',
    titleKey: 'app.windows.embeddedAppDemo',
    labelKey: 'embeddedApps.demoTitle',
    icon: 'panelLeft',
    page: 'embedded-app-demo',
    window: {
      width: 1280,
      height: 860
    },
    enabled: true
  },
  {
    id: 'hydrology-workbench',
    menuKey: 'hydrology-workbench',
    titleKey: 'app.windows.hydrologyWorkbench',
    labelKey: 'embeddedApps.hydrologyWorkbenchTitle',
    icon: 'activity',
    page: 'hydrology-workbench',
    window: {
      width: 1440,
      height: 920
    },
    enabled: true
  }
]

function listEmbeddedApps() {
  return EMBEDDED_APPS
    .filter((app) => app.enabled !== false)
    .map((app) => ({
      id: app.id,
      menuKey: app.menuKey,
      titleKey: app.titleKey,
      labelKey: app.labelKey,
      icon: app.icon,
      page: app.page,
      window: { ...(app.window || {}) }
    }))
}

function getEmbeddedAppByMenuKey(menuKey) {
  return listEmbeddedApps().find((app) => app.menuKey === menuKey) || null
}

module.exports = {
  listEmbeddedApps,
  getEmbeddedAppByMenuKey
}
