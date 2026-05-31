import { useCallback, useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";
import { PageHeader, StatusTag } from "../components";

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "disabled", label: "停用" },
  { value: "coming_soon", label: "即将上线" },
];

export default function AppsPage() {
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
      const res = await adminApi.listApps({ page: p, pageSize: 50 });
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
      const pricing = record.pricing as Record<string, unknown>;
      form.setFieldsValue({
        appKey: record.appKey,
        name: record.name,
        description: record.description,
        entryPage: record.entryPage,
        cloudFunctionName: record.cloudFunctionName,
        status: record.status,
        costPoints: pricing?.costPoints ?? 0,
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
      await adminApi.upsertApp({
        appKey: values.appKey,
        name: values.name,
        description: values.description,
        entryPage: values.entryPage,
        cloudFunctionName: values.cloudFunctionName,
        status: values.status,
        pricing: { mode: "fixed", costPoints: values.costPoints },
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
      <PageHeader title="应用管理" extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => openEdit(null)}>新增应用</Button>} />
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => { setPage(p); load(p); } }}
        columns={[
          { title: "AppKey", dataIndex: "appKey", width: 120 },
          { title: "名称", dataIndex: "name", width: 140 },
          { title: "入口页", dataIndex: "entryPage", width: 200, ellipsis: true },
          { title: "积分/次", width: 80, render: (_: unknown, r: Record<string, unknown>) => ((r.pricing as Record<string, unknown>)?.costPoints ?? "-") },
          { title: "状态", dataIndex: "status", width: 80, render: (s: string) => <StatusTag domain="app" status={s} /> },
          { title: "排序", dataIndex: "sortOrder", width: 60 },
          { title: "操作", width: 80, render: (_: unknown, record: Record<string, unknown>) => (
            <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          )},
        ]}
      />

      <Modal
        title={editing ? "编辑应用" : "新增应用"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="appKey" label="AppKey" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="entryPage" label="入口页" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cloudFunctionName" label="云函数名">
            <Input />
          </Form.Item>
          <Form.Item name="costPoints" label="积分/次" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={statusOptions} />
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
