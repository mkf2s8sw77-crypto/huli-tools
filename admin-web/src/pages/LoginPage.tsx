import { useState } from "react";
import { Card, Form, Input, Button, message, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { auth } from "../services/cloudbase";

interface Props {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { account: string; password: string }) => {
    setLoading(true);
    try {
      // 尝试用户名密码登录
      await auth.signInWithUsernameAndPassword(values.account, values.password);
      message.success("登录成功");
      onLoginSuccess();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      // 如果用户名登录失败，尝试邮箱登录
      try {
        await auth.signInWithEmailAndPassword(values.account, values.password);
        message.success("登录成功");
        onLoginSuccess();
      } catch (err2: unknown) {
        const e2 = err2 as { message?: string };
        message.error("登录失败: " + (e2.message || e.message || "未知错误"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ textAlign: "center", marginBottom: 24 }}>
          沪里工具管理端
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: "block", textAlign: "center", marginBottom: 24 }}>
          使用 CloudBase Auth 账号登录
        </Typography.Text>
        <Form onFinish={handleLogin} layout="vertical" autoComplete="off">
          <Form.Item name="account" rules={[{ required: true, message: "请输入用户名或邮箱" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
