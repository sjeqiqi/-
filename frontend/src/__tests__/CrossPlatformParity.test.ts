import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { calculateRationLocal } from "../calculator";

import type { CalculateRequest } from "../types";

describe("Web/App 端与小程序端 (Python 后端) 产出结果一致性全量对齐测试", () => {
  const pyResultsPath = "C:/Users/qiqi/.gemini/antigravity/brain/f7433e5a-f6ee-466d-9fe6-930a2e3883d7/scratch/python_results.json";
  const pyData = JSON.parse(fs.readFileSync(pyResultsPath, "utf-8"));

  for (const [scenarioName, data] of Object.entries(pyData)) {
    const { request: pyReq, result: pyRes } = data as any;

    it(`场景 [${scenarioName}]: Web/App 本地计算引擎产出与小程序/云端完全对齐`, () => {
      const tsRes = calculateRationLocal(pyReq as CalculateRequest) as any;

      // 1. 求解器状态与合格判定
      expect(tsRes.status).toBe(pyRes.status);
      expect(tsRes.qualified).toBe(pyRes.qualified);

      // 2. 核心总计数据 (成本、干物质总量、饲喂原样总量) 100% 精确对齐 (浮点容差小于 0.001)
      expect(tsRes.totals.cost_rmb).toBeCloseTo(pyRes.totals.cost_rmb, 2);
      expect(tsRes.totals.dm_kg).toBeCloseTo(pyRes.totals.dm_kg, 2);
      expect(tsRes.totals.as_fed_kg).toBeCloseTo(pyRes.totals.as_fed_kg, 2);

      // 3. 营养供给量逐项对齐
      expect(tsRes.nutrients.dmi_kg).toBeCloseTo(pyRes.nutrients.dmi_kg, 2);
      expect(tsRes.nutrients.me_mj).toBeCloseTo(pyRes.nutrients.me_mj, 1);
      expect(tsRes.nutrients.cp_pct_dm).toBeCloseTo(pyRes.nutrients.cp_pct_dm, 1);
      expect(tsRes.nutrients.ndf_pct_dm).toBeCloseTo(pyRes.nutrients.ndf_pct_dm, 1);
      expect(tsRes.nutrients.ca_pct_dm).toBeCloseTo(pyRes.nutrients.ca_pct_dm, 2);
      expect(tsRes.nutrients.p_pct_dm).toBeCloseTo(pyRes.nutrients.p_pct_dm, 2);
      expect(tsRes.nutrients.forage_pct_dm).toBeCloseTo(pyRes.nutrients.forage_pct_dm, 1);

      // 4. 原料饲喂配料表逐项对齐 (各原料公斤数精确到 0.01kg 步长)
      expect(tsRes.feed_rows.length).toBe(pyRes.feed_rows.length);

      for (const pyRow of pyRes.feed_rows) {
        const tsRow = tsRes.feed_rows.find((r: any) => r.feed_id === pyRow.feed_id);
        expect(tsRow).toBeDefined();
        // 原样饲喂量对齐
        expect(tsRow.as_fed_kg).toBeCloseTo(pyRow.as_fed_kg, 2);
        // 干物质量对齐
        expect(tsRow.dm_kg).toBeCloseTo(pyRow.dm_kg, 2);
        // 单项原料成本对齐
        expect(tsRow.cost_rmb).toBeCloseTo(pyRow.cost_rmb, 2);
      }

      // 5. 羊只生理需要量模型对齐
      expect(tsRes.requirements.dmi_target_kg).toBeCloseTo(pyRes.requirements.dmi_target_kg, 2);
      expect(tsRes.requirements.me_requirement_mj).toBeCloseTo(pyRes.requirements.me_requirement_mj, 1);
      expect(tsRes.requirements.cp_min_pct).toBeCloseTo(pyRes.requirements.cp_min_pct, 1);
    });
  }
});
