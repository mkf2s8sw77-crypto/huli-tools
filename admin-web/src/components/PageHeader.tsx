import { Typography, Space } from "antd";
import type { ReactNode } from "react";
import { adminThemeTokens } from "../theme";

interface Props {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export default function PageHeader({ title, subtitle, extra }: Props) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, color: adminThemeTokens.colorText }}>{title}</Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>{subtitle}</Typography.Text>
        )}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}
