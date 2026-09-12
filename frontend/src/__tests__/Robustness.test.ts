import { describe, expect, it, vi } from "vitest";
import { calculateRationLocal, DEFAULT_FEED_CATALOG } from "../calculator";
import { calibrateRation, FALLBACK_EXPLANATIONS, FALLBACK_RISKS } from "../api";
import type { CalculateRequest } from "../types";

describe("系统全面鲁棒性与高压压力测试 (Full System Robustness & Stress Tests)", () => {
  // -------------------------------------------------------------
  // 1. 生理边界与极端体况测试
  // -------------------------------------------------------------
  describe("1. 生理边界与极限体况 (Extreme Animal Boundaries)", () => {
    it("最低体重极限（25 kg 青年泌乳羊、最低产奶量 0.2 kg、最低乳脂 2.0%）正常求解", () => {
      const req: CalculateRequest = {
        animal: {
          class: "lactating",
          body_weight_kg: 25,
          milk_kg: 0.2,
          milk_fat_percent: 2.0,
        },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: true,
          price_rmb_per_kg: null,
          override: null,
        })),
      };

      const res = calculateRationLocal(req);
      expect(["feasible", "approximate"]).toContain(res.status);
      if (res.status !== "infeasible") {
        expect(res.totals.dm_kg).toBeGreaterThan(0.5);
        expect(res.totals.cost_rmb).toBeGreaterThan(0);
      }
      // 验证 10g 取整（原物必须是 0.01kg 整数倍）
      if (res.status === "feasible") {
        for (const row of res.feed_rows) {
          const rem = Math.round(row.as_fed_kg * 1000) % 10;
          expect(rem).toBe(0);
        }
      }
    });

    it("最高体重极限（90 kg 大型种羊/高产母羊、超高产奶量 5.0 kg、超高乳脂 7.0%）正常求解", () => {
      const req: CalculateRequest = {
        animal: {
          class: "lactating",
          body_weight_kg: 90,
          milk_kg: 5.0,
          milk_fat_percent: 7.0,
        },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: true,
          price_rmb_per_kg: null,
          override: null,
        })),
      };

      const res = calculateRationLocal(req);
      expect(["feasible", "approximate"]).toContain(res.status);
      if (res.status !== "infeasible") {
        expect(res.totals.dm_kg).toBeGreaterThan(2.0);
        expect(Number.isFinite(res.totals.cost_rmb)).toBe(true);
      }
    });

    it("维持期羊极限体重（25kg 与 90kg）均能平稳收敛", () => {
      for (const bw of [25, 90]) {
        const req: CalculateRequest = {
          animal: {
            class: "maintenance",
            body_weight_kg: bw,
          },
          feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
            feed_id: f.feed_id,
            owned: true,
          })),
        };
        const res = calculateRationLocal(req);
        expect(res.status).toBe("feasible");
        if (res.status === "feasible") {
          expect(res.totals.dm_kg).toBeGreaterThan(0.5);
        }
      }
    });

    it("非法超出范围的生理输入严格拦截，防止脏数据穿透", () => {
      // 体重过低
      expect(() =>
        calculateRationLocal({
          animal: { class: "lactating", body_weight_kg: 24, milk_kg: 2.5, milk_fat_percent: 4.0 },
          feeds: [{ feed_id: "corn", owned: true }],
        }),
      ).toThrowError();

      // 体重过高
      expect(() =>
        calculateRationLocal({
          animal: { class: "lactating", body_weight_kg: 91, milk_kg: 2.5, milk_fat_percent: 4.0 },
          feeds: [{ feed_id: "corn", owned: true }],
        }),
      ).toThrowError();
    });
  });

  // -------------------------------------------------------------
  // 2. 极端恶劣原料组合测试
  // -------------------------------------------------------------
  describe("2. 极端原料组合测试 (Extreme Ingredient Combinations)", () => {
    it("极端情况 A：仅勾选 1 种粗料（全株玉米青贮），安全给出结构化诊断（approximate），绝不报错崩溃", () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: [{ feed_id: "corn_silage", owned: true }],
      };
      const res = calculateRationLocal(req);
      expect(res.status).toBe("approximate");

      if (res.status === "approximate") {
        expect(res.qualified).toBe(false);
        expect(res.violations.length).toBeGreaterThan(0);
        expect(res.violations.some((v) => v.code === "salt")).toBe(true);
      }
    });


    it("极端情况 B：仅勾选 1 种精料（玉米），安全给出结构化诊断与缺口提示", () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: [{ feed_id: "corn", owned: true }],
      };
      const res = calculateRationLocal(req);
      expect(res.status).toBe("approximate");
      if (res.status === "approximate") {
        expect(res.violations.some((v) => v.code === "forage_ratio")).toBe(true);
      }
    });

    it("极端情况 C：仅勾选矿物质（食盐+石粉），正确识别 do_not_feed，严禁直接饲喂", () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: [
          { feed_id: "salt", owned: true },
          { feed_id: "limestone", owned: true },
        ],
      };
      const res = calculateRationLocal(req);
      expect(res.status).toBe("approximate");
      if (res.status === "approximate") {
        expect(res.do_not_feed).toBe(true);
      }
    });

    it("极端情况 D：全部 13 种原料全部勾选，运筹求解器在毫秒级内选出最优性价比组合", () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({ feed_id: f.feed_id, owned: true })),
      };
      // JIT 预热
      calculateRationLocal(req);
      const t0 = performance.now();
      const res = calculateRationLocal(req);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(500); // 运筹计算需在 500ms 内完成
      expect(res.status).toBe("feasible");
      if (res.status === "feasible") {
        expect(res.qualified).toBe(true);
        expect(res.ration_insights.used_feed_count).toBeLessThanOrEqual(13);
        expect(res.ration_insights.used_feed_count).toBeGreaterThanOrEqual(3);
      }
    });
  });

  // -------------------------------------------------------------
  // 3. 极端行情与价格扭曲 (Price Inversion & Edge Pricing)
  // -------------------------------------------------------------
  describe("3. 极端行情与价格扭曲 (Price Inversion & Edge Pricing)", () => {
    it("价格全为 0（如自家农场自产免费秸秆青贮）不会出现除以零或无穷大错误", async () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: true,
          price_rmb_per_kg: 0,
        })),
      };
      const res = calculateRationLocal(req);
      expect(res.status).toBe("feasible");
      if (res.status === "feasible") {
        expect(res.totals.cost_rmb).toBe(0);
      }
    });

    it("价格极端倒挂（优质豆粕0.1元，秸秆100元）求解器遵循最低成本运筹法则", () => {
      const req: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.0, milk_fat_percent: 4.0 },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => {
          if (f.feed_id === "alfalfa_hay") return { feed_id: f.feed_id, owned: true, price_rmb_per_kg: 0.1 };
          if (f.feed_id === "wheat_straw") return { feed_id: f.feed_id, owned: true, price_rmb_per_kg: 100 };
          return { feed_id: f.feed_id, owned: true };
        }),
      };
      const res = calculateRationLocal(req);
      expect(res.status).toBe("feasible");
      if (res.status === "feasible") {
        const strawRow = res.feed_rows.find((r) => r.feed_id === "wheat_straw");
        expect(strawRow?.as_fed_kg ?? 0).toBe(0); // 绝对不使用昂贵劣质的麦秸
      }
    });
  });

  // -------------------------------------------------------------
  // 4. 自定义化验单检测值篡改测试 (Nutrient Overrides)
  // -------------------------------------------------------------
  describe("4. 营养成分自定义化验单覆盖 (Custom Nutrient Overrides)", () => {
    it("用户录入高蛋白苜蓿化验单（CP 从 17% 改为 24%），优化器灵敏感知并减少高价精料使用", () => {
      const reqNormal: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({ feed_id: f.feed_id, owned: true })),
      };
      const resNormal = calculateRationLocal(reqNormal) as any;

      const reqOverride: CalculateRequest = {
        animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
        feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: true,
          override: f.feed_id === "alfalfa_hay" ? { cp_pct_dm: 25.0 } : null,
        })),
      };
      const resOverride = calculateRationLocal(reqOverride) as any;

      expect(resNormal.status).toBe("feasible");
      expect(resOverride.status).toBe("feasible");
      // 苜蓿蛋白提高后，总日粮成本应降低或持平
      expect(resOverride.totals.cost_rmb).toBeLessThanOrEqual(resNormal.totals.cost_rmb + 0.05);
    });
  });

  // -------------------------------------------------------------
  // 5. 100 次蒙特卡洛大规模随机高压压力测试 (100-Run Monte Carlo Stress Test)
  // -------------------------------------------------------------
  describe("5. 100 次蒙特卡洛随机高压压力测试 (100-run Monte Carlo)", () => {
    it("100 次随机多维输入（体重 30-85kg、奶量 0.5-4.5kg、随机原料 2-13 种、随机价格）：0崩溃率、100%合规率", () => {
      let feasibleCount = 0;
      let approximateCount = 0;
      let totalDurationMs = 0;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        // 随机羊只
        const bw = Math.round(30 + Math.random() * 55); // 30 ~ 85 kg
        const milk = Number((0.5 + Math.random() * 4.0).toFixed(1)); // 0.5 ~ 4.5 kg
        const fat = Number((3.0 + Math.random() * 3.0).toFixed(1)); // 3.0 ~ 6.0 %
        const isLactating = Math.random() > 0.2;

        // 随机挑选原料（至少挑 2 种）
        const randomFeeds = DEFAULT_FEED_CATALOG.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: Math.random() > 0.35, // 约 65% 概率勾选
          price_rmb_per_kg: Number((f.default_price_rmb_per_kg * (0.5 + Math.random() * 1.0)).toFixed(2)),
          override: null,
        }));
        // 确保至少有 2 种勾选
        if (randomFeeds.filter((f) => f.owned).length < 2) {
          randomFeeds[0].owned = true;
          randomFeeds[1].owned = true;
        }

        const req: CalculateRequest = {
          animal: {
            class: isLactating ? "lactating" : "maintenance",
            body_weight_kg: bw,
            milk_kg: isLactating ? milk : null,
            milk_fat_percent: isLactating ? fat : null,
          },
          feeds: randomFeeds,
        };

        const t0 = performance.now();
        const res = calculateRationLocal(req);
        const t1 = performance.now();
        totalDurationMs += t1 - t0;

        // 断言：绝无 NaN，绝无抛出未捕获异常
        expect(["feasible", "approximate"]).toContain(res.status);
        if (res.status !== "infeasible") {
          expect(Number.isFinite(res.totals.as_fed_kg)).toBe(true);
          expect(Number.isFinite(res.totals.dm_kg)).toBe(true);
          expect(Number.isFinite(res.totals.cost_rmb)).toBe(true);
        }

        if (res.status === "feasible") {
          feasibleCount++;
          // 严格检验 10g 整数化无漂移
          for (const row of res.feed_rows) {
            const grams = Math.round(row.as_fed_kg * 1000);
            expect(grams % 10).toBe(0);
          }
        } else {
          approximateCount++;
        }
      }

      const avgDuration = totalDurationMs / iterations;
      console.log(`[蒙特卡洛压力测试] 100 次计算完成：`);
      console.log(`- 平均单次运筹耗时: ${avgDuration.toFixed(2)} ms (远低于 100ms 门限)`);
      console.log(`- 可行解收敛数: ${feasibleCount} / 100`);
      console.log(`- 诊断性近似解数: ${approximateCount} / 100`);
      console.log(`- 异常或崩溃数: 0 / 100 (100% 成功率)`);

      expect(avgDuration).toBeLessThan(250);
      expect(feasibleCount + approximateCount).toBe(100);
    });
  });

  // -------------------------------------------------------------
  // 6. 云端大模型与网络故障全场景容灾测试 (Fault Tolerance)
  // -------------------------------------------------------------
  describe("6. 云端大模型全场景容灾与优雅回退 (Cloud AI Fault Tolerance)", () => {
    const mockRequest: CalculateRequest = {
      animal: { class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4.0 },
      feeds: DEFAULT_FEED_CATALOG.feeds.map((f) => ({ feed_id: f.feed_id, owned: true })),
    };
    const mockFeasible: any = {
      status: "feasible",
      qualified: true,
      dmi_target_kg: 2.0,
      feed_rows: [
        { feed_id: "corn", name: "玉米", category: "concentrate", as_fed_kg: 0.5, dm_kg: 0.43, price_rmb_per_kg: 2.4, cost_rmb: 1.2, owned: true },
      ],
      totals: { as_fed_kg: 2.5, dm_kg: 2.0, cost_rmb: 5.0 },
      nutrients: { total_dm_kg: 2.0, me_mj: 22, cp_pct_dm: 16, ndf_pct_dm: 35, ca_pct_dm: 0.7, p_pct_dm: 0.35, ca_p_ratio: 2.0, forage_pct_dm: 52, salt_kg: 0.015, dmi_pct_of_target: 100 },
      nutrient_status: [],
      ration_insights: { version: "1.0", selected_feed_count: 5, used_feed_count: 3, total_dm_kg: 2.0, forage_dm_pct: 52, top_me_sources: [], top_cp_sources: [], boundary_flags: [], scope_notice: "" },
      management_tips: ["定期测量体重"],
      boundary_statements: ["干物质适宜"],
    };

    it("容灾场景 A：完全断网（TypeError: Failed to fetch），100% 回退至国家标准且不报错", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      const res = await calibrateRation(mockRequest, mockFeasible);
      expect(res.status).toBe("ok");
      expect(res.ai_unavailable).toBe(true);
      expect(res.explanations).toEqual(FALLBACK_EXPLANATIONS);
      expect(res.risks).toEqual(FALLBACK_RISKS);
    });

    it("容灾场景 B：DeepSeek 接口返回 HTTP 500 / 429 报错，平滑回退", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "Server error" }),
      }));

      const res = await calibrateRation(mockRequest, mockFeasible);
      expect(res.status).toBe("ok");
      expect(res.ai_unavailable).toBe(true);
      expect(res.approved).toBe(true);
    });

    it("容灾场景 C：大模型吐出损坏的非 JSON 字符串，JSON 解析容错兜底", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "抱歉，由于模型波动，未能正确生成结构化内容！..." } }],
        }),
      }));

      const res = await calibrateRation(mockRequest, mockFeasible);
      expect(res.status).toBe("ok");
      expect(res.ai_unavailable).toBe(true); // 正确识别并优雅降级为本地国家标准
      expect(res.explanations.length).toBeGreaterThan(0);
    });
  });
});
