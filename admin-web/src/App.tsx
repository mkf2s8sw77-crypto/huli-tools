import { useState, useEffect, useCallback } from "react";
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

function App() {
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
        setForbidden(true);
      }
      setAdminInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" description="加载中..." />
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
        theme="dark"
        width={200}
      >
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: collapsed ? 14 : 16 }}>
          {collapsed ? "管理" : "沪里工具管理端"}
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
        <Header style={{ padding: "0 16px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0" }}>
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
        <Content style={{ margin: 16, padding: 16, background: "#fff", borderRadius: 8, overflow: "auto" }}>
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
