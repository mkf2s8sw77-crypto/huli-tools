import { Tag } from "antd";

const STATUS_COLORS: Record<string, Record<string, { text: string; color: string }>> = {
  order: {
    created: { text: "已创建", color: "default" },
    pending_pay: { text: "待支付", color: "orange" },
    paid: { text: "已支付", color: "green" },
    closed: { text: "已关闭", color: "default" },
    failed: { text: "失败", color: "red" },
    refunded: { text: "已退款", color: "purple" },
  },
  user: {
    active: { text: "正常", color: "green" },
    disabled: { text: "禁用", color: "red" },
  },
  usage: {
    created: { text: "已创建", color: "default" },
    frozen: { text: "已冻结", color: "orange" },
    succeeded: { text: "成功", color: "green" },
    failed: { text: "失败", color: "red" },
    released: { text: "已释放", color: "default" },
  },
  app: {
    active: { text: "启用", color: "green" },
    coming_soon: { text: "即将上线", color: "orange" },
    disabled: { text: "停用", color: "default" },
  },
  package: {
    active: { text: "启用", color: "green" },
    disabled: { text: "停用", color: "default" },
  },
};

interface Props {
  domain: "order" | "user" | "usage" | "app" | "package";
  status: string;
}

export default function StatusTag({ domain, status }: Props) {
  const map = STATUS_COLORS[domain] || {};
  const entry = map[status];
  if (!entry) return <Tag>{status}</Tag>;
  return <Tag color={entry.color}>{entry.text}</Tag>;
}
