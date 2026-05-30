import { app } from "./cloudbase";

const ADMIN_FUNCTION = import.meta.env.VITE_CLOUDBASE_ADMIN_FUNCTION || "adminCore";

export interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
  requestId?: string;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

async function callAdmin<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<ApiResponse<T>> {
  const res = await app.callFunction({
    name: ADMIN_FUNCTION,
    data: { action, ...params },
  });
  const result = (res as { result: ApiResponse<T> }).result;
  if (!result.ok) {
    const code = result.error?.code || "UNKNOWN";
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      window.dispatchEvent(new CustomEvent("admin:unauthorized", { detail: result.error }));
    }
    throw new AdminApiError(code, result.error?.message || "请求失败", result.requestId);
  }
  return result;
}

export class AdminApiError extends Error {
  code: string;
  requestId?: string;
  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

export const adminApi = {
  getAdminMe: () => callAdmin("getAdminMe"),
  dashboardSummary: () => callAdmin("dashboardSummary"),
  bootstrapFirstWebAdmin: () => callAdmin("bootstrapFirstWebAdmin"),

  listUsers: (params: { page?: number; pageSize?: number; keyword?: string } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listUsers", params),

  getUserDetail: (userId: string) =>
    callAdmin("getUserDetail", { userId }),

  adjustPoints: (params: { targetUserId: string; deltaPoints: number; note?: string; idempotencyKey?: string }) =>
    callAdmin("adjustPoints", params),

  listPointTransactions: (params: { page?: number; pageSize?: number; userId?: string; type?: string; startAt?: string; endAt?: string } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listPointTransactions", params),

  listOrders: (params: { page?: number; pageSize?: number; userId?: string; orderNo?: string; status?: string; startAt?: string; endAt?: string } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listOrders", params),

  listUsageRecords: (params: { page?: number; pageSize?: number; userId?: string; appKey?: string; status?: string; startAt?: string; endAt?: string } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listUsageRecords", params),

  listApps: (params: { page?: number; pageSize?: number } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listApps", params),

  upsertApp: (params: Record<string, unknown>) =>
    callAdmin("upsertApp", params),

  listPackages: (params: { page?: number; pageSize?: number } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listPackages", params),

  upsertPackage: (params: Record<string, unknown>) =>
    callAdmin("upsertPackage", params),

  listAuditLogs: (params: { page?: number; pageSize?: number; adminUserId?: string; actionFilter?: string; startAt?: string; endAt?: string } = {}) =>
    callAdmin<PaginatedData<Record<string, unknown>>>("listAuditLogs", params),
};
