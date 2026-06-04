import { Card, Statistic } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { adminThemeGradients, adminThemeTokens } from "../theme";

interface Props {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  subtitle?: string;
  variant?: "default" | "primary" | "soft";
}

const variantStyles: Record<NonNullable<Props["variant"]>, CSSProperties> = {
  default: {},
  primary: {
    background: adminThemeGradients.hero,
    borderColor: "transparent",
  },
  soft: {
    background: adminThemeTokens.colorBrandSoftLight,
    borderColor: adminThemeTokens.colorStatSoftBorder,
  },
};

export default function StatCard({ title, value, prefix, subtitle, variant = "default" }: Props) {
  const isPrimary = variant === "primary";
  return (
    <Card
      style={{
        borderRadius: 12,
        ...variantStyles[variant],
      }}
    >
      <Statistic
        title={<span style={isPrimary ? { color: "rgba(255,255,255,0.8)" } : undefined}>{title}</span>}
        value={value}
        prefix={prefix}
        valueStyle={isPrimary ? { color: adminThemeTokens.colorOnPrimary } : { color: adminThemeTokens.colorText }}
      />
      {subtitle && (
        <div style={{ marginTop: 4, fontSize: 12, color: isPrimary ? "rgba(255,255,255,0.7)" : adminThemeTokens.colorTextTertiary }}>
          {subtitle}
        </div>
      )}
    </Card>
  );
}
