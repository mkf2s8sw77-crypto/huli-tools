import { useCallback, useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Tabs, Tag, message, AutoComplete } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { adminApi } from "../services/adminApi";
import { PageHeader } from "../components";

const typeOptions = [
  { value: "text_chat", label: "文本对话" },
  { value: "image_gen", label: "图像生成" },
  { value: "audio_tts", label: "音频合成" },
];

const driverOptions = [
  { value: "minimax", label: "MiniMax（OpenAI 兼容）" },
  { value: "cloudbase_ai", label: "CloudBase AI" },
  { value: "gpt_image_web", label: "GPT Image Web（预留）" },
  { value: "kimi_code", label: "Kimi Code（Anthropic 兼容）" },
];

const HOSTED_DRIVERS = ["minimax", "kimi_code"];

function getConfig(record: Record<string, unknown>): Record<string, unknown> {
  return (record.config as Record<string, unknown>) || {};
}

// ─── 提供方管理 ──────────────────────────────────────────

function ProvidersTab() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smoking, setSmoking] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form] = Form.useForm();
  const driver = Form.useWatch("driver", form);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await adminApi.listModelProviders({ page: p, pageSize: 50 });
      setList(res.data.list);
      setTotal(res.data.total);
    } catch (err: unknown) {
      message.error("加载失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const openEdit = (record: Record<string, unknown> | null) => {
    setEditing(record);
    if (record) {
      const config = getConfig(record);
      form.setFieldsValue({
        providerKey: record.providerKey,
        displayName: record.displayName,
        type: record.type,
        driver: record.driver,
        enabled: record.enabled !== false,
        baseUrl: config.baseUrl,
        model: config.model,
        secretEnv: config.secretEnv,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
        host: config.host,
        apiBase: config.apiBase,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ type: "text_chat", driver: "minimax", enabled: true });
    }
    setModalOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const config: Record<string, unknown> = {};
      if (HOSTED_DRIVERS.includes(values.driver as string)) {
        config.baseUrl = values.baseUrl;
        config.model = values.model;
        config.secretEnv = values.secretEnv;
        if (values.driver === "minimax" && values.temperature !== undefined) config.temperature = values.temperature;
        if (values.maxTokens !== undefined) config.maxTokens = values.maxTokens;
        if (values.timeoutMs !== undefined) config.timeoutMs = values.timeoutMs;
      } else if (values.driver === "cloudbase_ai") {
        config.model = values.model;
      } else if (values.driver === "gpt_image_web") {
        config.host = values.host;
        config.apiBase = values.apiBase;
      }
      await adminApi.upsertModelProvider({
        providerKey: values.providerKey,
        displayName: values.displayName,
        type: values.type,
        driver: values.driver,
        config,
        enabled: values.enabled !== false,
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

  const handleSmoke = async (providerKey: string) => {
    setSmoking(providerKey);
    try {
      const res = await adminApi.smokeModelProvider({ providerKey });
      const data = res.data as Record<string, unknown>;
      message.success(`连通正常（${data.latencyMs}ms，模型 ${data.model}）`);
    } catch (err: unknown) {
      message.error("连通性测试失败: " + (err as Error).message);
    } finally {
      setSmoking(null);
    }
  };

  return (
    <div>
      <PageHeader title="模型提供方" extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => openEdit(null)}>新增提供方</Button>} />
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => { setPage(p); load(p); } }}
        columns={[
          { title: "ProviderKey", dataIndex: "providerKey", width: 160 },
          { title: "名称", dataIndex: "displayName", width: 160 },
          { title: "类型", dataIndex: "type", width: 100, render: (t: string) => typeOptions.find((o) => o.value === t)?.label || t },
          { title: "驱动", dataIndex: "driver", width: 130 },
          { title: "模型", width: 160, render: (_: unknown, r: Record<string, unknown>) => String(getConfig(r).model || "-") },
          { title: "启用", dataIndex: "enabled", width: 70, render: (v: boolean) => (v !== false ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
          { title: "操作", width: 170, render: (_: unknown, record: Record<string, unknown>) => (
            <span>
              <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
              <Button
                type="link"
                size="small"
                icon={<ThunderboltOutlined />}
                loading={smoking === record.providerKey}
                onClick={() => handleSmoke(String(record.providerKey))}
              >测试</Button>
            </span>
          )},
        ]}
      />

      <Modal
        title={editing ? "编辑提供方" : "新增提供方"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="providerKey" label="ProviderKey（小写 snake_case）" rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="如 minimax_m27" />
          </Form.Item>
          <Form.Item name="displayName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={typeOptions} />
          </Form.Item>
          <Form.Item name="driver" label="驱动" rules={[{ required: true }]}>
            <Select options={driverOptions} />
          </Form.Item>
          {HOSTED_DRIVERS.includes(driver as string) && (
            <>
              <Form.Item name="baseUrl" label="BaseURL" rules={[{ required: true }]}>
                <Input placeholder={driver === "kimi_code" ? "https://api.kimi.com/coding" : "https://api.minimaxi.com/v1"} />
              </Form.Item>
              <Form.Item name="model" label="模型 ID" rules={[{ required: true }]}>
                <Input placeholder={driver === "kimi_code" ? "如 k3-256k" : "如 MiniMax-M2.7"} />
              </Form.Item>
              <Form.Item name="secretEnv" label="密钥环境变量名（secretEnv，密钥本身配置在 coreModel 环境变量）" rules={[{ required: true }]}>
                <Input placeholder={driver === "kimi_code" ? "KIMI_API_KEY" : "MINIMAX_API_KEY"} />
              </Form.Item>
              {driver === "minimax" && (
                <Form.Item name="temperature" label="temperature">
                  <InputNumber min={0} max={2} step={0.05} style={{ width: "100%" }} />
                </Form.Item>
              )}
              <Form.Item name="maxTokens" label="maxTokens">
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="timeoutMs" label="超时（毫秒）">
                <InputNumber min={1000} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </>
          )}
          {driver === "cloudbase_ai" && (
            <Form.Item name="model" label="模型 ID（CloudBase AI 已启用模型）" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          {driver === "gpt_image_web" && (
            <>
              <Form.Item name="host" label="服务 Host">
                <Input placeholder="dev.huli.sh.cn" />
              </Form.Item>
              <Form.Item name="apiBase" label="API 路径前缀">
                <Input placeholder="/gpt-image-2" />
              </Form.Item>
            </>
          )}
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ─── 应用绑定管理 ────────────────────────────────────────

function BindingsTab() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [providers, setProviders] = useState<Record<string, unknown>[]>([]);
  const [apps, setApps] = useState<Record<string, unknown>[]>([]);
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
      const [bindingRes, providerRes, appRes] = await Promise.all([
        adminApi.listModelBindings({ page: p, pageSize: 50 }),
        adminApi.listModelProviders({ page: 1, pageSize: 100 }),
        adminApi.listApps({ page: 1, pageSize: 100 }),
      ]);
      setList(bindingRes.data.list);
      setTotal(bindingRes.data.total);
      setProviders(providerRes.data.list);
      setApps(appRes.data.list);
    } catch (err: unknown) {
      message.error("加载失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const providerOptions = providers.map((p) => ({
    value: String(p.providerKey),
    label: `${p.providerKey}（${p.displayName || p.driver}）`,
  }));

  const appOptions = apps.map((a) => ({
    value: String(a.appKey),
    label: `${a.name || a.appKey}（${a.appKey}）`,
  }));

  const openEdit = (record: Record<string, unknown> | null) => {
    setEditing(record);
    if (record) {
      form.setFieldsValue({
        appKey: record.appKey,
        capability: record.capability,
        providerKey: record.providerKey,
        fallbackProviderKeys: record.fallbackProviderKeys || [],
        enabled: record.enabled !== false,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ enabled: true, fallbackProviderKeys: [] });
    }
    setModalOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminApi.upsertModelBinding({
        appKey: values.appKey,
        capability: values.capability,
        providerKey: values.providerKey,
        fallbackProviderKeys: values.fallbackProviderKeys || [],
        enabled: values.enabled !== false,
      });
      message.success("保存成功（coreModel 缓存 60 秒内生效）");
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
      <PageHeader title="应用 ↔ 模型绑定" extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => openEdit(null)}>新增绑定</Button>} />
      <Table
        dataSource={list}
        rowKey="_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => { setPage(p); load(p); } }}
        columns={[
          { title: "绑定 ID", dataIndex: "_id", width: 240 },
          { title: "AppKey", dataIndex: "appKey", width: 150 },
          { title: "能力", dataIndex: "capability", width: 140 },
          { title: "主模型", dataIndex: "providerKey", width: 150 },
          { title: "Fallback 链", width: 200, render: (_: unknown, r: Record<string, unknown>) => ((r.fallbackProviderKeys as string[]) || []).join(" → ") || "-" },
          { title: "启用", dataIndex: "enabled", width: 70, render: (v: boolean) => (v !== false ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
          { title: "操作", width: 80, render: (_: unknown, record: Record<string, unknown>) => (
            <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          )},
        ]}
      />

      <Modal
        title={editing ? "编辑绑定" : "新增绑定"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="appKey" label="AppKey" rules={[{ required: true }]}>
            <AutoComplete
              options={appOptions}
              disabled={!!editing}
              placeholder="选择已上架应用，或直接输入新 appKey"
              filterOption={(input, option) =>
                String(option?.value || "").toLowerCase().includes(input.toLowerCase())
                || String(option?.label || "").toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="capability" label="能力（capability，小写 snake_case）" rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="如 course_generate" />
          </Form.Item>
          <Form.Item name="providerKey" label="主模型提供方" rules={[{ required: true }]}>
            <Select options={providerOptions} showSearch />
          </Form.Item>
          <Form.Item name="fallbackProviderKeys" label="Fallback 链（主模型限流/超时时按顺序切换）">
            <Select options={providerOptions} mode="multiple" showSearch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <Tabs
      items={[
        { key: "providers", label: "模型提供方", children: <ProvidersTab /> },
        { key: "bindings", label: "应用绑定", children: <BindingsTab /> },
      ]}
    />
  );
}
