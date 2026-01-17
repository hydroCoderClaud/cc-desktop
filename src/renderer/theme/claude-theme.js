/**
 * Naive UI Claude Theme Configuration
 * 基于 Claude 官方设计风格定制的主题配置
 */
export const claudeTheme = {
  common: {
    // 主色调 - Claude 橙色
    primaryColor: '#FF6B35',
    primaryColorHover: '#FF5722',
    primaryColorPressed: '#E64A19',
    primaryColorSuppl: '#FF8A65',

    // 语义化颜色
    successColor: '#2E7D32',
    warningColor: '#F57C00',
    errorColor: '#C62828',
    infoColor: '#1976D2',

    // 圆角
    borderRadius: '8px',
    borderRadiusSmall: '6px',

    // 字体 (中文使用圆润字体：苹方、微软雅黑)
    fontFamily: "'Plus Jakarta Sans', 'PingFang SC', 'Microsoft YaHei', 'HarmonyOS Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '14px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',

    // 文本颜色
    textColor1: '#2d2d2d',
    textColor2: '#4a4a4a',
    textColor3: '#8c8c8c',

    // 背景颜色
    bodyColor: '#f5f5f0',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',

    // 边框颜色
    dividerColor: '#e5e5e0',
    borderColor: '#e5e5e0',

    // 阴影
    boxShadow1: '0 2px 8px rgba(0, 0, 0, 0.08)',
    boxShadow2: '0 4px 16px rgba(0, 0, 0, 0.12)',
    boxShadow3: '0 8px 24px rgba(0, 0, 0, 0.16)'
  },

  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '6px',
    paddingMedium: '8px 16px',
    paddingSmall: '6px 12px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    colorPrimary: '#FF6B35',
    colorHoverPrimary: '#FF5722',
    colorPressedPrimary: '#E64A19',
    textColorPrimary: '#ffffff'
  },

  Input: {
    borderRadius: '8px',
    heightMedium: '40px',
    paddingMedium: '0 12px',
    fontSizeMedium: '14px',
    borderHover: '1px solid #FF6B35',
    borderFocus: '1px solid #FF6B35',
    boxShadowFocus: '0 0 0 3px rgba(255, 107, 53, 0.1)'
  },

  Card: {
    borderRadius: '12px',
    paddingMedium: '20px',
    paddingLarge: '24px',
    titleFontSizeMedium: '16px',
    titleFontWeight: '600',
    color: '#ffffff',
    colorEmbedded: '#f8f8f5'
  },

  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px',
        heightMedium: '40px'
      }
    }
  },

  Switch: {
    railHeightMedium: '20px',
    railWidthMedium: '40px',
    buttonHeightMedium: '16px',
    buttonWidthMedium: '16px',
    railColorActive: '#FF6B35'
  },

  Tag: {
    borderRadius: '12px',
    padding: '0 10px',
    fontSizeSmall: '12px',
    heightSmall: '22px'
  },

  Modal: {
    borderRadius: '12px',
    padding: '24px',
    color: '#ffffff'
  },

  Message: {
    borderRadius: '8px',
    padding: '12px 16px'
  },

  Notification: {
    borderRadius: '12px',
    padding: '16px 20px'
  },

  Form: {
    labelFontWeight: '500',
    labelFontSizeTopMedium: '14px',
    feedbackFontSizeMedium: '13px'
  },

  DataTable: {
    borderRadius: '8px',
    thColor: '#f8f8f5',
    tdColor: '#ffffff'
  },

  Dropdown: {
    borderRadius: '8px',
    optionHeightMedium: '36px',
    padding: '4px'
  },

  Popover: {
    borderRadius: '8px',
    padding: '12px'
  },

  Tooltip: {
    borderRadius: '6px',
    padding: '8px 12px'
  },

  Empty: {
    iconSizeMedium: '64px',
    textColor: '#8c8c8c'
  },

  Spin: {
    color: '#FF6B35'
  }
}

/**
 * 深色主题配置
 */
export const claudeDarkTheme = {
  common: {
    // 主色调 - Claude 橙色（保持一致）
    primaryColor: '#FF6B35',
    primaryColorHover: '#FF5722',
    primaryColorPressed: '#E64A19',
    primaryColorSuppl: '#FF8A65',

    // 语义化颜色
    successColor: '#4CAF50',
    warningColor: '#FF9800',
    errorColor: '#EF5350',
    infoColor: '#42A5F5',

    // 圆角
    borderRadius: '8px',
    borderRadiusSmall: '6px',

    // 字体 (中文使用圆润字体：苹方、微软雅黑)
    fontFamily: "'Plus Jakarta Sans', 'PingFang SC', 'Microsoft YaHei', 'HarmonyOS Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '14px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',

    // 文本颜色（深色主题）
    textColor1: '#f5f5f0',
    textColor2: '#d0d0d0',
    textColor3: '#8c8c8c',

    // 背景颜色（深色主题）
    bodyColor: '#1a1a1a',
    cardColor: '#242424',
    modalColor: '#2d2d2d',
    popoverColor: '#2d2d2d',

    // 边框颜色（深色主题）
    dividerColor: '#404040',
    borderColor: '#404040',

    // 阴影（深色主题）
    boxShadow1: '0 2px 8px rgba(0, 0, 0, 0.3)',
    boxShadow2: '0 4px 16px rgba(0, 0, 0, 0.4)',
    boxShadow3: '0 8px 24px rgba(0, 0, 0, 0.5)'
  },

  Button: {
    ...claudeTheme.Button
  },

  Input: {
    ...claudeTheme.Input,
    color: '#2d2d2d',
    colorFocus: '#333333',
    border: '1px solid #404040',
    borderHover: '1px solid #FF6B35',
    borderFocus: '1px solid #FF6B35'
  },

  Card: {
    ...claudeTheme.Card,
    color: '#242424',
    colorEmbedded: '#1a1a1a'
  },

  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px',
        heightMedium: '40px',
        color: '#2d2d2d',
        border: '1px solid #404040'
      }
    }
  },

  Switch: {
    ...claudeTheme.Switch
  },

  Tag: {
    ...claudeTheme.Tag
  },

  Modal: {
    ...claudeTheme.Modal,
    color: '#2d2d2d'
  },

  Message: {
    ...claudeTheme.Message
  },

  Notification: {
    ...claudeTheme.Notification
  },

  Form: {
    ...claudeTheme.Form
  },

  DataTable: {
    ...claudeTheme.DataTable,
    thColor: '#2d2d2d',
    tdColor: '#242424',
    borderColor: '#404040'
  },

  Dropdown: {
    ...claudeTheme.Dropdown,
    color: '#2d2d2d',
    optionColorHover: '#333333'
  },

  Popover: {
    ...claudeTheme.Popover,
    color: '#2d2d2d'
  },

  Tooltip: {
    ...claudeTheme.Tooltip,
    color: '#333333'
  },

  Empty: {
    ...claudeTheme.Empty
  },

  Spin: {
    ...claudeTheme.Spin
  }
}
