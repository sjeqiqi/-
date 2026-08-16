// 后端 API 客户端：相对 /api 路径，开发环境由 Vite 代理到 127.0.0.1:8000
import type { CalibrateResult, CalculateRequest, FeedCatalogResponse, RationResult } from "./types";

export const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error("暂时无法连接计算服务，请检查网络后再试");
  }
  if (!res.ok) {
    let message = "这次没有计算成功，请稍后再试";
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
