import { useEffect, useState } from "react";
import { HashRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { getThemeConfig } from "./theme";
import App from "./App";

function useSystemDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return isDark;
}

// 跟随系统亮色/暗色偏好切换 antd 主题（prefers-color-scheme）。
export default function Root() {
  const isDark = useSystemDark();
  return (
    <ConfigProvider locale={zhCN} theme={getThemeConfig(isDark)}>
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  );
}
