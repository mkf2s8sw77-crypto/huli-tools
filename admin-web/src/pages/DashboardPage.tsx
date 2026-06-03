import { useEffect, useState } from "react";
import { Card, Row, Col, Table } from "antd";
import { UserOutlined, ShoppingCartOutlined, CreditCardOutlined, AppstoreOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";
import { PageHeader, StatCard, StatusTag, LoadingState, ErrorState } from "../components";

const fenToYuan = (fen: number) => (fen / 100).toFixed(2);

export default function DashboardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await adminApi.dashboardSummary();
        setData(res.data);
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!data) return null;

  const d = data as Record<string, unknown>;

  return (
    <div>
      <PageHeader title="概览" subtitle="平台运营数据概况" />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <StatCard title="注册用户" value={d.totalUsers as number} prefix={<UserOutlined />} />
        </Col>
        <Col span={6}>
          <StatCard title="支付订单" value={d.totalOrders as number} prefix={<ShoppingCartOutlined />} />
        </Col>
        <Col span={6}>
          <StatCard title="积分账户" value={d.totalPointAccounts as number} prefix={<CreditCardOutlined />} />
        </Col>
        <Col span={6}>
          <StatCard title="使用记录" value={d.totalUsageRecords as number} prefix={<AppstoreOutlined />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="最近订单" size="small" style={{ borderRadius: 12 }}>
            <Table
              dataSource={d.recentOrders as Record<string, unknown>[]}
              rowKey="_id"
              size="small"
              pagination={false}
              columns={[
                { title: "订单号", dataIndex: "orderNo", width: 180 },
                { title: "金额", dataIndex: "amountFen", width: 80, render: (v: number) => "¥" + fenToYuan(v) },
                { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="order" status={s} /> },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近审计" size="small" style={{ borderRadius: 12 }}>
            <Table
              dataSource={d.recentAuditLogs as Record<string, unknown>[]}
              rowKey="_id"
              size="small"
              pagination={false}
              columns={[
                { title: "操作人", dataIndex: "adminUserId", width: 120, ellipsis: true },
                { title: "操作", dataIndex: "action", width: 120 },
                { title: "目标", dataIndex: "targetId", width: 120, ellipsis: true },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
