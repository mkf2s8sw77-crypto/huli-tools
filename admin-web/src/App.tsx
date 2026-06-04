import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Dropdown, Button, Spin, Result, message } from "antd";
import {
  DashboardOutlined,
  UserOutlined,
  AppstoreOutlined,
  GiftOutlined,
  OrderedListOutlined,
  FileTextOutlined,
  AuditOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { auth } from "./services/cloudbase";
import { adminApi } from "./services/adminApi";
import { adminThemeTokens } from "./theme";
import huliTechLogo from "./assets/huli-tech-logo.png";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import UserDetailPage from "./pages/UserDetailPage";
import AppsPage from "./pages/AppsPage";
import PackagesPage from "./pages/PackagesPage";
import OrdersPage from "./pages/OrdersPage";
import UsageRecordsPage from "./pages/UsageRecordsPage";
import AuditLogsPage from "./pages/AuditLogsPage";

const { Header, Sider, Content } = Layout;

interface AdminInfo {
  adminUserId: string;
  source: string;
}

const menuItems = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "概览" },
  { key: "/users", icon: <UserOutlined />, label: "用户管理" },
  { key: "/apps", icon: <AppstoreOutlined />, label: "应用管理" },
  { key: "/packages", icon: <GiftOutlined />, label: "充值包管理" },
  { key: "/orders", icon: <OrderedListOutlined />, label: "订单查询" },
  { key: "/usage-records", icon: <FileTextOutlined />, label: "使用记录" },
  { key: "/audit-logs", icon: <AuditOutlined />, label: "审计日志" },
];

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

function getWechatRedirectUri() {
  return WECHAT_REDIRECT_URI || window.location.origin + window.location.pathname;
}

const brandStyles = {
  siderLogo: {
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  } as React.CSSProperties,
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    objectFit: "cover" as const,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
    flexShrink: 0,
  } as React.CSSProperties,
  brandText: {
    color: adminThemeTokens.colorOnPrimary,
    fontWeight: 600,
    fontSize: 15,
    letterSpacing: 0,
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  header: {
    padding: "0 24px",
    background: adminThemeTokens.colorBgContainer,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid " + adminThemeTokens.colorBorder,
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
  } as React.CSSProperties,
  content: {
    margin: 20,
    padding: 24,
    background: adminThemeTokens.colorBgContainer,
    borderRadius: adminThemeTokens.borderRadiusCard,
    boxShadow: adminThemeTokens.shadowCard,
    overflow: "auto" as const,
  } as React.CSSProperties,
};

function App() {
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const oauthHandled = useRef(false);

  const handleOAuthCallback = useCallback(async (): Promise<boolean> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error") || params.get("error_description");

    if (oauthError) {
      message.error("微信登录失败: " + oauthError);
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      return false;
    }

    if (!code || !state) return false;

    const savedState = sessionStorage.getItem("wx_oauth_state");
    sessionStorage.removeItem("wx_oauth_state");

    if (state !== savedState) {
      message.error("微信登录失败：state 校验不通过，请重试");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      return false;
    }

    try {
      const typedAuth = auth as unknown as {
        grantProviderToken: (opts: { provider_id: string; provider_redirect_uri: string; provider_code: string }) => Promise<{ provider_token: string }>;
        signInWithProvider: (opts: { provider_id: string; provider_token: string }) => Promise<unknown>;
      };

      const tokenResult = await typedAuth.grantProviderToken({
        provider_id: WECHAT_PROVIDER_ID,
        provider_redirect_uri: getWechatRedirectUri(),
        provider_code: code,
      });

      await typedAuth.signInWithProvider({
        provider_id: WECHAT_PROVIDER_ID,
        provider_token: tokenResult.provider_token,
      });

      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      message.success("微信登录成功");
      return true;
    } catch (err: unknown) {
      message.error("微信登录失败: " + getErrorMessage(err, "换取凭证失败，请重试"));
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      return false;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const loginState = await auth.getLoginState();
      if (!loginState) {
        setAdminInfo(null);
        setLoading(false);
        return;
      }
      const res = await adminApi.getAdminMe();
      setAdminInfo(res.data as unknown as AdminInfo);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === "ADMIN_NOT_CONFIGURED") {
        try {
          await adminApi.bootstrapFirstWebAdmin();
          const res = await adminApi.getAdminMe();
          setAdminInfo(res.data as unknown as AdminInfo);
          message.success("已自动成为首位 Web 管理员");
          return;
        } catch {
          setForbidden(true);
        }
      } else if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
        setForbidden(true);
      }
      setAdminInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!oauthHandled.current) {
        oauthHandled.current = true;
        await handleOAuthCallback();
      }
      await checkAuth();
    };
    init();
  }, [checkAuth, handleOAuthCallback]);

  useEffect(() => {
    const handler = () => {
      setAdminInfo(null);
      setForbidden(true);
    };
    window.addEventListener("admin:unauthorized", handler);
    return () => window.removeEventListener("admin:unauthorized", handler);
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setAdminInfo(null);
    setForbidden(false);
    navigate("/login");
    message.success("已退出登录");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: adminThemeTokens.colorBgLayout }}>
        <Spin size="large" />
      </div>
    );
  }

  if (location.pathname === "/login" || !adminInfo) {
    if (forbidden) {
      return (
        <Result
          status="403"
          title="无权限"
          subTitle="当前账号不在管理员白名单中，请联系管理员配置 ADMIN_WEB_UIDS。"
          extra={<Button onClick={() => { setForbidden(false); navigate("/login"); }}>返回登录</Button>}
        />
      );
    }
    return <LoginPage onLoginSuccess={checkAuth} />;
  }

  const selectedKey = "/" + location.pathname.split("/")[1];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
      >
        <div style={brandStyles.siderLogo}>
          <img src={huliTechLogo} alt="huli-tech" style={brandStyles.brandMark} />
          {!collapsed && <span style={brandStyles.brandText}>huli-tools 管理端</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={brandStyles.header}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown
            menu={{
              items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: handleLogout }],
            }}
          >
            <Button type="text">
              <UserOutlined /> {adminInfo.adminUserId}
            </Button>
          </Dropdown>
        </Header>
        <Content style={brandStyles.content}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/usage-records" element={<UsageRecordsPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
