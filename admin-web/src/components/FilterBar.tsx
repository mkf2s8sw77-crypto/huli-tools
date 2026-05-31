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
    <Space style={{ marginBottom: 16 }} wrap>
      <Input
        placeholder={placeholder || "搜索"}
        value={keyword}
        onChange={(e) => onChange(e.target.value)}
        onPressEnter={onSearch}
        style={{ width: 300 }}
        allowClear
      />
      <Button icon={<SearchOutlined />} type="primary" onClick={onSearch}>
        搜索
      </Button>
      {extra}
    </Space>
  );
}
