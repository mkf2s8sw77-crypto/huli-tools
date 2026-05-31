import { Typography, Space } from "antd";
import type { ReactNode } from "react";

interface Props {
  title: string;
  extra?: ReactNode;
}

export default function PageHeader({ title, extra }: Props) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
      {extra && <Space>{extra}</Space>}
    </div>
  );
}
