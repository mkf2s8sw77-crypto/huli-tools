import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Descriptions, Card, Table, Tag, Button, Modal, Form, InputNumber, Input, Space, Typography, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";
import { StatusTag, LoadingState, ErrorState } from "../components";

const txTypeMap: Record<string, { text: string; color: string }> = {
  freeze: { text: "冻结", color: "orange" },
  settle: { text: "结算扣费", color: "red" },
  release: { text: "释放", color: "green" },
  recharge: { text: "充值到账", color: "green" },
  admin_adjust: { text: "管理员调整", color: "blue" },
};

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await adminApi.getUserDetail(userId);
      setDetail(res.data);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdjust = async (values: { deltaPoints: number; note: string }) => {
    setAdjusting(true);
    try {
      await adminApi.adjustPoints({
        targetUserId: userId!,
        deltaPoints: values.deltaPoints,
        note: values.note,
      });
      message.success("积分调整成功");
      setAdjustOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error("调整失败: " + (err as Error).message);
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!detail) return null;

  const d = detail as Record<string, unknown>;
  const user = d.user as Record<string, unknown>;
  const pointAccount = d.pointAccount as Record<string, unknown> | null;
  const txs = (d.recentTransactions || []) as Record<string, unknown>[];
  const orders = (d.recentOrders || []) as Record<string, unknown>[];
  const usages = (d.recentUsageRecords || []) as Record<string, unknown>[];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/users")}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>用户详情</Typography.Title>
      </Space>

      <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="用户ID">{user._id as string}</Descriptions.Item>
          <Descriptions.Item label="OpenID">{user.openid as string}</Descriptions.Item>
          <Descriptions.Item label="昵称">{(user.nickname as string) || "-"}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <StatusTag domain="user" status={user.status as string} />
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{user.createdAt ? new Date(user.createdAt as string).toLocaleString() : "-"}</Descriptions.Item>
          <Descriptions.Item label="最后登录">{user.lastLoginAt ? new Date(user.lastLoginAt as string).toLocaleString() : "-"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="积分账户"
        size="small"
        style={{ marginBottom: 16 }}
        extra={<Button type="primary" size="small" onClick={() => setAdjustOpen(true)}>调整积分</Button>}
      >
        {pointAccount ? (
          <Descriptions column={2} size="small">
            <Descriptions.Item label="可用积分">{pointAccount.availablePoints as number}</Descriptions.Item>
            <Descriptions.Item label="冻结积分">{pointAccount.frozenPoints as number}</Descriptions.Item>
            <Descriptions.Item label="累计充值">{pointAccount.totalRechargedPoints as number}</Descriptions.Item>
            <Descriptions.Item label="累计消费">{pointAccount.totalConsumedPoints as number}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">暂无积分账户</Typography.Text>
        )}
      </Card>

      <Card title="最近积分流水" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={txs}
          rowKey="_id"
          size="small"
          pagination={false}
          columns={[
            { title: "类型", dataIndex: "type", width: 100, render: (t: string) => {
              const m = txTypeMap[t];
              return m ? <Tag color={m.color}>{m.text}</Tag> : t;
            }},
            { title: "可用变化", dataIndex: "deltaAvailable", width: 80 },
            { title: "冻结变化", dataIndex: "deltaFrozen", width: 80 },
            { title: "备注", dataIndex: "note", ellipsis: true },
            { title: "时间", dataIndex: "createdAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
          ]}
        />
      </Card>

      <Card title="最近订单" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={orders}
          rowKey="_id"
          size="small"
          pagination={false}
          columns={[
            { title: "订单号", dataIndex: "orderNo", width: 200 },
            { title: "金额", dataIndex: "amountFen", width: 80, render: (v: number) => "¥" + (v / 100).toFixed(2) },
            { title: "积分", dataIndex: "pointsTotal", width: 60 },
            { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="order" status={s} /> },
            { title: "时间", dataIndex: "createdAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
          ]}
        />
      </Card>

      <Card title="最近使用记录" size="small">
        <Table
          dataSource={usages}
          rowKey="_id"
          size="small"
          pagination={false}
          columns={[
            { title: "应用", dataIndex: "appKey", width: 100 },
            { title: "积分", dataIndex: "costPoints", width: 60 },
            { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="usage" status={s} /> },
            { title: "时间", dataIndex: "startedAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
          ]}
        />
      </Card>

      <Modal
        title="调整积分"
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleAdjust} layout="vertical">
          <Form.Item label="目标用户">
            <Input value={userId} disabled />
          </Form.Item>
          <Form.Item
            name="deltaPoints"
            label="变动积分（正数增加，负数减少）"
            rules={[
              { required: true, message: "请输入变动积分" },
              { type: "number", transform: (v: string) => Number(v), message: "必须为整数" },
            ]}
          >
            <InputNumber style={{ width: "100%" }} precision={0} />
          </Form.Item>
          <Form.Item name="note" label="备注" rules={[{ required: true, message: "请输入备注" }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={adjusting} block>
              确认调整
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
