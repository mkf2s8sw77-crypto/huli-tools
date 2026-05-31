import { useCallback, useEffect, useState } from "react";
import { Table, Input, Select, Space } from "antd";
import { adminApi } from "../services/adminApi";
import { PageHeader, StatusTag } from "../components";

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "created", label: "已创建" },
  { value: "frozen", label: "已冻结" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "released", label: "已释放" },
];


export default function UsageRecordsPage() {
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
      if (f.appKey) params.appKey = f.appKey;
      if (f.status) params.status = f.status;
      const res = await adminApi.listUsageRecords(params as Parameters<typeof adminApi.listUsageRecords>[0]);
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
      <PageHeader title="使用记录" />
      <Space wrap style={{ marginBottom: 16 }}>
        <Input placeholder="用户ID" style={{ width: 200 }} allowClear onChange={(e) => onFilterChange("userId", e.target.value)} />
        <Input placeholder="AppKey" style={{ width: 140 }} allowClear onChange={(e) => onFilterChange("appKey", e.target.value)} />
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
          { title: "用户ID", dataIndex: "userId", width: 160, ellipsis: true },
          { title: "应用", dataIndex: "appKey", width: 100 },
          { title: "积分", dataIndex: "costPoints", width: 60 },
          { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="usage" status={s} /> },
          { title: "错误码", dataIndex: "errorCode", width: 100, render: (v: string) => v || "-" },
          { title: "错误信息", dataIndex: "errorMessage", width: 160, ellipsis: true, render: (v: string) => v || "-" },
          { title: "开始时间", dataIndex: "startedAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
        ]}
      />
    </div>
  );
}
