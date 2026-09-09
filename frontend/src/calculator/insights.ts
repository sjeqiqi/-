// 确定性配方解读与贴边预警分析模块（对齐 insights.py）
import type { BoundaryFlag, FeedRow, InsightSource, NutrientStatusItem, RationInsights } from "../types";
import type { CalculatorFeedSpec } from "./feedsCatalog";
import type { Requirements } from "./nutrition";
import { roundHalfUp } from "./optimizer";

export const RATION_INSIGHTS_VERSION = "1.1";

export const SCOPE_NOTICE =
  "当前模型仅计算代谢能、粗蛋白、NDF、钙、磷等宏量指标，不计算并保证维生素、微量元素及可代谢蛋白完整满足，因此不能据此认定为完整、长期、全价日粮。";

const TOP_SOURCES = 3;
const BOUNDARY_DMI_MARGIN_FRACTION = 0.02;
const BOUNDARY_ME_MARGIN_FRACTION = 0.02;
const BOUNDARY_PCT_MARGIN_POINTS = 1.0;
const BOUNDARY_FEED_CAP_MARGIN_POINTS = 1.0;

function contributionShares(
  rows: FeedRow[],
  feeds: Record<string, CalculatorFeedSpec>,
  metric: "me" | "cp",
): InsightSource[] {
  const contributions: { feed_id: string; name: string; value: number }[] = [];

  for (const row of rows) {
    const f = feeds[row.feed_id];
    if (!f) continue;
    const dmKg = row.as_fed_kg * f.dm_fraction;
    const val = metric === "me" ? dmKg * f.me_mj_per_kg_dm : dmKg * (f.cp_pct_dm / 100.0);
    if (val > 0) {
      contributions.push({ feed_id: row.feed_id, name: row.name, value: val });
    }
  }

  const total = contributions.reduce((s, c) => s + c.value, 0) || 1.0;
  return contributions
    .sort((a, b) => b.value - a.value || a.feed_id.localeCompare(b.feed_id))
    .map((item) => ({
      feed_id: item.feed_id,
      name: item.name,
      contribution: roundHalfUp(item.value, 4),
      share_pct: roundHalfUp((item.value / total) * 100, 1),
    }));
}

export function buildRationInsights(
  feeds: Record<string, CalculatorFeedSpec>,
  rows: FeedRow[],
  nutrientStatus: NutrientStatusItem[],
  req: Requirements,
  ownedIds: string[],
): RationInsights {
  const totalDmKg = rows.reduce((s, r) => s + r.dm_kg, 0.0);
  let forageDmKg = 0.0;
  for (const r of rows) {
    const f = feeds[r.feed_id];
    if (f && f.is_forage) {
      forageDmKg += r.dm_kg;
    }
  }
  const forageDmPct = totalDmKg > 0 ? (forageDmKg / totalDmKg) * 100.0 : 0.0;

  const meSourcesAll = contributionShares(rows, feeds, "me");
  const cpSourcesAll = contributionShares(rows, feeds, "cp");
  const topMeSources = meSourcesAll.slice(0, TOP_SOURCES);
  const topCpSources = cpSourcesAll.slice(0, TOP_SOURCES);

  const flags: BoundaryFlag[] = [];
  const statusByKey = new Map<string, NutrientStatusItem>();
  for (const item of nutrientStatus) {
    statusByKey.set(item.key, item);
  }

  // DMI 贴边
  const dmiItem = statusByKey.get("dmi");
  if (dmiItem && dmiItem.pass && dmiItem.actual !== null) {
    const marginKg = BOUNDARY_DMI_MARGIN_FRACTION * req.dmi_target_kg;
    if (dmiItem.actual >= req.dmi_max_kg - marginKg) {
      const margin = roundHalfUp(req.dmi_max_kg - dmiItem.actual, 3);
      flags.push({
        code: "dmi_upper",
        label: "干物质采食量接近上限",
        detail: `实际 ${dmiItem.actual.toFixed(2)} kg/d，距上限 ${req.dmi_max_kg.toFixed(2)} kg/d 仅 ${margin.toFixed(2)} kg，余量不超过目标采食量的 2%。`,
        metric: "dmi",
        value: dmiItem.actual,
        limit: req.dmi_max_kg,
        margin,
        unit: "kg/d",
        margin_pct: roundHalfUp((margin / req.dmi_target_kg) * 100, 1),
      });
    } else if (dmiItem.actual <= req.dmi_min_kg + marginKg) {
      const margin = roundHalfUp(dmiItem.actual - req.dmi_min_kg, 3);
      flags.push({
        code: "dmi_lower",
        label: "干物质采食量接近下限",
        detail: `实际 ${dmiItem.actual.toFixed(2)} kg/d，距下限 ${req.dmi_min_kg.toFixed(2)} kg/d 仅 ${margin.toFixed(2)} kg，余量不超过目标采食量的 2%。`,
        metric: "dmi",
        value: dmiItem.actual,
        limit: req.dmi_min_kg,
        margin,
        unit: "kg/d",
        margin_pct: roundHalfUp((margin / req.dmi_target_kg) * 100, 1),
      });
    }
  }

  // ME 贴边
  const meItem = statusByKey.get("me");
  if (meItem && meItem.pass && meItem.actual !== null) {
    const margin = roundHalfUp(meItem.actual - req.me_requirement_mj, 3);
    if (margin <= BOUNDARY_ME_MARGIN_FRACTION * req.me_requirement_mj) {
      flags.push({
        code: "me_min",
        label: "代谢能接近需求下限",
        detail: `实际 ${meItem.actual.toFixed(2)} MJ/d，距下限 ${req.me_requirement_mj.toFixed(2)} MJ/d 余量仅 ${margin.toFixed(2)} MJ/d（≤2%）。`,
        metric: "me",
        value: meItem.actual,
        limit: req.me_requirement_mj,
        margin,
        unit: "MJ/d",
        margin_pct: roundHalfUp((margin / req.me_requirement_mj) * 100, 1),
      });
    }
  }

  // CP 贴边
  const cpItem = statusByKey.get("cp");
  if (cpItem && cpItem.pass && cpItem.actual !== null) {
    if (cpItem.actual - req.cp_min_pct <= BOUNDARY_PCT_MARGIN_POINTS) {
      const margin = roundHalfUp(cpItem.actual - req.cp_min_pct, 2);
      flags.push({
        code: "cp_lower",
        label: "粗蛋白接近下限",
        detail: `实际 ${cpItem.actual.toFixed(2)}%DM，距下限 ${req.cp_min_pct.toFixed(2)}%DM 余量不超过 1 个百分点。`,
        metric: "cp",
        value: cpItem.actual,
        limit: req.cp_min_pct,
        margin,
        unit: "%DM",
      });
    }
  }

  // 各原料使用上限贴边
  for (const r of rows) {
    const f = feeds[r.feed_id];
    if (!f || totalDmKg <= 0) continue;
    const dmShare = (r.dm_kg / totalDmKg) * 100.0;
    if (dmShare <= f.max_usage_pct_dm && f.max_usage_pct_dm - dmShare <= BOUNDARY_FEED_CAP_MARGIN_POINTS) {
      const margin = roundHalfUp(f.max_usage_pct_dm - dmShare, 2);
      flags.push({
        code: `feed_cap:${r.feed_id}`,
        label: `${r.name}用量接近上限`,
        detail: `在日粮总干物质中占比 ${dmShare.toFixed(1)}%DM，距建议上限 ${f.max_usage_pct_dm.toFixed(0)}%DM 余量仅 ${margin.toFixed(1)} 个百分点。`,
        metric: "feed_cap",
        value: roundHalfUp(dmShare, 2),
        limit: f.max_usage_pct_dm,
        margin,
        unit: "%DM",
      });
    }
  }

  return {
    version: RATION_INSIGHTS_VERSION,
    selected_feed_count: ownedIds.length,
    used_feed_count: rows.length,
    total_dm_kg: roundHalfUp(totalDmKg, 3),
    forage_dm_pct: roundHalfUp(forageDmPct, 1),
    top_me_sources: topMeSources,
    me_sources_all: meSourcesAll,
    top_cp_sources: topCpSources,
    cp_sources_all: cpSourcesAll,
    boundary_flags: flags,
    scope_notice: SCOPE_NOTICE,
  };
}
