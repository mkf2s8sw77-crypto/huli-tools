import { Alert } from "antd";

interface Props {
  message?: string;
  description: string;
}

export default function ErrorState({ message: msg, description }: Props) {
  return <Alert message={msg || "加载失败"} description={description} type="error" showIcon />;
}
