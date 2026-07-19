import { useCallback, useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";
import { PageHeader, StatusTag } from "../components";

const fenToYuan = (fen: number) => (fen / 100).toFixed(2);
const yuanToFen = (yuan: number) => Math.round(yuan * 100);

export default function PackagesPage() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await adminApi.listPackages({ page: p, pageSize: 50 });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (_e) { /* ignored */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const openEdit = (record: Record<string, unknown> | null) => {
    setEditing(record);
    if (record) {
      form.setFieldsValue({
        packageKey: record.packageKey,
        productId: record.productId,
        name: record.name,
        amountYuan: Number(fenToYuan(record.amountFen as number)),
        basePoints: record.basePoints,
        bonusPoints: record.bonusPoints,
        status: record.status,
        sortOrder: record.sortOrder ?? 0,
      });
    } else {
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const amountFen = yuanToFen(values.amountYuan as number);
      if (amountFen <= 0 || !Number.isInteger(amountFen)) {
        message.error("金额必须为正数");
        setSaving(false);
        return;
      }
      await adminApi.upsertPackage({
        packageKey: values.packageKey,
        productId: values.productId,
        name: values.name,
        amountFen,
        basePoints: values.basePoints,
        bonusPoints: values.bonusPoints,
        status: values.status,
        sortOrder: values.sortOrder,
      });
      message.success("保存成功");
      setModalOpen(false);
      load(page);
    } catch (err: unknown) {
      message.error("保存失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="充值包管理" extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => openEdit(null)}>新增充值包</Button>} />
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => { setPage(p); load(p); } }}
        columns={[
          { title: "PackageKey", dataIndex: "packageKey", width: 120 },
          { title: "虚拟支付道具ID", dataIndex: "productId", width: 130, render: (v: string) => v || "-" },
          { title: "名称", dataIndex: "name", width: 140 },
          { title: "金额(元)", dataIndex: "amountFen", width: 80, render: (v: number) => "¥" + fenToYuan(v) },
          { title: "基础积分", dataIndex: "basePoints", width: 80 },
          { title: "赠送积分", dataIndex: "bonusPoints", width: 80 },
          { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="package" status={s} /> },
          { title: "操作", width: 80, render: (_: unknown, record: Record<string, unknown>) => (
            <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          )},
        ]}
      />

      <Modal
        title={editing ? "编辑充值包" : "新增充值包"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="packageKey" label="PackageKey" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="productId" label="虚拟支付道具ID" tooltip="小程序虚拟支付(mp 后台)配置的道具 ID，虚拟支付充值包必填">
            <Input placeholder="如 pkg_60points" allowClear />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amountYuan" label="金额(元)" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="basePoints" label="基础积分" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="bonusPoints" label="赠送积分" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ value: "active", label: "启用" }, { value: "disabled", label: "停用" }]} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序权重">
            <InputNumber precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
