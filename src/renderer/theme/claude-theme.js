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

    // 字体
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
 * 深色主题配置 (未来扩展)
 */
export const claudeDarkTheme = {
  common: {
    ...claudeTheme.common,
    textColor1: '#f5f5f0',
    textColor2: '#d0d0d0',
    textColor3: '#8c8c8c',
    bodyColor: '#1a1a1a',
    cardColor: '#2d2d2d',
    modalColor: '#2d2d2d',
    popoverColor: '#2d2d2d',
    dividerColor: '#404040',
    borderColor: '#404040'
  }
}
