/**
 * Ant Design Vue 的全局主题配置。
 *
 * 交互色、字体、圆角和表面色与 Tailwind 中的设计 Token 保持一致，
 * 让成熟交互组件自然融入 Apple-inspired 桌面生产力界面。
 */
export const appTheme = {
  token: {
    colorPrimary: "#0066cc",
    colorInfo: "#0066cc",
    colorSuccess: "#248a3d",
    colorWarning: "#b25000",
    colorError: "#d70015",
    colorText: "#1d1d1f",
    colorTextSecondary: "#6e6e73",
    colorBgBase: "#ffffff",
    colorBgLayout: "#f5f5f7",
    colorBgContainer: "#ffffff",
    colorBorder: "#d2d2d7",
    colorBorderSecondary: "#e8e8ed",
    borderRadius: 11,
    borderRadiusLG: 18,
    controlHeight: 44,
    controlHeightSM: 36,
    fontSize: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadow: "none",
    boxShadowSecondary: "none",
    motionDurationFast: "0.16s",
    motionDurationMid: "0.2s",
  },
  components: {
    Button: {
      borderRadius: 999,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      fontWeight: 400,
    },
    Drawer: {
      colorBgElevated: "#ffffff",
    },
    Input: {
      activeBorderColor: "#0066cc",
      activeShadow: "0 0 0 2px rgba(0, 102, 204, 0.14)",
      hoverBorderColor: "#86868b",
    },
    Modal: {
      borderRadiusLG: 18,
      boxShadow: "none",
      boxShadowNoArrow: "none",
    },
    Pagination: {
      itemActiveBg: "#ffffff",
      itemBg: "transparent",
    },
    Segmented: {
      itemColor: "#6e6e73",
      itemHoverBg: "rgba(255, 255, 255, 0.56)",
      itemSelectedBg: "#ffffff",
      itemSelectedColor: "#1d1d1f",
      trackBg: "rgba(118, 118, 128, 0.12)",
      trackPadding: 4,
    },
    Table: {
      borderColor: "#e8e8ed",
      headerBg: "#fafafc",
      headerColor: "#1d1d1f",
      headerSplitColor: "transparent",
      rowHoverBg: "#f5f5f7",
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
    },
    Tag: {
      borderRadiusSM: 999,
      defaultBg: "#f5f5f7",
      defaultColor: "#3a3a3c",
    },
  },
} as const;
