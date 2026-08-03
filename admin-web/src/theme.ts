import { theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";

export const adminThemeTokens = {
  colorPrimary: "#7C5CFC",
  colorPrimaryBright: "#9F7BFA",
  colorBrandSoft: "#0DA593",
  colorBrandSoftLight: "#D6F4F1",
  colorAccentWarm: "#FF7A59",
  colorAccentWarmLight: "#FFE9E2",
  colorPeach: "#E05FA8",
  colorPeachLight: "#FBE9F4",
  colorLavender: "#8B7CF6",
  colorLavenderLight: "#F0EDFA",
  colorLemon: "#E8C84A",
  colorLemonLight: "#FEF8E6",
  colorSuccess: "#0DA593",
  colorWarning: "#B8904A",
  colorError: "#E8563A",
  colorBgLayout: "#F6F5FA",
  colorBgContainer: "#ffffff",
  colorSurface: "#FAF8FE",
  colorBorder: "#EEEAF7",
  colorBorderSecondary: "#F4F1FA",
  colorText: "#18142A",
  colorTextSecondary: "#5A5468",
  colorTextTertiary: "#9A93B0",
  colorOnPrimary: "#ffffff",
  colorSider: "#3D3656",
  colorSiderTrigger: "#4A4266",
  colorWechat: "#07c160",
  colorStatSoftBorder: "#E3DCF7",
  borderRadius: 8,
  borderRadiusCard: 12,
  controlHeight: 36,
  shadowCard: "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.02)",
  shadowElevated: "0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 6px rgba(0, 0, 0, 0.02)",
  shadowLogin: "0 8px 40px rgba(0, 0, 0, 0.07), 0 2px 8px rgba(0, 0, 0, 0.03)",
} as const;

// 暗色模式下需要翻转的调色板（品牌色、侧边栏等不变）。
// 与 index.css 中 @media (prefers-color-scheme: dark) 的 CSS 变量保持一致。
export const adminThemeTokensDark = {
  colorBrandSoftLight: "#153B38",
  colorBgLayout: "#14111F",
  colorBgContainer: "#1F1B2E",
  colorBgElevated: "#2A2540",
  colorSurface: "#262038",
  colorBorder: "#332C4A",
  colorBorderSecondary: "#2A2540",
  colorText: "#EDEAFA",
  colorTextSecondary: "#B3ACCC",
  colorTextTertiary: "#7E7799",
  colorStatSoftBorder: "#3A3358",
  shadowCard: "0 2px 8px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.25)",
  shadowElevated: "0 4px 16px rgba(0, 0, 0, 0.45), 0 1px 6px rgba(0, 0, 0, 0.3)",
} as const;

export const adminThemeGradients = {
  primary: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorPrimaryBright} 100%)`,
  brand: `linear-gradient(135deg, ${adminThemeTokens.colorPrimary} 0%, ${adminThemeTokens.colorBrandSoft} 100%)`,
  hero: `linear-gradient(135deg, #7C5CFC 0%, #B458E8 55%, #E05FA8 100%)`,
  loginBackground: "linear-gradient(135deg, #F0EDFA 0%, #F6F5FA 40%, #FBE9F4 100%)",
} as const;

export function getThemeConfig(isDark: boolean): ThemeConfig {
  const palette = isDark
    ? { ...adminThemeTokens, ...adminThemeTokensDark }
    : adminThemeTokens;
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: adminThemeTokens.colorPrimary,
      borderRadius: adminThemeTokens.borderRadius,
      colorSuccess: adminThemeTokens.colorSuccess,
      colorWarning: adminThemeTokens.colorWarning,
      colorError: adminThemeTokens.colorError,
      colorBgLayout: palette.colorBgLayout,
      colorBgContainer: palette.colorBgContainer,
      colorBgElevated: isDark ? adminThemeTokensDark.colorBgElevated : palette.colorBgContainer,
      colorBorder: palette.colorBorder,
      colorBorderSecondary: palette.colorBorderSecondary,
      colorText: palette.colorText,
      colorTextSecondary: palette.colorTextSecondary,
      colorTextTertiary: palette.colorTextTertiary,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: 14,
      fontSizeHeading2: 24,
      fontSizeHeading3: 20,
      fontSizeHeading4: 16,
      controlHeight: adminThemeTokens.controlHeight,
      boxShadow: palette.shadowCard,
      boxShadowSecondary: palette.shadowElevated,
    },
    components: {
      Layout: {
        siderBg: adminThemeTokens.colorSider,
        headerBg: palette.colorBgContainer,
        bodyBg: palette.colorBgLayout,
        triggerBg: adminThemeTokens.colorSiderTrigger,
      },
      Menu: {
        darkItemBg: adminThemeTokens.colorSider,
        darkItemSelectedBg: "rgba(124, 92, 252, 0.28)",
        darkItemHoverBg: "rgba(255, 255, 255, 0.08)",
        darkItemColor: "rgba(255, 255, 255, 0.7)",
        darkItemSelectedColor: adminThemeTokens.colorOnPrimary,
      },
      Card: {
        borderRadiusLG: adminThemeTokens.borderRadiusCard,
      },
      Table: {
        borderRadiusLG: adminThemeTokens.borderRadius,
        headerBg: palette.colorSurface,
      },
      Button: {
        borderRadiusLG: adminThemeTokens.borderRadius,
      },
    },
  };
}

const theme: ThemeConfig = getThemeConfig(false);

export default theme;
