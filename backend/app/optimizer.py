"""最低成本日粮线性规划、取整复算与尽力解（approximate）两层求解。

第一层（严格，保持不变）：
- 全部优化在干物质基础上进行，最终换算为原物质 kg/只/天。
- 只使用农户明确勾选的原料；未勾选原料永远不进入求解。
- 最终用量按 10 g（0.01 kg）四舍五入，用取整值重新计算全部指标并复验；
  不达标时在 0.01 kg 步长内做确定性小步修正。

第二层（尽力解，仅在严格路径不可行或取整后不达标时触发）：
- 仍只在勾选原料内，直接以 10 g 为整数单位求“营养缺口最小”的解
  （归一化松弛变量/权重，成本仅作确定性平局），并明确标注为
  approximate、qualified=false，绝不伪装成合格配方。
- 含非矿物质原料时，DMI 目标 ±3% 优先作为硬规划约束；矿物质只做
  小剂量安全上界内的使用，绝不把盐/石粉当体积填充。
- 只有数值优化器在两层都灾难性失败时才返回旧式 infeasible。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, linprog, milp

from . import spec
from .feeds import FeedSpec
from .nutrition import Requirements


# ---------------------------------------------------------------- 工具

def round_half_up(value: float, digits: int = 2) -> float:
    """四舍五入（half-up）到指定位数，保证确定性（用 Decimal 避免浮点误差）。"""
    from decimal import Decimal, ROUND_HALF_UP
    q = Decimal(1).scaleb(-digits)
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def _dm(amount_asfed: float, feed: FeedSpec) -> float:
    return amount_asfed * feed.dm_fraction


# ---------------------------------------------------------------- 复算

def evaluate_ration(
    feeds: dict[str, FeedSpec],
    amounts_asfed: dict[str, float],
    req: Requirements,
) -> dict:
    """用给定的原物质用量复算全部指标并逐项判定是否达标（含容差）。"""
    total_asfed = 0.0
    total_dm = 0.0
    cost = 0.0
    me = 0.0
    cp = 0.0
    ndf = 0.0
    ca = 0.0
    p = 0.0
    forage_dm = 0.0
    salt_dm = 0.0

    for fid, amt in amounts_asfed.items():
        f = feeds[fid]
        dm = _dm(amt, f)
        total_asfed += amt
        total_dm += dm
        cost += amt * f.default_price_rmb_per_kg
        me += f.me_mj_per_kg_dm * dm
        cp += (f.cp_pct_dm / 100.0) * dm
        ndf += (f.ndf_pct_dm / 100.0) * dm
        ca += (f.ca_pct_dm / 100.0) * dm
        p += (f.p_pct_dm / 100.0) * dm
        if f.is_forage:
            forage_dm += dm
        if fid == "salt":
            salt_dm = dm

    violations: list[dict] = []

    def check(code: str, ok: bool, message: str, severity: float = 1.0):
        if not ok:
            violations.append({"code": code, "message": message, "severity": severity})

    T = total_dm
    me_density = me / T if T > 0 else 0.0
    cp_pct = cp / T * 100 if T > 0 else 0.0
    ndf_pct = ndf / T * 100 if T > 0 else 0.0
    ca_pct = ca / T * 100 if T > 0 else 0.0
    p_pct = p / T * 100 if T > 0 else 0.0
    forage_pct = forage_dm / T * 100 if T > 0 else 0.0
    ca_p_ratio = (ca / p) if p > 0 else float("inf")

    # DMI 带
    dmi_sev = 0.0
    if T > req.dmi_max_kg + spec.EPS_DMI_KG:
        dmi_sev = (T - req.dmi_max_kg) / req.dmi_target_kg
    elif T < req.dmi_min_kg - spec.EPS_DMI_KG:
        dmi_sev = (req.dmi_min_kg - T) / req.dmi_target_kg
    check("dmi_band", dmi_sev == 0.0,
          f"干物质采食量 {T:.3f} kg/d 超出目标 {req.dmi_target_kg:.3f}±{spec.DMI_TOLERANCE*100:.0f}% 范围",
          dmi_sev)
    # ME 下限（含 5% 余量）
    me_sev = (req.me_requirement_mj - me) / req.me_requirement_mj if me < req.me_requirement_mj - spec.EPS_ME_MJ else 0.0
    check("me_min", me_sev == 0.0,
          f"代谢能 {me:.2f} MJ/d 低于需求下限 {req.me_requirement_mj:.2f} MJ/d", me_sev)
    # CP 带
    cp_sev = max((req.cp_min_pct - cp_pct) / req.cp_min_pct, (cp_pct - req.cp_max_pct) / req.cp_max_pct, 0.0) \
        if (cp_pct < req.cp_min_pct - spec.EPS_PCT_POINT or cp_pct > req.cp_max_pct + spec.EPS_PCT_POINT) else 0.0
    check("cp_band", cp_sev == 0.0,
          f"粗蛋白 {cp_pct:.2f}%DM 超出范围 [{req.cp_min_pct:.2f}, {req.cp_max_pct:.2f}]%DM", cp_sev)
    # NDF 带
    ndf_sev = max((req.ndf_min_pct - ndf_pct) / req.ndf_min_pct, (ndf_pct - req.ndf_max_pct) / req.ndf_max_pct, 0.0) \
        if (ndf_pct < req.ndf_min_pct - spec.EPS_PCT_POINT or ndf_pct > req.ndf_max_pct + spec.EPS_PCT_POINT) else 0.0
    check("ndf_band", ndf_sev == 0.0,
          f"NDF {ndf_pct:.2f}%DM 超出范围 [{req.ndf_min_pct:.2f}, {req.ndf_max_pct:.2f}]%DM", ndf_sev)
    # 粗饲料比例
    forage_sev = (req.forage_min_frac * 100 - forage_pct) / 100.0 if forage_pct < req.forage_min_frac * 100 - spec.EPS_PCT_POINT else 0.0
    check("forage_ratio", forage_sev == 0.0,
          f"粗饲料比例 {forage_pct:.2f}%DM 低于下限 {req.forage_min_frac*100:.0f}%DM", forage_sev)
    # 钙、磷
    ca_sev = (req.ca_min_pct - ca_pct) / req.ca_min_pct if ca_pct < req.ca_min_pct - spec.EPS_PCT_POINT else 0.0
    check("ca_min", ca_sev == 0.0,
          f"钙 {ca_pct:.2f}%DM 低于下限 {req.ca_min_pct:.2f}%DM", ca_sev)
    p_sev = (req.p_min_pct - p_pct) / req.p_min_pct if p_pct < req.p_min_pct - spec.EPS_PCT_POINT else 0.0
    check("p_min", p_sev == 0.0,
          f"磷 {p_pct:.2f}%DM 低于下限 {req.p_min_pct:.2f}%DM", p_sev)
    # 钙磷比
    cap_sev = 0.0
    if ca_p_ratio < spec.CAP_RATIO_MIN - spec.EPS_CAP_RATIO:
        cap_sev = (spec.CAP_RATIO_MIN - ca_p_ratio) / spec.CAP_RATIO_MIN
    elif ca_p_ratio > spec.CAP_RATIO_MAX + spec.EPS_CAP_RATIO:
        cap_sev = (ca_p_ratio - spec.CAP_RATIO_MAX) / spec.CAP_RATIO_MAX
    check("ca_p_ratio", cap_sev == 0.0,
          f"钙磷比 {ca_p_ratio:.2f} 超出范围 [{spec.CAP_RATIO_MIN:.1f}, {spec.CAP_RATIO_MAX:.1f}]", cap_sev)
    # 食盐固定比例（容差为半个 10 g 显示步长）
    salt_target = spec.SALT_FRACTION * T
    salt_sev = (abs(salt_dm - salt_target) - spec.SALT_TOLERANCE_KG) / salt_target if salt_target > 0 else 0.0
    check("salt",
          abs(salt_dm - salt_target) <= spec.SALT_TOLERANCE_KG,
          f"食盐 {salt_dm*1000:.1f} g/d 偏离固定比例 {spec.SALT_FRACTION*100:.1f}%DM", max(salt_sev, 0.0))
    # 各原料上限
    for fid, amt in amounts_asfed.items():
        f = feeds[fid]
        dm = _dm(amt, f)
        cap = f.max_usage_pct_dm / 100.0 * T
        cap_sev_feed = (dm - cap) / T if dm > cap + spec.EPS_DM_KG else 0.0
        check(f"feed_cap:{fid}",
              dm <= cap + spec.EPS_DM_KG,
              f"{f.name} 用量 {dm:.3f} kgDM 超过上限 {f.max_usage_pct_dm:.0f}%DM", cap_sev_feed)

    return {
        "totals": {
            "as_fed_kg": round_half_up(total_asfed, 3),
            "dm_kg": round_half_up(T, 3),
            "cost_rmb": round_half_up(cost, 4),
        },
        "nutrients": {
            "dmi_kg": round_half_up(T, 3),
            "dmi_pct_of_target": round_half_up(T / req.dmi_target_kg * 100, 1) if req.dmi_target_kg else None,
            "me_mj": round_half_up(me, 3),
            "me_density_mj_per_kg_dm": round_half_up(me_density, 3),
            "cp_pct_dm": round_half_up(cp_pct, 2),
            "ndf_pct_dm": round_half_up(ndf_pct, 2),
            "ca_pct_dm": round_half_up(ca_pct, 2),
            "p_pct_dm": round_half_up(p_pct, 2),
            "ca_p_ratio": round_half_up(ca_p_ratio, 2) if math.isfinite(ca_p_ratio) else None,
            "forage_pct_dm": round_half_up(forage_pct, 2),
            "salt_kg": round_half_up(salt_dm, 3),
        },
        "violations": violations,
    }


# ---------------------------------------------------------------- LP

@dataclass
class SolveOutcome:
    feasible: bool
    x_dm: dict[str, float] = field(default_factory=dict)
    message: str = ""


def _build_and_solve(candidate: list[FeedSpec], req: Requirements, skip: set[str]) -> SolveOutcome:
    """构造并求解 LP。skip 为诊断用：需要跳过的约束组。"""
    n = len(candidate)
    t_idx = n  # 总干物质 T 的变量下标
    c = [f.default_price_rmb_per_kg / f.dm_fraction for f in candidate] + [0.0]

    A_ub: list[list[float]] = []
    b_ub: list[float] = []

    def add_ub(coeffs: list[float], b: float):
        A_ub.append(coeffs)
        b_ub.append(b)

    A_eq: list[list[float]] = []
    b_eq: list[float] = []

    def add_eq(coeffs: list[float], b: float):
        A_eq.append(coeffs)
        b_eq.append(b)

    # T = Σ x_i
    add_eq([1.0] * n + [-1.0], 0.0)

    # 连续 LP 使用计划书中的严格数学约束。最终 10 g 粒度由整数规划求解，
    # 不在这里人为收紧营养范围或扩大验收容差。
    if "dmi" not in skip:
        add_ub([0.0] * n + [1.0], req.dmi_max_kg)
        add_ub([0.0] * n + [-1.0], -req.dmi_min_kg)

    if "feed_caps" not in skip:
        for i, f in enumerate(candidate):
            coeff = [0.0] * (n + 1)
            coeff[i] = 1.0
            coeff[t_idx] = -f.max_usage_pct_dm / 100.0
            add_ub(coeff, 0.0)

    if "me" not in skip:
        add_ub(
            [-f.me_mj_per_kg_dm for f in candidate] + [0.0],
            -req.me_requirement_mj,
        )

    if "cp" not in skip:
        add_ub([-f.cp_pct_dm for f in candidate] + [req.cp_min_pct], 0.0)
        add_ub([f.cp_pct_dm for f in candidate] + [-req.cp_max_pct], 0.0)

    if "ndf" not in skip:
        add_ub([-f.ndf_pct_dm for f in candidate] + [req.ndf_min_pct], 0.0)
        add_ub([f.ndf_pct_dm for f in candidate] + [-req.ndf_max_pct], 0.0)

    if "forage" not in skip:
        add_ub(
            [-(1.0 if f.is_forage else 0.0) for f in candidate]
            + [req.forage_min_frac],
            0.0,
        )

    if "ca" not in skip:
        add_ub([-f.ca_pct_dm for f in candidate] + [req.ca_min_pct], 0.0)

    if "p" not in skip:
        add_ub([-f.p_pct_dm for f in candidate] + [req.p_min_pct], 0.0)

    if "ca_p" not in skip:
        # Ca - 1.5P >= 0  且  Ca - 2.0P <= 0
        add_ub([-(f.ca_pct_dm - spec.CAP_RATIO_MIN * f.p_pct_dm) for f in candidate] + [0.0], 0.0)
        add_ub([(f.ca_pct_dm - spec.CAP_RATIO_MAX * f.p_pct_dm) for f in candidate] + [0.0], 0.0)

    if "salt" not in skip:
        salt_indices = [i for i, f in enumerate(candidate) if f.id == "salt"]
        if salt_indices:
            coeff = [0.0] * (n + 1)
            coeff[salt_indices[0]] = 1.0
            coeff[t_idx] = -spec.SALT_FRACTION
            add_eq(coeff, 0.0)
        else:
            # 原料集合中没有食盐 → 无法满足固定 0.5%DM 约束，直接不可行
            return SolveOutcome(feasible=False, message="原料集合缺少食盐（固定 0.5%DM），无法满足约束")

    bounds = [(0.0, None)] * (n + 1)
    result = linprog(c, A_ub=np.array(A_ub, dtype=float), b_ub=np.array(b_ub, dtype=float),
                     A_eq=np.array(A_eq, dtype=float), b_eq=np.array(b_eq, dtype=float),
                     bounds=bounds, method="highs")

    if not result.success:
        return SolveOutcome(feasible=False, message=str(result.message))

    x = result.x
    amounts = {}
    for i, f in enumerate(candidate):
        if x[i] > 1e-9:
            amounts[f.id] = float(x[i])
    return SolveOutcome(feasible=True, x_dm=amounts, message="ok")


# ---------------------------------------------------------------- 取整与修正

def _solve_discrete(
    feeds: dict[str, FeedSpec],
    req: Requirements,
    allowed_ids: set[str],
) -> dict[str, float] | None:
    """直接以 10 g 原物质为整数单位求最低成本解。"""
    candidate = [feed for fid, feed in feeds.items() if fid in allowed_ids]
    if not candidate or not any(feed.id == "salt" for feed in candidate):
        return None

    n = len(candidate)
    step = spec.ROUND_STEP_KG
    dm = np.array([step * feed.dm_fraction for feed in candidate], dtype=float)
    cost = np.array([step * feed.default_price_rmb_per_kg for feed in candidate], dtype=float)
    rows: list[np.ndarray] = []
    lower: list[float] = []
    upper: list[float] = []

    def add(coeff: np.ndarray, lb: float = -np.inf, ub: float = np.inf) -> None:
        rows.append(np.asarray(coeff, dtype=float))
        lower.append(lb)
        upper.append(ub)

    add(dm, req.dmi_min_kg, req.dmi_max_kg)
    add(dm * np.array([f.me_mj_per_kg_dm for f in candidate]), req.me_requirement_mj)

    cp = np.array([f.cp_pct_dm for f in candidate], dtype=float)
    add(dm * (cp - req.cp_min_pct), 0.0)
    add(dm * (cp - req.cp_max_pct), ub=0.0)

    ndf = np.array([f.ndf_pct_dm for f in candidate], dtype=float)
    add(dm * (ndf - req.ndf_min_pct), 0.0)
    add(dm * (ndf - req.ndf_max_pct), ub=0.0)

    forage = np.array([1.0 if f.is_forage else 0.0 for f in candidate], dtype=float)
    add(dm * (forage - req.forage_min_frac), 0.0)

    ca = np.array([f.ca_pct_dm for f in candidate], dtype=float)
    phosphorus = np.array([f.p_pct_dm for f in candidate], dtype=float)
    add(dm * (ca - req.ca_min_pct), 0.0)
    add(dm * (phosphorus - req.p_min_pct), 0.0)
    add(dm * (ca - spec.CAP_RATIO_MIN * phosphorus), 0.0)
    add(dm * (ca - spec.CAP_RATIO_MAX * phosphorus), ub=0.0)

    salt_indicator = np.array([1.0 if f.id == "salt" else 0.0 for f in candidate], dtype=float)
    salt_difference = dm * (salt_indicator - spec.SALT_FRACTION)
    salt_tol = spec.SALT_TOLERANCE_KG - 1e-9
    add(salt_difference, -salt_tol, salt_tol)

    for i, feed in enumerate(candidate):
        cap = feed.max_usage_pct_dm / 100.0
        coeff = -cap * dm
        coeff = coeff.copy()
        coeff[i] += dm[i]
        add(coeff, ub=0.0)

    constraints = LinearConstraint(
        np.vstack(rows),
        np.array(lower, dtype=float),
        np.array(upper, dtype=float),
    )
    result = milp(
        c=cost,
        integrality=np.ones(n, dtype=int),
        bounds=Bounds(np.zeros(n), np.full(n, np.inf)),
        constraints=constraints,
        options={"time_limit": 10.0, "mip_rel_gap": 0.0},
    )
    if not result.success or result.x is None:
        return None

    amounts: dict[str, float] = {}
    for feed, units in zip(candidate, result.x, strict=True):
        amount = round_half_up(round(float(units)) * step, 2)
        if amount > 0:
            amounts[feed.id] = amount
    return amounts

def _sync_salt(feeds: dict[str, FeedSpec], amounts: dict[str, float]) -> dict[str, float]:
    """把食盐同步为当前总干物质的 0.5%（按 10 g 四舍五入）。"""
    if "salt" not in feeds or "salt" not in amounts:
        return dict(amounts)
    total_dm = sum(_dm(amt, feeds[fid]) for fid, amt in amounts.items())
    target = spec.SALT_FRACTION * total_dm / feeds["salt"].dm_fraction
    out = dict(amounts)
    out["salt"] = round_half_up(target, 2)
    return out


def _violation_score(ev: dict) -> float:
    """确定性违反评分：各违反的归一化严重度之和；0 表示无违反。"""
    return float(sum(max(0.0, float(v.get("severity", 1.0))) for v in ev["violations"]))


def round_and_repair(
    feeds: dict[str, FeedSpec],
    x_dm: dict[str, float],
    req: Requirements,
    allowed_ids: set[str] | None = None,
) -> tuple[dict[str, float], dict]:
    """DM 解 → 10 g 原物质取整 → 复算 → 0.01 kg 小步修正。返回 (用量, 复算结果)。"""
    allowed = set(feeds) if allowed_ids is None else set(allowed_ids)
    discrete_amounts = _solve_discrete(feeds, req, allowed)
    if discrete_amounts is not None:
        discrete_ev = evaluate_ration(feeds, discrete_amounts, req)
        if not discrete_ev["violations"]:
            return discrete_amounts, discrete_ev

    # 极少数整数求解器异常时保留原有确定性小步修正作为降级路径。
    amounts = {
        fid: round_half_up(x_dm[fid] / feeds[fid].dm_fraction, 2)
        for fid in x_dm
        if fid in allowed
    }
    amounts = _sync_salt(feeds, amounts)
    order = [fid for fid in feeds if fid in allowed]  # 修正不得引入求解候选集外原料

    for _ in range(spec.REPAIR_MAX_ITERATIONS):
        ev = evaluate_ration(feeds, amounts, req)
        if not ev["violations"]:
            return amounts, ev
        current_score = _violation_score(ev)
        best: tuple[float, dict[str, float]] | None = None

        def consider(trial: dict[str, float]):
            nonlocal best
            trial = _sync_salt(feeds, trial)
            score = _violation_score(evaluate_ration(feeds, trial, req))
            if best is None or score < best[0]:
                best = (score, trial)

        # 单料 ±0.01 kg 移动
        for fid in order:
            if fid == "salt":
                continue
            for delta in (spec.ROUND_STEP_KG, -spec.ROUND_STEP_KG):
                trial = dict(amounts)
                new_val = round_half_up(trial.get(fid, 0.0) + delta, 2)
                if new_val < 0:
                    continue
                trial[fid] = new_val
                consider(trial)
        # 交换移动：给 a 加 0.01 kg，同时给 b 减 0.01 kg（近似保持总 DM，用于
        # 修正“总量越界但能量不足”这类单步无法解决的边界问题）
        for a in order:
            if a == "salt":
                continue
            for b in order:
                if b == a or b == "salt":
                    continue
                if amounts.get(b, 0.0) < spec.ROUND_STEP_KG:
                    continue
                trial = dict(amounts)
                trial[a] = round_half_up(trial.get(a, 0.0) + spec.ROUND_STEP_KG, 2)
                trial[b] = round_half_up(trial.get(b, 0.0) - spec.ROUND_STEP_KG, 2)
                consider(trial)
        if best is None or best[0] >= current_score:
            break
        amounts = best[1]

    ev = evaluate_ration(feeds, amounts, req)
    return amounts, ev


# ---------------------------------------------------------------- 不可行诊断

DIAGNOSIS_LABELS: dict[str, str] = {
    "dmi": "干物质采食量（目标 ±3%）",
    "feed_caps": "各原料最大用量上限",
    "me": "代谢能下限（含 5% 安全余量）",
    "cp": "粗蛋白范围（含 5% 计算余量，上限 20%DM）",
    "ndf": "NDF 范围",
    "forage": "粗饲料最低比例",
    "ca": "钙最低水平",
    "p": "磷最低水平",
    "ca_p": "钙磷比 1.5–2.0",
    "salt": "食盐固定 0.5%DM",
}


def diagnose_infeasibility(candidate: list[FeedSpec], req: Requirements) -> list[dict]:
    """逐个去掉一组约束求解；去掉后可行说明该组是阻塞源之一。"""
    base = _build_and_solve(candidate, req, skip=set())
    reasons: list[dict] = []
    if base.feasible:
        return reasons
    for group in DIAGNOSIS_LABELS:
        relaxed = _build_and_solve(candidate, req, skip={group})
        if relaxed.feasible:
            reasons.append({
                "code": group,
                "message": f"约束组「{DIAGNOSIS_LABELS[group]}」无法在当前原料集合下同时满足"
                           f"（去掉该约束后配方可解）。请增加相应原料或咨询营养师/兽医复核。",
            })
    if not reasons:
        reasons.append({
            "code": "combined",
            "message": "多个约束相互制约导致整体不可行，请增加可选原料范围或降低生产目标后重试。",
        })
    return reasons



def build_nutrient_status(
    feeds: dict[str, FeedSpec],
    amounts: dict[str, float],
    req: Requirements,
    ev: dict,
) -> list[dict]:
    """逐项营养指标的目标文本、实际值与达标状态（用取整后用量复算）。"""
    n = ev["nutrients"]
    viol_codes = {v["code"] for v in ev["violations"]}
    items: list[tuple[str, str, str, float | None, str, str]] = [
        ("dmi", "干物质采食量", f"目标 {req.dmi_target_kg:.2f} kg/d，允许 ±{spec.DMI_TOLERANCE*100:.0f}%",
         n["dmi_kg"], "kg/d", "dmi_band"),
        ("me", "代谢能", f"≥ {req.me_requirement_mj:.2f} MJ/d（含 5% 安全余量）",
         n["me_mj"], "MJ/d", "me_min"),
        ("cp", "粗蛋白", f"{req.cp_min_pct:.1f}–{req.cp_max_pct:.1f} %DM（宏量代理指标）",
         n["cp_pct_dm"], "%DM", "cp_band"),
        ("ndf", "NDF", f"{req.ndf_min_pct:.0f}–{req.ndf_max_pct:.0f} %DM",
         n["ndf_pct_dm"], "%DM", "ndf_band"),
        ("forage", "粗饲料比例", f"≥ {req.forage_min_frac*100:.0f} %DM",
         n["forage_pct_dm"], "%DM", "forage_ratio"),
        ("ca", "钙", f"≥ {req.ca_min_pct:.2f} %DM",
         n["ca_pct_dm"], "%DM", "ca_min"),
        ("p", "磷", f"≥ {req.p_min_pct:.2f} %DM",
         n["p_pct_dm"], "%DM", "p_min"),
        ("ca_p", "钙磷比", f"{req.ca_p_ratio_min:.1f}–{req.ca_p_ratio_max:.1f}",
         n["ca_p_ratio"], "", "ca_p_ratio"),
        ("salt", "食盐", f"固定 {req.salt_fraction*100:.1f} %DM（取整容差 ±5 g）",
         n["salt_kg"], "kg/d", "salt"),
    ]
    out = []
    for key, label, target, actual, unit, code in items:
        out.append({
            "key": key, "label": label, "target": target, "actual": actual,
            "unit": unit, "pass": code not in viol_codes,
        })
    return out

# ---------------------------------------------------------------- 尽力解（approximate）

# 尽力解目标权重（营养优先，成本仅作确定性平局）。每个松弛变量 s_k 的含义是
# “该目标缺失量 ÷ 该目标自身的参考值（目标 DMI 或需求值）”，因此权重可直接相加：
#   - DMI 是规划硬约束，只在数学上无法满足时才放松，权重最高；
#   - ME/CP/NDF/粗饲料/Ca/P/Ca:P/食盐 按 1.0 计；
#   - 单料上限在尽力解中允许突破（否则单一原料无法成方），但按 0.5 计入代价。
_FALLBACK_WEIGHTS = {
    "dmi": 3.0,
    "me": 1.0,
    "cp": 1.0,
    "ndf": 1.0,
    "forage": 1.0,
    "ca": 1.0,
    "p": 1.0,
    "ca_p": 1.0,
    "salt": 1.0,
    "feed_cap": 0.5,
}
# 成本权重极小：只在营养得分相同量级时做确定性平局，绝不影响营养排序。
_FALLBACK_COST_WEIGHT = 1e-6


def _best_effort_amounts(
    feeds: dict[str, FeedSpec],
    allowed_ids: set[str],
    req: Requirements,
) -> dict[str, float] | None:
    """尽力解：10 g 整数、营养优先、成本仅作平局，且只在勾选集合内取原料。

    返回 10 g 整数倍的原物质用量（kg/只/天）；求解器灾难性失败时返回 None。
    """
    candidate = [feeds[fid] for fid in sorted(allowed_ids)]
    if not candidate:
        return None
    # 仅矿物质：不做大规模求解，直接给每个矿物质一个 10 g 显示步长的小剂量
    # 诊断配比（绝不生成公斤级盐/石粉）；严重缺失由 evaluate_ration 如实报告。
    if all(f.category == "mineral" for f in candidate):
        return {f.id: spec.ROUND_STEP_KG for f in candidate}

    step = spec.ROUND_STEP_KG
    n = len(candidate)
    dm = np.array([step * f.dm_fraction for f in candidate], dtype=float)   # kgDM / 10g 单位
    me = np.array([f.me_mj_per_kg_dm for f in candidate], dtype=float) * dm
    cp = np.array([f.cp_pct_dm for f in candidate], dtype=float) * dm
    ndf = np.array([f.ndf_pct_dm for f in candidate], dtype=float) * dm
    ca = np.array([f.ca_pct_dm for f in candidate], dtype=float) * dm
    phos = np.array([f.p_pct_dm for f in candidate], dtype=float) * dm
    forage = np.array([dm[i] if f.is_forage else 0.0 for i, f in enumerate(candidate)], dtype=float)
    salt_vec = np.array([dm[i] if f.id == "salt" else 0.0 for i, f in enumerate(candidate)], dtype=float)
    caps = np.array([f.max_usage_pct_dm / 100.0 for f in candidate], dtype=float)

    T_target = req.dmi_target_kg

    # 松弛变量（全部连续、非负；下标固定以保证确定性）：
    #   0 me, 1 cp_low, 2 cp_high, 3 ndf_low, 4 ndf_high, 5 forage,
    #   6 ca, 7 p, 8 cap_low, 9 cap_high, 10 salt_plus, 11 salt_minus,
    #   12..12+n-1 各原料上限，最后 2 个 dmi_low/dmi_high（仅 DMI 放松阶段使用）。
    n_slack = 12 + n + 2
    total_vars = n + n_slack
    dmi_low_idx = 12 + n
    dmi_high_idx = 12 + n + 1

    def slack_index(offset: int) -> int:
        return n + offset

    rows: list[np.ndarray] = []
    lower: list[float] = []
    upper: list[float] = []

    def add(coeff: list[float], lb: float = -np.inf, ub: float = np.inf) -> None:
        row = np.zeros(total_vars, dtype=float)
        for i, v in enumerate(coeff):
            if v != 0.0:
                row[i] = v
        rows.append(row)
        lower.append(lb)
        upper.append(ub)

    # 至少 1 个 10 g 单位，保证非空配比
    add([1.0] * n + [0.0] * n_slack, lb=1.0)

    # ME：Σ me_i x_i + s_me·me_req ≥ me_req
    coeff = list(me) + [0.0] * n_slack
    coeff[slack_index(0)] = req.me_requirement_mj
    add(coeff, lb=req.me_requirement_mj)

    def add_pct_band(values: np.ndarray, lo: float, hi: float, s_low: int, s_high: int) -> None:
        # Σ (v_i - lo·dm_i) x_i + s_low·lo·T_target ≥ 0
        coeff = list(values - lo * dm) + [0.0] * n_slack
        coeff[slack_index(s_low)] = lo * T_target
        add(coeff, lb=0.0)
        # Σ (hi·dm_i - v_i) x_i + s_high·hi·T_target ≥ 0
        coeff = list(hi * dm - values) + [0.0] * n_slack
        coeff[slack_index(s_high)] = hi * T_target
        add(coeff, lb=0.0)

    add_pct_band(cp, req.cp_min_pct, req.cp_max_pct, 1, 2)
    add_pct_band(ndf, req.ndf_min_pct, req.ndf_max_pct, 3, 4)

    # 粗饲料比例
    coeff = list(forage - req.forage_min_frac * dm) + [0.0] * n_slack
    coeff[slack_index(5)] = req.forage_min_frac * T_target
    add(coeff, lb=0.0)

    # Ca / P 下限
    coeff = list(ca - req.ca_min_pct * dm) + [0.0] * n_slack
    coeff[slack_index(6)] = req.ca_min_pct * T_target
    add(coeff, lb=0.0)
    coeff = list(phos - req.p_min_pct * dm) + [0.0] * n_slack
    coeff[slack_index(7)] = req.p_min_pct * T_target
    add(coeff, lb=0.0)

    # Ca:P = 1.5–2.0（Ca 与 P 同为 %DM·kgDM 单位，可在线性约束中直接相减）
    coeff = list(ca - spec.CAP_RATIO_MIN * phos) + [0.0] * n_slack
    coeff[slack_index(8)] = spec.CAP_RATIO_MIN * req.p_min_pct * T_target
    add(coeff, lb=0.0)
    coeff = list(spec.CAP_RATIO_MAX * phos - ca) + [0.0] * n_slack
    coeff[slack_index(9)] = spec.CAP_RATIO_MAX * req.p_min_pct * T_target
    add(coeff, lb=0.0)

    # 食盐：尽力贴近 0.5% 实际干物质（线性化），并受“0.5% 目标 DMI + 5 g”硬上界
    if salt_vec.any():
        add(list(salt_vec) + [0.0] * n_slack,
            ub=spec.SALT_FRACTION * T_target + spec.SALT_TOLERANCE_KG)
        coeff = list(salt_vec - spec.SALT_FRACTION * dm) + [0.0] * n_slack
        coeff[slack_index(10)] = -spec.SALT_FRACTION * T_target
        add(coeff, ub=0.0)
        coeff = list(spec.SALT_FRACTION * dm - salt_vec) + [0.0] * n_slack
        coeff[slack_index(11)] = -spec.SALT_FRACTION * T_target
        add(coeff, ub=0.0)

    # 石灰石：硬上界 = 2% 目标 DMI + 一个 10 g 步长
    limestone_idx = [i for i, f in enumerate(candidate) if f.id == "limestone"]
    if limestone_idx:
        coeff = [0.0] * total_vars
        coeff[limestone_idx[0]] = dm[limestone_idx[0]]
        add(coeff, ub=spec.LIMESTONE_FALLBACK_MAX_PCT_DM / 100.0 * T_target + spec.ROUND_STEP_KG)

    # 单料上限：软约束（尽力解允许突破，但按 0.5 权重计代价）
    for i in range(n):
        coeff = [-caps[i] * dm[j] for j in range(n)]
        coeff[i] += dm[i]
        coeff = coeff + [0.0] * n_slack
        coeff[slack_index(12 + i)] = -caps[i] * T_target
        add(coeff, ub=0.0)

    # 目标：营养得分（归一化松弛加权和）+ 极小成本平局项
    obj = np.zeros(total_vars, dtype=float)
    for i in range(n):
        obj[i] = _FALLBACK_COST_WEIGHT * step * candidate[i].default_price_rmb_per_kg
    slack_weights = {
        0: _FALLBACK_WEIGHTS["me"],
        1: _FALLBACK_WEIGHTS["cp"], 2: _FALLBACK_WEIGHTS["cp"],
        3: _FALLBACK_WEIGHTS["ndf"], 4: _FALLBACK_WEIGHTS["ndf"],
        5: _FALLBACK_WEIGHTS["forage"],
        6: _FALLBACK_WEIGHTS["ca"],
        7: _FALLBACK_WEIGHTS["p"],
        8: _FALLBACK_WEIGHTS["ca_p"], 9: _FALLBACK_WEIGHTS["ca_p"],
        10: _FALLBACK_WEIGHTS["salt"], 11: _FALLBACK_WEIGHTS["salt"],
        dmi_low_idx: _FALLBACK_WEIGHTS["dmi"], dmi_high_idx: _FALLBACK_WEIGHTS["dmi"],
    }
    for idx, w in slack_weights.items():
        obj[slack_index(idx)] = w
    for i in range(n):
        obj[slack_index(12 + i)] = _FALLBACK_WEIGHTS["feed_cap"]

    t_row = list(dm) + [0.0] * n_slack  # T = Σ dm_i x_i

    def solve(dmi_hard: bool) -> dict[str, float] | None:
        r = list(rows)
        lo = list(lower)
        hi = list(upper)
        if dmi_hard:
            r.append(np.array(t_row, dtype=float))
            lo.append(req.dmi_min_kg)
            hi.append(req.dmi_max_kg)
        else:
            row_low = list(t_row)
            row_low[slack_index(dmi_low_idx)] = T_target
            r.append(np.array(row_low, dtype=float))
            lo.append(req.dmi_min_kg)
            hi.append(np.inf)
            row_high = list(t_row)
            row_high[slack_index(dmi_high_idx)] = -T_target
            r.append(np.array(row_high, dtype=float))
            lo.append(-np.inf)
            hi.append(req.dmi_max_kg)
        result = milp(
            c=obj,
            integrality=np.array([1] * n + [0] * n_slack, dtype=int),
            bounds=Bounds(np.zeros(total_vars), np.full(total_vars, np.inf)),
            constraints=LinearConstraint(np.vstack(r), np.array(lo), np.array(hi)),
            options={"time_limit": 10.0, "mip_rel_gap": 0.0},
        )
        if not result.success or result.x is None:
            return None
        amounts: dict[str, float] = {}
        for feed, units in zip(candidate, result.x[:n], strict=True):
            amount = round_half_up(float(units) * step, 2)
            if amount > 0:
                amounts[feed.id] = amount
        return amounts

    # 含非矿物质原料时优先把 DMI ±3% 作为硬约束；数学上不可行才放松 DMI。
    amounts = solve(dmi_hard=True)
    if amounts is None:
        amounts = solve(dmi_hard=False)
    return amounts


def _build_feed_rows(
    feeds: dict[str, FeedSpec],
    amounts: dict[str, float],
    selected_set: set[str],
) -> list[dict]:
    """把 10 g 整数用量转成展示行；只输出用量 > 0 的勾选原料。"""
    rows = []
    for fid in sorted(amounts, key=lambda k: (feeds[k].category, feeds[k].id)):
        amt = amounts[fid]
        if amt <= 0:
            continue
        f = feeds[fid]
        rows.append({
            "feed_id": fid,
            "name": f.name,
            "category": f.category,
            "owned": fid in selected_set,
            "purchased": False,
            "as_fed_kg": round_half_up(amt, 2),
            "dm_kg": round_half_up(_dm(amt, f), 3),
            "price_rmb_per_kg": round_half_up(f.default_price_rmb_per_kg, 4),
            "cost_rmb": round_half_up(amt * f.default_price_rmb_per_kg, 4),
        })
    return rows


def _approximate_result(
    feeds: dict[str, FeedSpec],
    amounts: dict[str, float],
    req: Requirements,
    ev: dict,
    selected_set: set[str],
) -> dict:
    """构造 approximate 结果：非合格、无购买，未达标项来自最终 10 g 用量复算。"""
    mineral_only = bool(selected_set) and all(
        feeds[fid].category == "mineral" for fid in selected_set
    )
    if mineral_only:
        detail = (
            "当前只勾选了矿物质（食盐/石粉等），不能构成日粮。"
            "该结果仅为诊断用最小剂量示例，禁止直接饲喂！"
        )
        advice = (
            "请返回勾选至少一种能量/蛋白/粗饲料原料并重新计算；"
            "任何情况下都不要单独饲喂矿物质，未达标项必须由营养师或兽医复核。"
        )
    else:
        detail = (
            "仅使用当前勾选原料无法同时满足全部营养约束，"
            "这是这些原料范围内营养缺口最小的近似配比，不是合格配方；"
            "未勾选原料不会自动加入。"
        )
        advice = (
            "饲喂前必须由营养师或兽医逐项复核未达标项并补充原料；"
            "本结果不能直接作为完整日粮使用。"
        )
    return {
        "status": "approximate",
        "qualified": False,
        "feed_rows": _build_feed_rows(feeds, amounts, selected_set),
        "totals": ev["totals"],
        "nutrients": ev["nutrients"],
        "nutrient_status": build_nutrient_status(feeds, amounts, req, ev),
        "requirements": req.to_dict(),
        "purchased_ids": [],
        "violations": ev["violations"],
        "do_not_feed": mineral_only,
        "detail": detail,
        "advice": advice,
    }


# ---------------------------------------------------------------- 主入口

def optimize_ration(
    feeds: dict[str, FeedSpec],
    owned_ids: list[str],
    req: Requirements,
) -> dict:
    """两层求解：先严格勾选集合（连续 LP + 10 g 整数 + 复算）。

    严格路径不可行或取整后不达标时，退到确定性的 10 g 整数尽力解
    （approximate，营养优先、成本仅作平局、只使用勾选原料）。
    feeds 应为服务层合并了用户价格与营养覆盖后的有效原料字典；
    owned_ids 是用户明确允许用于本次配方的原料集合；未列入的原料
    不得由优化器自行加入。本函数返回可直接序列化的结果字典。
    """
    selected_unique = list(dict.fromkeys(owned_ids))  # 去重并保持顺序
    selected_set = set(selected_unique)
    candidates = [feeds[fid] for fid in selected_unique]

    outcome = _build_and_solve(candidates, req, skip=set())
    if outcome.feasible:
        amounts, ev = round_and_repair(feeds, outcome.x_dm, req, selected_set)
        if not ev["violations"]:
            return {
                "status": "feasible",
                "qualified": True,
                "feed_rows": _build_feed_rows(feeds, amounts, selected_set),
                "totals": ev["totals"],
                "nutrients": ev["nutrients"],
                "nutrient_status": build_nutrient_status(feeds, amounts, req, ev),
                "requirements": req.to_dict(),
                "purchased_ids": [],
            }

    # 尽力解：数值优化器在两层都灾难性失败时才退回旧式 infeasible 响应。
    best = _best_effort_amounts(feeds, selected_set, req)
    if best is None:
        reasons = diagnose_infeasibility(candidates, req)
        return {
            "status": "infeasible",
            "detail": "仅使用当前勾选原料无法找到满足全部约束的配方；未勾选原料不会自动加入。",
            "reasons": reasons,
            "advice": "请根据缺口自行决定是否返回勾选其他原料，或调整生产目标后重新计算；"
                      "系统不会擅自使用未勾选原料，也不会伪造可行配方。",
        }

    ev = evaluate_ration(feeds, best, req)
    return _approximate_result(feeds, best, req, ev, selected_set)