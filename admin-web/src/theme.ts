import type { ThemeConfig } from "antd";

export const adminThemeTokens = {
  colorPrimary: "#5E95C8",
  colorPrimaryBright: "#82B5E0",
  colorBrandSoft: "#5EBCB0",
  colorBrandSoftLight: "#EBF7F5",
  colorAccentWarm: "#E8956B",
  colorAccentWarmLight: "#FDF0E8",
  colorPeach: "#F0A8B2",
  colorPeachLight: "#FDF0F2",
  colorLavender: "#B6A8D8",
  colorLavenderLight: "#F2F0F8",
  colorLemon: "#E8C84A",
  colorLemonLight: "#FEF8E6",
  colorSuccess: "#4CAF82",
  colorWarning: "#E8A84C",
  colorError: "#E06B6B",
  colorBgLayout: "#F5F3F0",
  colorBgContainer: "#ffffff",
  colorSurface: "#F8F6F3",
  colorBorder: "#E8E3DE",
  colorBorderSecondary: "#F0ECE8",
  colorText: "#2D3748",
  colorTextSecondary: "#5A6B7D",
  colorTextTertiary: "#8D99A8",
  colorOnPrimary: "#ffffff",
  colorSider: "#3B4A6B",
  colorSiderTrigger: "#4A5A7B",
  colorWechat: "#07c160",
  colorStatSoftBorder: "#D6E8E4",
  borderRadius: 8,
  borderRadiusCard: 12,
  controlHeight: 36,
  shadowCard: "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.02)",
  shadowElevated: "0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 6px rgba(0, 0, 0, 0.02)",
  shadowLogin: "0 8px 40px rgba(0, 0, 0, 0.07), 0 2px 8px rgba(0, 0, 0, 0.03)",
} as const;

export const adminThemeGradients = {
  primary: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorPrimaryBright} 100%)`,
  brand: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorBrandSoft} 100%)`,
  hero: `linear-gradient(135deg, #82B5E0 0%, #7ED1C6 50%, #F0A8B2 100%)`,
  loginBackground: "linear-gradient(135deg, #EDE8F5 0%, #F5F3F0 40%, #FDF0F2 100%)",
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
      darkItemSelectedBg: "rgba(94, 188, 176, 0.2)",
      darkItemHoverBg: "rgba(255, 255, 255, 0.08)",
      darkItemColor: "rgba(255, 255, 255, 0.7)",
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
