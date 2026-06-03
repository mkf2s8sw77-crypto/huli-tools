import type { ThemeConfig } from "antd";

export const adminThemeTokens = {
  colorPrimary: "#1e5a8c",
  colorPrimaryBright: "#2a7ab5",
  colorBrandSoft: "#5ba8a0",
  colorBrandSoftLight: "#eaf5f3",
  colorSuccess: "#2e8b6a",
  colorWarning: "#c4963a",
  colorError: "#c0392b",
  colorBgLayout: "#f0f3f7",
  colorBgContainer: "#ffffff",
  colorSurface: "#f4f6f9",
  colorBorder: "#e2e8f0",
  colorBorderSecondary: "#edf1f5",
  colorText: "#1a2a3a",
  colorTextSecondary: "#5a6a7a",
  colorTextTertiary: "#8a96a4",
  colorOnPrimary: "#ffffff",
  colorSider: "#132d46",
  colorSiderTrigger: "#1a3d5c",
  colorWechat: "#07c160",
  colorStatSoftBorder: "#d4ede9",
  borderRadius: 8,
  borderRadiusCard: 12,
  controlHeight: 36,
  shadowCard: "0 2px 8px rgba(30, 90, 140, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)",
  shadowElevated: "0 4px 16px rgba(30, 90, 140, 0.08), 0 1px 6px rgba(0, 0, 0, 0.03)",
  shadowLogin: "0 8px 40px rgba(30, 90, 140, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const;

export const adminThemeGradients = {
  primary: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorPrimaryBright} 100%)`,
  brand: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorBrandSoft} 100%)`,
  loginBackground: "linear-gradient(135deg, #e4ecf4 0%, #f0f3f7 50%, #eaf5f3 100%)",
} as const;

const theme: ThemeConfig = {
  token: {
    colorPrimary: adminThemeTokens.colorPrimary,
    borderRadius: adminThemeTokens.borderRadius,
    colorSuccess: adminThemeTokens.colorSuccess,
    colorWarning: adminThemeTokens.colorWarning,
    colorError: adminThemeTokens.colorError,
    colorBgLayout: adminThemeTokens.colorBgLayout,
    colorBgContainer: adminThemeTokens.colorBgContainer,
    colorBgElevated: adminThemeTokens.colorBgContainer,
    colorBorder: adminThemeTokens.colorBorder,
    colorBorderSecondary: adminThemeTokens.colorBorderSecondary,
    colorText: adminThemeTokens.colorText,
    colorTextSecondary: adminThemeTokens.colorTextSecondary,
    colorTextTertiary: adminThemeTokens.colorTextTertiary,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: 14,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    controlHeight: adminThemeTokens.controlHeight,
    boxShadow: adminThemeTokens.shadowCard,
    boxShadowSecondary: adminThemeTokens.shadowElevated,
  },
  components: {
    Layout: {
      siderBg: adminThemeTokens.colorSider,
      headerBg: adminThemeTokens.colorBgContainer,
      bodyBg: adminThemeTokens.colorBgLayout,
      triggerBg: adminThemeTokens.colorSiderTrigger,
    },
    Menu: {
      darkItemBg: adminThemeTokens.colorSider,
      darkItemSelectedBg: "rgba(91, 168, 160, 0.2)",
      darkItemHoverBg: "rgba(255, 255, 255, 0.06)",
      darkItemColor: "rgba(255, 255, 255, 0.65)",
      darkItemSelectedColor: adminThemeTokens.colorOnPrimary,
    },
    Card: {
      borderRadiusLG: adminThemeTokens.borderRadiusCard,
    },
    Table: {
      borderRadiusLG: adminThemeTokens.borderRadius,
      headerBg: adminThemeTokens.colorSurface,
    },
    Button: {
      borderRadiusLG: adminThemeTokens.borderRadius,
    },
  },
};

export default theme;
