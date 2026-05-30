import { useCallback, useEffect, useState } from "react";
import { Table, Typography, Modal, Descriptions } from "antd";
import { adminApi } from "../services/adminApi";

export default function AuditLogsPage() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const res = await adminApi.listAuditLogs({ page: p, pageSize: ps });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (_e) { /* ignored */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, 20); }, [load]);

  const formatSummary = (v: unknown) => {
    if (!v) return "-";
    if (typeof v === "string") {
      try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
    }
    return JSON.stringify(v, null, 2);
  };

  return (
    <div>
      <Typography.Title level={4}>审计日志</Typography.Title>
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); load(p, ps); },
        }}
        onRow={(record) => ({ onClick: () => setDetail(record), style: { cursor: "pointer" } })}
        columns={[
          { title: "操作人", dataIndex: "adminUserId", width: 160, ellipsis: true },
          { title: "操作", dataIndex: "action", width: 120 },
          { title: "目标集合", dataIndex: "targetCollection", width: 140 },
          { title: "目标ID", dataIndex: "targetId", width: 140, ellipsis: true },
          { title: "请求ID", dataIndex: "requestId", width: 140, ellipsis: true },
          { title: "时间", dataIndex: "createdAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
        ]}
      />

      <Modal
        title="审计详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={700}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="操作人">{detail.adminUserId as string}</Descriptions.Item>
            <Descriptions.Item label="操作">{detail.action as string}</Descriptions.Item>
            <Descriptions.Item label="目标集合">{detail.targetCollection as string}</Descriptions.Item>
            <Descriptions.Item label="目标ID">{detail.targetId as string}</Descriptions.Item>
            <Descriptions.Item label="请求ID">{detail.requestId as string}</Descriptions.Item>
            <Descriptions.Item label="时间">{detail.createdAt ? new Date(detail.createdAt as string).toLocaleString() : "-"}</Descriptions.Item>
            <Descriptions.Item label="变更前">
              <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: "auto" }}>{formatSummary(detail.beforeSummary)}</pre>
            </Descriptions.Item>
            <Descriptions.Item label="变更后">
              <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: "auto" }}>{formatSummary(detail.afterSummary)}</pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
