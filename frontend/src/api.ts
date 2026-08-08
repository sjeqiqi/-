// 后端 API 客户端：相对 /api 路径，开发环境由 Vite 代理到 127.0.0.1:8000
import type { CalibrateResult, CalculateRequest, FeedCatalogResponse, RationResult } from "./types";

export const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const body = await res.json();
      if (body?.detail?.message) message = body.detail.message;
      else if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // 保留默认错误信息
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function fetchFeeds(): Promise<FeedCatalogResponse> {
  return request<FeedCatalogResponse>("/api/feeds");
}

export function calculateRation(req: CalculateRequest): Promise<RationResult> {
  return request<RationResult>("/api/rations/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export function calibrateRation(req: CalculateRequest): Promise<CalibrateResult> {
  return request<CalibrateResult>("/api/rations/calibrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}
