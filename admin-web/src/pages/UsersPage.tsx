import { useCallback, useEffect, useState } from "react";
import { Table, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import { PageHeader, FilterBar, StatusTag } from "../components";

export default function UsersPage() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (p: number, ps: number, kw: string) => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ page: p, pageSize: ps, keyword: kw || undefined });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch {
      // handled by global
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, 20, ""); }, [load]);

  const handleSearch = () => { setPage(1); load(1, pageSize, keyword); };

  return (
    <div>
      <PageHeader title="用户管理" />
      <FilterBar
        keyword={keyword}
        onChange={setKeyword}
        onSearch={handleSearch}
        placeholder="按 openid / userId / 昵称搜索"
      />
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); load(p, ps, keyword); },
        }}
        columns={[
          { title: "用户ID", dataIndex: "_id", width: 200, ellipsis: true },
          { title: "昵称", dataIndex: "nickname", width: 120 },
          { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="user" status={s} /> },
          { title: "创建时间", dataIndex: "createdAt", width: 180, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
          { title: "操作", width: 80, render: (_: unknown, record: Record<string, unknown>) => (
            <Button type="link" size="small" onClick={() => navigate(`/users/${record._id}`)}>详情</Button>
          )},
        ]}
      />
    </div>
  );
}
