import { useCallback, useEffect, useState } from "react";
import { Table, Input, Select, Space } from "antd";
import { adminApi } from "../services/adminApi";
import { PageHeader, StatusTag } from "../components";

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "created", label: "已创建" },
  { value: "pending_pay", label: "待支付" },
  { value: "paid", label: "已支付" },
  { value: "closed", label: "已关闭" },
  { value: "failed", label: "失败" },
  { value: "refunded", label: "已退款" },
];


export default function OrdersPage() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const load = useCallback(async (p: number, ps: number, filterOverride: Record<string, string>) => {
    setLoading(true);
    try {
      const f = filterOverride;
      const params: Record<string, unknown> = { page: p, pageSize: ps };
      if (f.userId) params.userId = f.userId;
      if (f.orderNo) params.orderNo = f.orderNo;
      if (f.status) params.status = f.status;
      if (f.startAt) params.startAt = f.startAt;
      if (f.endAt) params.endAt = f.endAt;
      const res = await adminApi.listOrders(params as Parameters<typeof adminApi.listOrders>[0]);
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (_e) { /* ignored */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, 20, {}); }, [load]);

  const onFilterChange = (key: string, val: string) => {
    const newF = { ...filters, [key]: val };
    setFilters(newF);
    setPage(1);
    load(1, pageSize, newF);
  };

  return (
    <div>
      <PageHeader title="订单查询" />
      <Space wrap style={{ marginBottom: 16 }}>
        <Input placeholder="用户ID" style={{ width: 200 }} allowClear onChange={(e) => onFilterChange("userId", e.target.value)} />
        <Input placeholder="订单号" style={{ width: 200 }} allowClear onChange={(e) => onFilterChange("orderNo", e.target.value)} />
        <Select
          style={{ width: 120 }}
          options={statusOptions}
          defaultValue=""
          onChange={(v) => onFilterChange("status", v)}
        />
      </Space>
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); load(p, ps, filters); },
        }}
        columns={[
          { title: "订单号", dataIndex: "orderNo", width: 200 },
          { title: "用户ID", dataIndex: "userId", width: 160, ellipsis: true },
          { title: "套餐", dataIndex: "packageKey", width: 100 },
          { title: "金额", dataIndex: "amountFen", width: 80, render: (v: number) => "¥" + (v / 100).toFixed(2) },
          { title: "积分", dataIndex: "pointsTotal", width: 60 },
          { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="order" status={s} /> },
          { title: "支付方式", dataIndex: "provider", width: 80 },
          { title: "创建时间", dataIndex: "createdAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
        ]}
      />
    </div>
  );
}
