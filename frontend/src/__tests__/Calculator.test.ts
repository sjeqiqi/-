import { describe, expect, it } from "vitest";
import { calculateRationLocal, DEFAULT_FEED_CATALOG } from "../calculator";
import type { CalculateRequest } from "../types";

describe("本地日粮优化引擎单元测试 (Local Calculator Engine)", () => {
  it("标准泌乳奶山羊（50kg、2.5kg奶、4%乳脂）全原料求解可行配方", () => {
    const req: CalculateRequest = {
      animal: {
        class: "lactating",
        body_weight_kg: 50,
        milk_kg: 2.5,
        milk_fat_percent: 4.0,
      },
      feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
        feed_id: f.feed_id,
        owned: true,
        price_rmb_per_kg: null,
        override: null,
      })),
    };

    const start = performance.now();
    const result = calculateRationLocal(req);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // 必须在 100ms 内完成，通常只需 2-5ms
    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result.qualified).toBe(true);
      expect(result.totals.cost_rmb).toBeGreaterThan(0);
      expect(result.totals.dm_kg).toBeGreaterThan(1.8);
      expect(result.totals.dm_kg).toBeLessThan(2.2);
      expect(result.feed_rows.length).toBeGreaterThan(0);
      // 验证包含食盐且为 0.01 kg 步长
      const saltRow = result.feed_rows.find((r) => r.feed_id === "salt");
      expect(saltRow).toBeDefined();
      expect(saltRow?.as_fed_kg).toBe(0.01);
      // 验证贴边分析存在
      expect(result.ration_insights).toBeDefined();
      expect(result.ration_insights.top_me_sources.length).toBeGreaterThan(0);
      expect(result.ration_insights.top_cp_sources.length).toBeGreaterThan(0);
    }
  });

  it("维持期奶山羊（50kg）求解可行配方", () => {
    const req: CalculateRequest = {
      animal: {
        class: "maintenance",
        body_weight_kg: 50,
      },
      feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
        feed_id: f.feed_id,
        owned: true,
        price_rmb_per_kg: null,
        override: null,
      })),
    };

    const result = calculateRationLocal(req);
    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result.qualified).toBe(true);
      expect(result.totals.dm_kg).toBeGreaterThan(1.0);
      expect(result.totals.dm_kg).toBeLessThan(1.5);
    }
  });

  it("仅勾选矿物质时返回诊断用近似解（approximate）且标记 do_not_feed", () => {
    const req: CalculateRequest = {
      animal: {
        class: "lactating",
        body_weight_kg: 50,
        milk_kg: 2.5,
        milk_fat_percent: 4.0,
      },
      feeds: [
        { feed_id: "salt", owned: true, price_rmb_per_kg: null, override: null },
        { feed_id: "limestone", owned: true, price_rmb_per_kg: null, override: null },
      ],
    };

    const result = calculateRationLocal(req);
    expect(result.status).toBe("approximate");
    if (result.status === "approximate") {
      expect(result.qualified).toBe(false);
      expect(result.do_not_feed).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it("输入体重超出范围时抛出清晰的校验异常", () => {
    const req: CalculateRequest = {
      animal: {
        class: "lactating",
        body_weight_kg: 15, // 低于 25kg
        milk_kg: 2.5,
        milk_fat_percent: 4.0,
      },
      feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
        feed_id: f.feed_id,
        owned: true,
      })),
    };

    expect(() => calculateRationLocal(req)).toThrowError(/体重需在/);
  });
});
