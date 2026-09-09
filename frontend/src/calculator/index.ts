// 本地化日粮计算主引擎入口
import type {
  ApproximateRation,
  CalculateRequest,
  FeasibleRation,
  InfeasibleRation,
  RationResult,
} from "../types";
import { DEFAULT_FEED_CATALOG, getBuiltinFeedsMap, type CalculatorFeedSpec } from "./feedsCatalog";
import { buildRationInsights } from "./insights";
import { computeRequirements, type Requirements } from "./nutrition";
import {
  bestEffortAmounts,
  buildAndSolve,
  buildFeedRows,
  buildNutrientStatus,
  diagnoseInfeasibility,
  evaluateRation,
  roundAndRepair,
} from "./optimizer";
import * as spec from "./spec";

export const MANAGEMENT_TIPS = [
  "建议将精料和粗料充分混合（TMR 方式）后分次饲喂，有助于维持瘤胃 pH 值稳定、预防酸中毒。",
  "实际使用前，优先录入本批次原料的检测值后重新计算。",
  "更换原料或调整日粮时应逐步过渡，避免突然更换；具体过渡周期和饲喂频次应结合养殖条件及专业人员建议确定。",
  "请持续观察采食、反刍、体况及泌乳表现，出现明显异常时应由兽医或动物营养专业人员评估。",
  "本结果为当前输入条件和已选原料下的最低成本数学解。若实际采食、原料检测值、价格或羊只生产状态发生变化，请更新对应输入后重新计算，不建议直接人工修改各原料克数。",
];

export const BOUNDARY_STATEMENTS = [
  "当前原料营养参数若使用默认值，则属于估算数据；实际原料批次差异可能使贴近约束边界的指标发生变化。有检测值时应优先录入检测值重新计算。",
  "本结果不是疾病诊断或治疗建议，也不承诺提高产奶量。",
];

export function validateAnimalInput(animal: CalculateRequest["animal"]): Requirements {
  if (animal.body_weight_kg < spec.WEIGHT_MIN_KG || animal.body_weight_kg > spec.WEIGHT_MAX_KG) {
    throw new Error(
      `体重需在 ${spec.WEIGHT_MIN_KG.toFixed(0)}–${spec.WEIGHT_MAX_KG.toFixed(0)} kg 之间，当前 ${animal.body_weight_kg} kg；超出首版适用范围，请由营养师或兽医复核。`,
    );
  }

  if (animal.class === "maintenance") {
    if (animal.milk_kg != null || animal.milk_fat_percent != null) {
      throw new Error("维持期（非泌乳）羊不需要也不应填写产奶量与乳脂率。");
    }
    return computeRequirements("maintenance", animal.body_weight_kg);
  }

  const milk = animal.milk_kg;
  if (milk == null) {
    throw new Error("泌乳期必须填写日产奶量（kg/d）。");
  }
  if (milk < spec.MILK_MIN_KG || milk > spec.MILK_MAX_KG) {
    throw new Error(
      `日产奶量需在 ${spec.MILK_MIN_KG.toFixed(1)}–${spec.MILK_MAX_KG.toFixed(1)} kg/d 之间，当前 ${milk} kg/d；超出首版适用范围，请由营养师或兽医复核。`,
    );
  }

  const fat = animal.milk_fat_percent ?? spec.FAT_DEFAULT_PCT;
  if (fat < spec.FAT_MIN_PCT || fat > spec.FAT_MAX_PCT) {
    throw new Error(
      `乳脂率需在 ${spec.FAT_MIN_PCT.toFixed(1)}–${spec.FAT_MAX_PCT.toFixed(1)}% 之间，当前 ${fat}%；超出首版适用范围，请由营养师或兽医复核。`,
    );
  }

  return computeRequirements("lactating", animal.body_weight_kg, milk, fat);
}

export function prepareEffectiveFeeds(
  reqFeeds: CalculateRequest["feeds"],
): [Record<string, CalculatorFeedSpec>, string[]] {
  const builtin = getBuiltinFeedsMap();
  const effective: Record<string, CalculatorFeedSpec> = { ...builtin };
  const seen = new Set<string>();
  const owned: string[] = [];

  for (const item of reqFeeds) {
    if (!(item.feed_id in builtin)) {
      throw new Error(`未知原料 id：${item.feed_id}。`);
    }
    if (seen.has(item.feed_id)) {
      throw new Error(`原料 ${item.feed_id} 在请求中重复出现。`);
    }
    seen.add(item.feed_id);

    const baseFeed = builtin[item.feed_id];
    let price = baseFeed.default_price_rmb_per_kg;
    if (item.price_rmb_per_kg != null) {
      if (!Number.isFinite(item.price_rmb_per_kg) || item.price_rmb_per_kg < 0) {
        throw new Error(`原料 ${baseFeed.name} 的价格必须是有限的非负数。`);
      }
      price = item.price_rmb_per_kg;
    }

    const merged = { ...baseFeed, default_price_rmb_per_kg: price };
    if (item.override) {
      const ov = item.override;
      if (ov.dm_pct != null) {
        if (ov.dm_pct <= 0 || ov.dm_pct > 100) {
          throw new Error(`干物质（DM）需在 (0, 100]% 之间，当前 ${ov.dm_pct}%。`);
        }
        merged.dm_pct = ov.dm_pct;
        merged.dm_fraction = ov.dm_pct / 100.0;
      }
      if (ov.me_mj_per_kg_dm != null) merged.me_mj_per_kg_dm = ov.me_mj_per_kg_dm;
      if (ov.cp_pct_dm != null) merged.cp_pct_dm = ov.cp_pct_dm;
      if (ov.ndf_pct_dm != null) merged.ndf_pct_dm = ov.ndf_pct_dm;
      if (ov.ca_pct_dm != null) merged.ca_pct_dm = ov.ca_pct_dm;
      if (ov.p_pct_dm != null) merged.p_pct_dm = ov.p_pct_dm;
      merged.overridden = true;
    }

    effective[item.feed_id] = merged;
    if (item.owned) {
      owned.push(item.feed_id);
    }
  }

  if (owned.length === 0) {
    throw new Error("请至少勾选一种允许用于本次配方的原料。");
  }

  return [effective, owned];
}

export function calculateRationLocal(request: CalculateRequest): RationResult {
  const req = validateAnimalInput(request.animal);
  const [effectiveFeeds, ownedIds] = prepareEffectiveFeeds(request.feeds);
  const selectedSet = new Set(ownedIds);
  const candidate = ownedIds.map((id) => effectiveFeeds[id]).filter(Boolean);

  // 第一层求解：严格单纯形法
  const outcome = buildAndSolve(candidate, req, new Set());
  if (outcome.feasible) {
    const [amounts, ev] = roundAndRepair(effectiveFeeds, outcome.x_dm, req, selectedSet);
    if (ev.violations.length === 0) {
      const feedRows = buildFeedRows(effectiveFeeds, amounts, selectedSet);
      const nutrientStatus = buildNutrientStatus(effectiveFeeds, amounts, req, ev);
      const rationInsights = buildRationInsights(
        effectiveFeeds,
        feedRows,
        nutrientStatus,
        req,
        ownedIds,
      );

      const feasibleResult: FeasibleRation = {
        status: "feasible",
        qualified: true,
        feed_rows: feedRows,
        totals: ev.totals,
        nutrients: ev.nutrients,
        nutrient_status: nutrientStatus,
        requirements: req,
        purchased_ids: [],
        dmi_target_kg: req.dmi_target_kg,
        rounding: {
          step_kg: spec.ROUND_STEP_KG,
          revalidated: true,
        },
        ration_insights: rationInsights,
        management_tips: MANAGEMENT_TIPS,
        boundary_statements: BOUNDARY_STATEMENTS,
      };
      return feasibleResult;
    }
  }

  // 第二层求解：尽力解（近似配比）
  const best = bestEffortAmounts(effectiveFeeds, selectedSet, req);
  if (best !== null) {
    const ev = evaluateRation(effectiveFeeds, best, req);
    const feedRows = buildFeedRows(effectiveFeeds, best, selectedSet);
    const nutrientStatus = buildNutrientStatus(effectiveFeeds, best, req, ev);
    const rationInsights = buildRationInsights(
      effectiveFeeds,
      feedRows,
      nutrientStatus,
      req,
      ownedIds,
    );

    const mineralOnly = ownedIds.every((id) => effectiveFeeds[id]?.category === "mineral");
    const detail = mineralOnly
      ? "当前只勾选了矿物质（食盐/石粉等），不能构成日粮。该结果仅为诊断用最小剂量示例，禁止直接饲喂！"
      : "仅使用当前勾选原料无法同时满足全部营养约束，这是这些原料范围内营养缺口最小的近似配比，不是合格配方；未勾选原料不会自动加入。";
    const advice = mineralOnly
      ? "请返回勾选至少一种能量/蛋白/粗饲料原料并重新计算；任何情况下都不要单独饲喂矿物质，未达标项必须由营养师或兽医复核。"
      : "饲喂前必须由营养师或兽医逐项复核未达标项并补充原料；本结果不能直接作为完整日粮使用。";

    const approxResult: ApproximateRation = {
      status: "approximate",
      qualified: false,
      feed_rows: feedRows,
      totals: ev.totals,
      nutrients: ev.nutrients,
      nutrient_status: nutrientStatus,
      requirements: req,
      purchased_ids: [],
      violations: ev.violations,
      do_not_feed: mineralOnly,
      detail,
      advice,
      dmi_target_kg: req.dmi_target_kg,
      rounding: {
        step_kg: spec.ROUND_STEP_KG,
        revalidated: false,
      },
      ration_insights: rationInsights,
      management_tips: MANAGEMENT_TIPS,
      boundary_statements: BOUNDARY_STATEMENTS,
    };
    return approxResult;
  }

  // 第三层：不可行诊断
  const reasons = diagnoseInfeasibility(candidate, req);
  const infeasibleResult: InfeasibleRation = {
    status: "infeasible",
    detail: "仅使用当前勾选原料无法找到满足全部约束的配方；未勾选原料不会自动加入。",
    reasons,
    advice: "请根据缺口自行决定是否返回勾选其他原料，或调整生产目标后重新计算；系统不会擅自使用未勾选原料，也不会伪造可行配方。",
    management_tips: MANAGEMENT_TIPS,
    boundary_statements: BOUNDARY_STATEMENTS,
  };
  return infeasibleResult;
}

export { DEFAULT_FEED_CATALOG };
