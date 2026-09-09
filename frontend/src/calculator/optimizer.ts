import type { FeedRow, NutrientStatusItem, Violation } from "../types";
import type { CalculatorFeedSpec } from "./feedsCatalog";
import type { Requirements } from "./nutrition";
import { solveLP } from "./simplex";
import * as spec from "./spec";

export function roundHalfUp(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function computeRationMetrics(
  feeds: Record<string, CalculatorFeedSpec>,
  amountsAsFed: Record<string, number>,
) {
  let totalAsFed = 0.0;
  let totalDm = 0.0;
  let cost = 0.0;
  let me = 0.0;
  let cp = 0.0;
  let ndf = 0.0;
  let ca = 0.0;
  let p = 0.0;
  let forageDm = 0.0;
  let saltDm = 0.0;

  for (const [fid, amt] of Object.entries(amountsAsFed)) {
    if (amt <= 0) continue;
    const f = feeds[fid];
    if (!f) continue;
    const dm = amt * f.dm_fraction;
    totalAsFed += amt;
    totalDm += dm;
    cost += amt * f.default_price_rmb_per_kg;
    me += f.me_mj_per_kg_dm * dm;
    cp += (f.cp_pct_dm / 100.0) * dm;
    ndf += (f.ndf_pct_dm / 100.0) * dm;
    ca += (f.ca_pct_dm / 100.0) * dm;
    p += (f.p_pct_dm / 100.0) * dm;
    if (f.is_forage) forageDm += dm;
    if (fid === "salt") saltDm = dm;
  }

  const T = totalDm;
  const meDensity = T > 0 ? me / T : 0.0;
  const cpPct = T > 0 ? (cp / T) * 100.0 : 0.0;
  const ndfPct = T > 0 ? (ndf / T) * 100.0 : 0.0;
  const caPct = T > 0 ? (ca / T) * 100.0 : 0.0;
  const pPct = T > 0 ? (p / T) * 100.0 : 0.0;
  const foragePct = T > 0 ? (forageDm / T) * 100.0 : 0.0;
  const caPRatio = p > 0 ? ca / p : Infinity;

  return {
    as_fed_kg: totalAsFed,
    total_dm_kg: totalDm,
    cost_rmb: cost,
    me_mj: me,
    me_density_mj_per_kg_dm: meDensity,
    cp_pct_dm: cpPct,
    ndf_pct_dm: ndfPct,
    ca_pct_dm: caPct,
    p_pct_dm: pPct,
    ca_p_ratio: caPRatio,
    forage_pct_dm: foragePct,
    salt_kg: saltDm,
  };
}

export function evaluateRation(
  feeds: Record<string, CalculatorFeedSpec>,
  amountsAsFed: Record<string, number>,
  req: Requirements,
) {
  const raw = computeRationMetrics(feeds, amountsAsFed);
  const totalAsFed = raw.as_fed_kg;
  const T = raw.total_dm_kg;
  const cost = raw.cost_rmb;
  const me = raw.me_mj;
  const meDensity = raw.me_density_mj_per_kg_dm;
  const cpPct = raw.cp_pct_dm;
  const ndfPct = raw.ndf_pct_dm;
  const caPct = raw.ca_pct_dm;
  const pPct = raw.p_pct_dm;
  const foragePct = raw.forage_pct_dm;
  const caPRatio = raw.ca_p_ratio;
  const saltDm = raw.salt_kg;

  const violations: Violation[] = [];

  function check(code: string, ok: boolean, message: string, severity = 1.0) {
    if (!ok) {
      violations.push({ code, message, severity });
    }
  }

  // DMI 带
  let dmiSev = 0.0;
  if (T > req.dmi_max_kg + spec.EPS_DMI_KG) {
    dmiSev = (T - req.dmi_max_kg) / req.dmi_target_kg;
  } else if (T < req.dmi_min_kg - spec.EPS_DMI_KG) {
    dmiSev = (req.dmi_min_kg - T) / req.dmi_target_kg;
  }
  check(
    "dmi_band",
    dmiSev === 0.0,
    `干物质采食量 ${T.toFixed(3)} kg/d 超出目标 ${req.dmi_target_kg.toFixed(3)}±${(spec.DMI_TOLERANCE * 100).toFixed(0)}% 范围`,
    dmiSev,
  );

  // ME 下限
  const meSev =
    me < req.me_requirement_mj - spec.EPS_ME_MJ
      ? (req.me_requirement_mj - me) / req.me_requirement_mj
      : 0.0;
  check(
    "me_min",
    meSev === 0.0,
    `代谢能 ${me.toFixed(2)} MJ/d 低于需求下限 ${req.me_requirement_mj.toFixed(2)} MJ/d`,
    meSev,
  );

  // CP 带
  let cpSev = 0.0;
  if (cpPct < req.cp_min_pct - spec.EPS_PCT_POINT) {
    cpSev = (req.cp_min_pct - cpPct) / req.cp_min_pct;
  } else if (cpPct > req.cp_max_pct + spec.EPS_PCT_POINT) {
    cpSev = (cpPct - req.cp_max_pct) / req.cp_max_pct;
  }
  check(
    "cp_band",
    cpSev === 0.0,
    `粗蛋白 ${cpPct.toFixed(2)}%DM 超出范围 [${req.cp_min_pct.toFixed(2)}, ${req.cp_max_pct.toFixed(2)}]%DM`,
    cpSev,
  );

  // NDF 带
  let ndfSev = 0.0;
  if (ndfPct < req.ndf_min_pct - spec.EPS_PCT_POINT) {
    ndfSev = (req.ndf_min_pct - ndfPct) / req.ndf_min_pct;
  } else if (ndfPct > req.ndf_max_pct + spec.EPS_PCT_POINT) {
    ndfSev = (ndfPct - req.ndf_max_pct) / req.ndf_max_pct;
  }
  check(
    "ndf_band",
    ndfSev === 0.0,
    `NDF ${ndfPct.toFixed(2)}%DM 超出范围 [${req.ndf_min_pct.toFixed(2)}, ${req.ndf_max_pct.toFixed(2)}]%DM`,
    ndfSev,
  );

  // 粗饲料比例
  const forageSev =
    foragePct < req.forage_min_frac * 100 - spec.EPS_PCT_POINT
      ? (req.forage_min_frac * 100 - foragePct) / 100.0
      : 0.0;
  check(
    "forage_ratio",
    forageSev === 0.0,
    `粗饲料比例 ${foragePct.toFixed(2)}%DM 低于下限 ${(req.forage_min_frac * 100).toFixed(0)}%DM`,
    forageSev,
  );

  // 钙、磷
  const caSev =
    caPct < req.ca_min_pct - spec.EPS_PCT_POINT
      ? (req.ca_min_pct - caPct) / req.ca_min_pct
      : 0.0;
  check("ca_min", caSev === 0.0, `钙 ${caPct.toFixed(2)}%DM 低于下限 ${req.ca_min_pct.toFixed(2)}%DM`, caSev);

  const pSev =
    pPct < req.p_min_pct - spec.EPS_PCT_POINT
      ? (req.p_min_pct - pPct) / req.p_min_pct
      : 0.0;
  check("p_min", pSev === 0.0, `磷 ${pPct.toFixed(2)}%DM 低于下限 ${req.p_min_pct.toFixed(2)}%DM`, pSev);

  // 钙磷比
  let capSev = 0.0;
  if (caPRatio < spec.CAP_RATIO_MIN - spec.EPS_CAP_RATIO) {
    capSev = (spec.CAP_RATIO_MIN - caPRatio) / spec.CAP_RATIO_MIN;
  } else if (caPRatio > spec.CAP_RATIO_MAX + spec.EPS_CAP_RATIO) {
    capSev = (caPRatio - spec.CAP_RATIO_MAX) / spec.CAP_RATIO_MAX;
  }
  check(
    "ca_p_ratio",
    capSev === 0.0,
    `钙磷比 ${caPRatio.toFixed(2)} 超出范围 [${spec.CAP_RATIO_MIN.toFixed(1)}, ${spec.CAP_RATIO_MAX.toFixed(1)}]`,
    capSev,
  );

  // 食盐固定比例
  const saltTarget = spec.SALT_FRACTION * T;
  const saltDiff = Math.abs(saltDm - saltTarget);
  const saltSev =
    saltTarget > 0 ? Math.max(0, (saltDiff - spec.SALT_TOLERANCE_KG) / saltTarget) : 0.0;
  check(
    "salt",
    saltDiff <= spec.SALT_TOLERANCE_KG,
    `食盐 ${(saltDm * 1000).toFixed(1)} g/d 偏离固定比例 ${(spec.SALT_FRACTION * 100).toFixed(1)}%DM`,
    saltSev,
  );

  // 各原料上限
  for (const [fid, amt] of Object.entries(amountsAsFed)) {
    const f = feeds[fid];
    if (!f) continue;
    const dm = amt * f.dm_fraction;
    const cap = (f.max_usage_pct_dm / 100.0) * T;
    const capSev = dm > cap + spec.EPS_DM_KG ? (dm - cap) / T : 0.0;
    check(
      `feed_cap:${fid}`,
      dm <= cap + spec.EPS_DM_KG,
      `${f.name} 用量 ${dm.toFixed(3)} kgDM 超过上限 ${f.max_usage_pct_dm.toFixed(0)}%DM`,
      capSev,
    );
  }

  return {
    totals: {
      as_fed_kg: roundHalfUp(totalAsFed, 3),
      dm_kg: roundHalfUp(T, 3),
      cost_rmb: roundHalfUp(cost, 4),
    },
    nutrients: {
      total_dm_kg: roundHalfUp(T, 3),
      dmi_kg: roundHalfUp(T, 3),
      dmi_pct_of_target: req.dmi_target_kg ? roundHalfUp((T / req.dmi_target_kg) * 100, 1) : 100.0,
      me_mj: roundHalfUp(me, 3),
      me_density_mj_per_kg_dm: roundHalfUp(meDensity, 3),
      cp_pct_dm: roundHalfUp(cpPct, 2),
      ndf_pct_dm: roundHalfUp(ndfPct, 2),
      ca_pct_dm: roundHalfUp(caPct, 2),
      p_pct_dm: roundHalfUp(pPct, 2),
      ca_p_ratio: Number.isFinite(caPRatio) ? roundHalfUp(caPRatio, 2) : null,
      forage_pct_dm: roundHalfUp(foragePct, 2),
      salt_kg: roundHalfUp(saltDm, 3),
    },
    violations,
  };
}

export function buildAndSolve(
  candidate: CalculatorFeedSpec[],
  req: Requirements,
  skip: Set<string>,
): { feasible: boolean; x_dm: Record<string, number>; message: string } {
  const n = candidate.length;
  const t_idx = n;
  const c = candidate.map((f) => f.default_price_rmb_per_kg / f.dm_fraction).concat([0.0]);

  const A_ub: number[][] = [];
  const b_ub: number[] = [];
  const A_eq: number[][] = [];
  const b_eq: number[] = [];

  // T = sum(x_i)
  const t_eq = candidate.map(() => 1.0).concat([-1.0]);
  A_eq.push(t_eq);
  b_eq.push(0.0);

  if (!skip.has("dmi")) {
    const dmi_ub = candidate.map(() => 0.0).concat([1.0]);
    A_ub.push(dmi_ub);
    b_ub.push(req.dmi_max_kg);

    const dmi_lb = candidate.map(() => 0.0).concat([-1.0]);
    A_ub.push(dmi_lb);
    b_ub.push(-req.dmi_min_kg);
  }

  if (!skip.has("feed_caps")) {
    for (let i = 0; i < n; i++) {
      const row = new Array(n + 1).fill(0.0);
      row[i] = 1.0;
      row[t_idx] = -candidate[i].max_usage_pct_dm / 100.0;
      A_ub.push(row);
      b_ub.push(0.0);
    }
  }

  if (!skip.has("me")) {
    A_ub.push(candidate.map((f) => -f.me_mj_per_kg_dm).concat([0.0]));
    b_ub.push(-req.me_requirement_mj);
  }

  if (!skip.has("cp")) {
    A_ub.push(candidate.map((f) => -f.cp_pct_dm).concat([req.cp_min_pct]));
    b_ub.push(0.0);
    A_ub.push(candidate.map((f) => f.cp_pct_dm).concat([-req.cp_max_pct]));
    b_ub.push(0.0);
  }

  if (!skip.has("ndf")) {
    A_ub.push(candidate.map((f) => -f.ndf_pct_dm).concat([req.ndf_min_pct]));
    b_ub.push(0.0);
    A_ub.push(candidate.map((f) => f.ndf_pct_dm).concat([-req.ndf_max_pct]));
    b_ub.push(0.0);
  }

  if (!skip.has("forage")) {
    A_ub.push(candidate.map<number>((f) => (f.is_forage ? -1.0 : 0.0)).concat([req.forage_min_frac]));
    b_ub.push(0.0);
  }

  if (!skip.has("ca")) {
    A_ub.push(candidate.map((f) => -f.ca_pct_dm).concat([req.ca_min_pct]));
    b_ub.push(0.0);
  }

  if (!skip.has("p")) {
    A_ub.push(candidate.map((f) => -f.p_pct_dm).concat([req.p_min_pct]));
    b_ub.push(0.0);
  }

  if (!skip.has("ca_p")) {
    A_ub.push(candidate.map((f) => -(f.ca_pct_dm - spec.CAP_RATIO_MIN * f.p_pct_dm)).concat([0.0]));
    b_ub.push(0.0);
    A_ub.push(candidate.map((f) => f.ca_pct_dm - spec.CAP_RATIO_MAX * f.p_pct_dm).concat([0.0]));
    b_ub.push(0.0);
  }

  if (!skip.has("salt")) {
    const hasSalt = candidate.some((f) => f.feed_id === "salt");
    if (!hasSalt) {
      return { feasible: false, x_dm: {}, message: "原料集合缺少食盐（固定 0.5%DM），无法满足约束" };
    }
    const salt_row = candidate.map<number>((f) => (f.feed_id === "salt" ? 1.0 : 0.0)).concat([-spec.SALT_FRACTION]);
    A_eq.push(salt_row);
    b_eq.push(0.0);
  }

  const sol = solveLP(c, A_ub, b_ub, A_eq, b_eq);
  if (!sol.feasible) {
    return { feasible: false, x_dm: {}, message: sol.message || "求解不可行" };
  }

  const amounts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    if (sol.x[i] > 1e-9) {
      amounts[candidate[i].feed_id] = sol.x[i];
    }
  }

  return { feasible: true, x_dm: amounts, message: "ok" };
}

function syncSalt(
  feeds: Record<string, CalculatorFeedSpec>,
  amounts: Record<string, number>,
): Record<string, number> {
  if (!("salt" in feeds) || !("salt" in amounts)) {
    return { ...amounts };
  }
  let nonsaltDm = 0.0;
  for (const [fid, amt] of Object.entries(amounts)) {
    if (fid !== "salt") {
      nonsaltDm += amt * feeds[fid].dm_fraction;
    }
  }
  const saltTargetDm = (spec.SALT_FRACTION / (1.0 - spec.SALT_FRACTION)) * nonsaltDm;
  const targetAsFed = saltTargetDm / feeds.salt.dm_fraction;
  const out = { ...amounts };
  out.salt = roundHalfUp(targetAsFed, 2);
  return out;
}

function violationScore(ev: ReturnType<typeof evaluateRation>): number {
  return ev.violations.reduce((sum, v) => sum + Math.max(0, v.severity ?? 1.0), 0.0);
}

export function roundAndRepair(
  feeds: Record<string, CalculatorFeedSpec>,
  xDm: Record<string, number>,
  req: Requirements,
  allowedIds: Set<string>,
): [Record<string, number>, ReturnType<typeof evaluateRation>] {
  let amounts: Record<string, number> = {};
  for (const [fid, dm] of Object.entries(xDm)) {
    if (allowedIds.has(fid) && feeds[fid]) {
      amounts[fid] = roundHalfUp(dm / feeds[fid].dm_fraction, 2);
    }
  }
  amounts = syncSalt(feeds, amounts);
  const order = Array.from(allowedIds).filter((id) => id in feeds);

  let ev = evaluateRation(feeds, amounts, req);
  if (ev.violations.length === 0) {
    return [amounts, ev];
  }

  for (let iter = 0; iter < spec.REPAIR_MAX_ITERATIONS; iter++) {
    ev = evaluateRation(feeds, amounts, req);
    if (ev.violations.length === 0) {
      return [amounts, ev];
    }
    const currentScore = violationScore(ev);
    let best: [number, Record<string, number>] | null = null;

    function consider(trial: Record<string, number>) {
      const syn = syncSalt(feeds, trial);
      const score = violationScore(evaluateRation(feeds, syn, req));
      if (best === null || score < best[0]) {
        best = [score, syn];
      }
    }

    // 单料 ±0.01 kg
    for (const fid of order) {
      if (fid === "salt") continue;
      for (const delta of [spec.ROUND_STEP_KG, -spec.ROUND_STEP_KG]) {
        const trial = { ...amounts };
        const newVal = roundHalfUp((trial[fid] ?? 0.0) + delta, 2);
        if (newVal < 0) continue;
        trial[fid] = newVal;
        consider(trial);
      }
    }

    // 两两原料 0.01 kg 交换
    for (const a of order) {
      if (a === "salt") continue;
      for (const b of order) {
        if (b === a || b === "salt") continue;
        if ((amounts[b] ?? 0.0) < spec.ROUND_STEP_KG) continue;
        const trial = { ...amounts };
        trial[a] = roundHalfUp((trial[a] ?? 0.0) + spec.ROUND_STEP_KG, 2);
        trial[b] = roundHalfUp((trial[b] ?? 0.0) - spec.ROUND_STEP_KG, 2);
        consider(trial);
      }
    }

    if (best === null || best[0] >= currentScore) {
      break;
    }
    amounts = best[1];
  }

  ev = evaluateRation(feeds, amounts, req);
  return [amounts, ev];
}

const DIAGNOSIS_LABELS: Record<string, string> = {
  dmi: "干物质采食量（目标 ±3%）",
  feed_caps: "各原料最大用量上限",
  me: "代谢能下限（含 5% 安全余量）",
  cp: "粗蛋白范围（含 5% 计算余量，上限 20%DM）",
  ndf: "NDF 范围",
  forage: "粗饲料最低比例",
  ca: "钙最低水平",
  p: "磷最低水平",
  ca_p: "钙磷比 1.5–2.0",
  salt: "食盐固定 0.5%DM",
};

export function diagnoseInfeasibility(candidate: CalculatorFeedSpec[], req: Requirements) {
  const base = buildAndSolve(candidate, req, new Set());
  const reasons: { code: string; message: string }[] = [];
  if (base.feasible) return reasons;

  for (const group of Object.keys(DIAGNOSIS_LABELS)) {
    const relaxed = buildAndSolve(candidate, req, new Set([group]));
    if (relaxed.feasible) {
      reasons.push({
        code: group,
        message: `约束组「${DIAGNOSIS_LABELS[group]}」无法在当前原料集合下同时满足（去掉该约束后配方可解）。请增加相应原料或咨询营养师/兽医复核。`,
      });
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      code: "combined",
      message: "多个约束相互制约导致整体不可行，请增加可选原料范围或降低生产目标后重试。",
    });
  }
  return reasons;
}

export function buildNutrientStatus(
  _feeds: Record<string, CalculatorFeedSpec>,
  _amounts: Record<string, number>,
  req: Requirements,
  ev: ReturnType<typeof evaluateRation>,
): NutrientStatusItem[] {
  const n = ev.nutrients;
  const violCodes = new Set(ev.violations.map((v) => v.code));

  const items: [string, string, string, number | null, string, string][] = [
    ["dmi", "干物质采食量", `目标 ${req.dmi_target_kg.toFixed(2)} kg/d，允许 ±${(spec.DMI_TOLERANCE * 100).toFixed(0)}%`, n.dmi_kg, "kg/d", "dmi_band"],
    ["me", "代谢能", `≥ ${req.me_requirement_mj.toFixed(2)} MJ/d（含 5% 安全余量）`, n.me_mj, "MJ/d", "me_min"],
    ["cp", "粗蛋白", `${req.cp_min_pct.toFixed(1)}–${req.cp_max_pct.toFixed(1)} %DM（宏量代理指标）`, n.cp_pct_dm, "%DM", "cp_band"],
    ["ndf", "NDF", `${req.ndf_min_pct.toFixed(0)}–${req.ndf_max_pct.toFixed(0)} %DM`, n.ndf_pct_dm, "%DM", "ndf_band"],
    ["forage", "粗饲料比例", `≥ ${(req.forage_min_frac * 100).toFixed(0)} %DM`, n.forage_pct_dm, "%DM", "forage_ratio"],
    ["ca", "钙", `≥ ${req.ca_min_pct.toFixed(2)} %DM`, n.ca_pct_dm, "%DM", "ca_min"],
    ["p", "磷", `≥ ${req.p_min_pct.toFixed(2)} %DM`, n.p_pct_dm, "%DM", "p_min"],
    ["ca_p", "钙磷比", `${req.ca_p_ratio_min.toFixed(1)}–${req.ca_p_ratio_max.toFixed(1)}`, n.ca_p_ratio, "", "ca_p_ratio"],
    ["salt", "食盐", `固定 ${(req.salt_fraction * 100).toFixed(1)} %DM（取整误差容差 ±5 g）`, n.salt_kg, "kg/d", "salt"],
  ];

  return items.map(([key, label, target, actual, unit, code]) => ({
    key,
    label,
    target,
    actual,
    unit,
    pass: !violCodes.has(code),
  }));
}

export function buildFeedRows(
  feeds: Record<string, CalculatorFeedSpec>,
  amounts: Record<string, number>,
  selectedSet: Set<string>,
): FeedRow[] {
  const rows: FeedRow[] = [];
  const sortedFids = Object.keys(amounts).sort((a, b) => {
    const fA = feeds[a];
    const fB = feeds[b];
    if (fA.category !== fB.category) return fA.category.localeCompare(fB.category);
    return a.localeCompare(b);
  });

  for (const fid of sortedFids) {
    const amt = amounts[fid];
    if (amt <= 0) continue;
    const f = feeds[fid];
    rows.push({
      feed_id: fid,
      name: f.name,
      category: f.category,
      owned: selectedSet.has(fid),
      purchased: false,
      as_fed_kg: roundHalfUp(amt, 2),
      dm_kg: roundHalfUp(amt * f.dm_fraction, 3),
      price_rmb_per_kg: roundHalfUp(f.default_price_rmb_per_kg, 4),
      cost_rmb: roundHalfUp(amt * f.default_price_rmb_per_kg, 4),
    });
  }
  return rows;
}

export function bestEffortAmounts(
  feeds: Record<string, CalculatorFeedSpec>,
  allowedIds: Set<string>,
  req: Requirements,
): Record<string, number> | null {
  const candidate = Array.from(allowedIds)
    .map((fid) => feeds[fid])
    .filter(Boolean)
    .sort((a, b) => a.feed_id.localeCompare(b.feed_id));
  if (candidate.length === 0) return null;

  if (candidate.every((f) => f.category === "mineral")) {
    const res: Record<string, number> = {};
    for (const f of candidate) res[f.feed_id] = spec.ROUND_STEP_KG;
    return res;
  }

  // 尽力解：在勾选原料中按营养目标构建两阶段单纯形近似
  // 去除严格约束后通过小步自愈求解
  const relaxedOutcome = buildAndSolve(candidate, req, new Set(["cp", "ndf", "forage", "ca", "p", "ca_p", "salt", "feed_caps"]));
  if (relaxedOutcome.feasible) {
    const [repaired] = roundAndRepair(feeds, relaxedOutcome.x_dm, req, allowedIds);
    return repaired;
  }

  // 二次放松 DMI
  const ultraRelaxed = buildAndSolve(candidate, req, new Set(["dmi", "cp", "ndf", "forage", "ca", "p", "ca_p", "salt", "feed_caps"]));
  if (ultraRelaxed.feasible) {
    const [repaired] = roundAndRepair(feeds, ultraRelaxed.x_dm, req, allowedIds);
    return repaired;
  }

  return null;
}
