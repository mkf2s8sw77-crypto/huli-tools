import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Table, Spin, Alert, Typography, Tag } from "antd";
import { UserOutlined, ShoppingCartOutlined, CreditCardOutlined, AppstoreOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";

const fenToYuan = (fen: number) => (fen / 100).toFixed(2);
const orderStatusMap: Record<string, { text: string; color: string }> = {
  created: { text: "已创建", color: "default" },
  pending_pay: { text: "待支付", color: "orange" },
  paid: { text: "已支付", color: "green" },
  closed: { text: "已关闭", color: "default" },
  failed: { text: "失败", color: "red" },
  refunded: { text: "已退款", color: "purple" },
};

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

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (error) return <Alert message="加载失败" description={error} type="error" />;
  if (!data) return null;

  const d = data as Record<string, unknown>;

  return (
    <div>
      <Typography.Title level={4}>概览</Typography.Title>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card><Statistic title="注册用户" value={d.totalUsers as number} prefix={<UserOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="支付订单" value={d.totalOrders as number} prefix={<ShoppingCartOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="积分账户" value={d.totalPointAccounts as number} prefix={<CreditCardOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="使用记录" value={d.totalUsageRecords as number} prefix={<AppstoreOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="最近订单" size="small">
            <Table
              dataSource={d.recentOrders as Record<string, unknown>[]}
              rowKey="_id"
              size="small"
              pagination={false}
              columns={[
                { title: "订单号", dataIndex: "orderNo", width: 180 },
                { title: "金额", dataIndex: "amountFen", width: 80, render: (v: number) => "¥" + fenToYuan(v) },
                { title: "状态", dataIndex: "status", width: 80, render: (s: string) => {
                  const m = orderStatusMap[s];
                  return m ? <Tag color={m.color}>{m.text}</Tag> : s;
                }},
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近审计" size="small">
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
