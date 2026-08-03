import { Input, Button, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

interface Props {
  keyword: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder?: string;
  extra?: ReactNode;
}

export default function FilterBar({ keyword, onChange, onSearch, placeholder, extra }: Props) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
      padding: "12px 16px",
      background: "var(--adm-surface)",
      borderRadius: 10,
      flexWrap: "wrap",
    }}>
      <Input
        placeholder={placeholder || "搜索"}
        value={keyword}
        onChange={(e) => onChange(e.target.value)}
        onPressEnter={onSearch}
        style={{ width: 300, maxWidth: "100%", borderRadius: 8 }}
        allowClear
      />
      <Button icon={<SearchOutlined />} type="primary" onClick={onSearch} style={{ borderRadius: 8 }}>
        搜索
      </Button>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}
