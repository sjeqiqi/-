import { describe, expect, it } from "vitest";
import {
  calculateRationLocal,
  getRegionalFeedsCatalog,
} from "../calculator";
import type { CalculateRequest } from "../types";

describe("主产区行情与营养数据库联动测试 (Regional Feeds & Pricing Tests)", () => {
  it("4 大主产区的原料采购价格具有明确显著的地域特性", () => {
    const gz = getRegionalFeedsCatalog("guanzhong");
    const nm = getRegionalFeedsCatalog("neimenggu");
    const sd = getRegionalFeedsCatalog("shandong");
    const hh = getRegionalFeedsCatalog("henan_hebei");

    const getPrice = (cat: typeof gz, id: string) =>
      cat.feeds.find((f) => f.feed_id === id)?.default_price_rmb_per_kg;

    // 1. 优质粗饲料（内蒙古草场优势：苜蓿、羊草全国最低）
    const alfalfaNm = getPrice(nm, "alfalfa_hay")!;
    const alfalfaGz = getPrice(gz, "alfalfa_hay")!;
    const alfalfaSd = getPrice(sd, "alfalfa_hay")!;
    expect(alfalfaNm).toBe(1.80);
    expect(alfalfaGz).toBe(2.10);
    expect(alfalfaSd).toBe(2.25);
    expect(alfalfaNm).toBeLessThan(alfalfaGz);
    expect(alfalfaNm).toBeLessThan(alfalfaSd);

    const sheepGrassNm = getPrice(nm, "sheep_grass")!;
    const sheepGrassGz = getPrice(gz, "sheep_grass")!;
    expect(sheepGrassNm).toBe(1.25);
    expect(sheepGrassGz).toBe(1.60);
    expect(sheepGrassNm).toBeLessThan(sheepGrassGz);

    // 2. 农副产物粗料（山东产区花生秧全国最低）
    const peanutVineSd = getPrice(sd, "peanut_vine")!;
    const peanutVineNm = getPrice(nm, "peanut_vine")!;
    const peanutVineGz = getPrice(gz, "peanut_vine")!;
    expect(peanutVineSd).toBe(0.78);
    expect(peanutVineGz).toBe(0.95);
    expect(peanutVineNm).toBe(1.10);
    expect(peanutVineSd).toBeLessThan(peanutVineGz);
    expect(peanutVineSd).toBeLessThan(peanutVineNm);

    // 3. 沿海港口集聚大宗精料（山东玉米、豆粕低价优势）
    const cornSd = getPrice(sd, "corn")!;
    const cornNm = getPrice(nm, "corn")!;
    expect(cornSd).toBe(2.28);
    expect(cornNm).toBe(2.45);
    expect(cornSd).toBeLessThan(cornNm);

    const soySd = getPrice(sd, "soybean_meal")!;
    const soyNm = getPrice(nm, "soybean_meal")!;
    expect(soySd).toBe(3.48);
    expect(soyNm).toBe(3.70);
    expect(soySd).toBeLessThan(soyNm);

    // 4. 大宗农区（河南/河北玉米青贮最低）
    const silageHh = getPrice(hh, "corn_silage")!;
    const silageNm = getPrice(nm, "corn_silage")!;
    expect(silageHh).toBe(0.38);
    expect(silageNm).toBe(0.45);
    expect(silageHh).toBeLessThan(silageNm);
  });

  it("选不同主产区计算出的日粮成本与配比存在真实差异", () => {
    const regions = ["guanzhong", "neimenggu", "shandong", "henan_hebei"] as const;
    const results: Record<string, any> = {};

    for (const rid of regions) {
      const cat = getRegionalFeedsCatalog(rid);
      const req: CalculateRequest = {
        animal: {
          class: "lactating",
          body_weight_kg: 50,
          milk_kg: 2.5,
          milk_fat_percent: 4.0,
        },
        feeds: cat.feeds.map((f) => ({
          feed_id: f.feed_id,
          owned: true,
          price_rmb_per_kg: f.default_price_rmb_per_kg,
          override: null,
        })),
      };

      const res = calculateRationLocal(req) as any;
      expect(res.status).toBe("feasible");
      expect(res.qualified).toBe(true);
      results[rid] = res;
    }

    const costGz = results.guanzhong.totals.cost_rmb;
    const costNm = results.neimenggu.totals.cost_rmb;
    const costSd = results.shandong.totals.cost_rmb;
    const costHh = results.henan_hebei.totals.cost_rmb;

    // 所有产区成本均在合理健康的 2.0 - 6.0 元/天之间
    expect(costGz).toBeGreaterThan(2.0);
    expect(costGz).toBeLessThan(6.0);
    expect(costNm).toBeGreaterThan(2.0);
    expect(costNm).toBeLessThan(6.0);
    expect(costSd).toBeGreaterThan(2.0);
    expect(costSd).toBeLessThan(6.0);
    expect(costHh).toBeGreaterThan(2.0);
    expect(costHh).toBeLessThan(6.0);

    // 验证各产区的日粮成本不是完全相同的固定数字
    expect(Math.abs(costSd - costNm)).toBeGreaterThan(0.05);
    expect(Math.abs(costGz - costSd)).toBeGreaterThan(0.03);
  });

  it("未知产区 ID 自动安全回退至默认关中产区", () => {
    const fallback = getRegionalFeedsCatalog("unknown_region_999");
    const gz = getRegionalFeedsCatalog("guanzhong");

    expect(fallback.feeds.length).toBe(gz.feeds.length);
    expect(fallback.feeds[0].default_price_rmb_per_kg).toBe(gz.feeds[0].default_price_rmb_per_kg);
  });
});
