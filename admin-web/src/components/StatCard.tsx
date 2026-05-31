import { Card, Statistic } from "antd";
import type { ReactNode } from "react";

interface Props {
  title: string;
  value: number | string;
  prefix?: ReactNode;
}

export default function StatCard({ title, value, prefix }: Props) {
  return (
    <Card>
      <Statistic title={title} value={value} prefix={prefix} />
    </Card>
  );
}
