import { useState } from "react";
import { Card, Form, Input, Button, message, Typography, Divider } from "antd";
import { LockOutlined, UserOutlined, WechatOutlined } from "@ant-design/icons";
import { auth } from "../services/cloudbase";
import { adminThemeGradients, adminThemeTokens } from "../theme";

const WECHAT_LOGIN_ENABLED = import.meta.env.VITE_WECHAT_LOGIN_ENABLED === "true";
const WECHAT_PROVIDER_ID = import.meta.env.VITE_WECHAT_PROVIDER_ID || "wx_open";
const WECHAT_REDIRECT_URI = import.meta.env.VITE_WECHAT_REDIRECT_URI || "";

function getErrorMessage(err: unknown, fallback: string) {
  const e = err as {
    message?: string;
    error_description?: string;
    errMsg?: string;
    error?: string;
    code?: string;
    response?: { data?: { error_description?: string; error?: string; code?: string } };
  };
  return e?.message
    || e?.error_description
    || e?.response?.data?.error_description
    || e?.errMsg
    || e?.error
    || e?.response?.data?.error
    || e?.code
    || e?.response?.data?.code
    || fallback;
}

function createOAuthState() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getWechatRedirectUri() {
  return WECHAT_REDIRECT_URI || window.location.origin + window.location.pathname;
}

const loginStyles = {
  wrapper: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: adminThemeGradients.loginBackground,
  } as React.CSSProperties,
  card: {
    width: 420,
    borderRadius: 16,
    boxShadow: adminThemeTokens.shadowLogin,
    border: "1px solid " + adminThemeTokens.colorBorder,
  } as React.CSSProperties,
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  } as React.CSSProperties,
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: adminThemeGradients.brand,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as React.CSSProperties,
  brandDot: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "2.5px solid rgba(255, 255, 255, 0.85)",
  } as React.CSSProperties,
  wechatBtn: {
    background: adminThemeTokens.colorWechat,
    borderColor: adminThemeTokens.colorWechat,
    color: adminThemeTokens.colorOnPrimary,
    borderRadius: adminThemeTokens.borderRadius,
  } as React.CSSProperties,
};

interface Props {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);

  const handleLogin = async (values: { account: string; password: string }) => {
    setLoading(true);
    try {
      await auth.signInWithUsernameAndPassword(values.account, values.password);
      message.success("登录成功");
      onLoginSuccess();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
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

  const handleWechatLogin = async () => {
    setWechatLoading(true);
    try {
      const state = createOAuthState();
      sessionStorage.setItem("wx_oauth_state", state);

      const redirectUri = getWechatRedirectUri();

      const result = await (auth as unknown as {
        genProviderRedirectUri: (opts: { provider_id: string; provider_redirect_uri: string; state: string }) => Promise<{ uri: string }>;
      }).genProviderRedirectUri({
        provider_id: WECHAT_PROVIDER_ID,
        provider_redirect_uri: redirectUri,
        state,
      });

      if (result?.uri) {
        window.location.href = result.uri;
      } else {
        message.error("获取微信授权地址失败，请检查 CloudBase 微信开放平台登录配置");
      }
    } catch (err: unknown) {
      message.error("微信登录发起失败: " + getErrorMessage(err, "请检查 CloudBase 微信开放平台登录配置"));
    } finally {
      setWechatLoading(false);
    }
  };

  return (
    <div style={loginStyles.wrapper}>
      <Card style={loginStyles.card}>
        <div style={loginStyles.brandRow}>
          <div style={loginStyles.brandMark}>
            <div style={loginStyles.brandDot} />
          </div>
          <Typography.Title level={3} style={{ margin: 0, color: adminThemeTokens.colorText }}>
            沪里工具
          </Typography.Title>
        </div>
        <Typography.Text type="secondary" style={{ display: "block", textAlign: "center", marginBottom: 28 }}>
          管理端 · 使用 CloudBase Auth 账号登录
        </Typography.Text>
        <Form onFinish={handleLogin} layout="vertical" autoComplete="off">
          <Form.Item name="account" rules={[{ required: true, message: "请输入用户名或邮箱" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ borderRadius: adminThemeTokens.borderRadius }}>
              登录
            </Button>
          </Form.Item>
        </Form>

        {WECHAT_LOGIN_ENABLED && (
          <>
            <Divider plain>或</Divider>
            <Button
              block
              size="large"
              icon={<WechatOutlined />}
              loading={wechatLoading}
              onClick={handleWechatLogin}
              style={loginStyles.wechatBtn}
            >
              微信扫码登录
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
