"""确定性配方解读：由最终显示用量生成结构化摘要。

本模块只读取求解后的只读结果，不参与求解，也不修改 status、qualified、
violations 等数学状态。主要能量/蛋白来源按最终显示克数的贡献量排序，
贴边约束只对已达标指标标记“余量较小”，不改变任何判定。

boundary_flags 触发公式（全部使用最终 10 g 原物质用量 + 完整原料参数复算出的
完整精度值，且仅用于产品提示；页面舍入值不得回流参与判断）：
- dmi_upper：dmi_kg >= dmi_max_kg - 0.02 * dmi_target_kg
- dmi_lower：dmi_kg <= dmi_min_kg + 0.02 * dmi_target_kg
- me_min：me_mj - me_requirement_mj <= 0.02 * me_requirement_mj
- cp/ndf 上下限、forage_lower：余量 <= 1.0 个百分点
- ca/p 下限、ca_p 上下限：余量分别 <= 0.1 个百分点 / 0.05
- feed_cap:<feed_id>：dm_share_pct = as_fed_kg * dm_fraction / total_dm_kg * 100，
  触发条件为 dm_share_pct <= max_usage_pct_dm 且 max_usage_pct_dm - dm_share_pct <= 1.0。
  分母 total_dm_kg 是最终配方复算出的日粮总 DM，不是 dmi_target_kg。
"""
from __future__ import annotations

from typing import Any

from .optimizer import compute_ration_metrics

RATION_INSIGHTS_VERSION = "1.1"

SCOPE_NOTICE = (
    "当前模型仅计算代谢能、粗蛋白、NDF、钙、磷等宏量指标，不计算并保证维生素、"
    "微量元素及可代谢蛋白完整满足，因此不能据此认定为完整、长期、全价日粮。"
)

TOP_SOURCES = 3

BOUNDARY_DMI_MARGIN_FRACTION = 0.02
BOUNDARY_ME_MARGIN_FRACTION = 0.02
BOUNDARY_PCT_MARGIN_POINTS = 1.0
BOUNDARY_MINERAL_MARGIN_POINTS = 0.1
BOUNDARY_CA_P_RATIO_MARGIN = 0.05
BOUNDARY_FEED_CAP_MARGIN_POINTS = 1.0


def _contribution_shares(
    rows: list[dict],
    feeds: dict[str, Any],
    metric: str,
) -> list[dict]:
    """按最终显示用量计算 ME/CP 贡献量，返回完整排序来源列表。"""
    contributions: list[tuple[str, str, float]] = []
    for row in rows:
        feed = feeds.get(row["feed_id"])
        if feed is None:
            continue
        dm_kg = row["as_fed_kg"] * feed.dm_fraction
        if metric == "me":
            value = dm_kg * feed.me_mj_per_kg_dm
        else:
            value = dm_kg * (feed.cp_pct_dm / 100.0)
        if value > 0:
            contributions.append((row["feed_id"], row["name"], value))

    total = sum(value for _, _, value in contributions) or 1.0
    out: list[dict] = []
    for feed_id, name, value in sorted(
        contributions, key=lambda item: (-item[2], item[0])
    ):
        out.append(
            {
                "feed_id": feed_id,
                "name": name,
                "contribution": round(value, 4),
                "share_pct": round(value / total * 100, 1),
            }
        )
    return out


def _add_flag(flags: list[dict], code: str, label: str, detail: str) -> None:
    flags.append({"code": code, "label": label, "detail": detail, "metric": code.split(":", 1)[0]})


def _add_metric_flag(
    flags: list[dict],
    code: str,
    label: str,
    detail: str,
    metric: str,
    value: float,
    limit: float,
    margin: float,
    unit: str,
    margin_pct: float | None = None,
) -> None:
    flag: dict = {
        "code": code,
        "label": label,
        "detail": detail,
        "metric": metric,
        "value": value,
        "limit": limit,
        "margin": margin,
        "unit": unit,
    }
    if margin_pct is not None:
        flag["margin_pct"] = margin_pct
    flags.append(flag)


def _boundary_flags(
    rows: list[dict],
    feeds: dict[str, Any],
    raw: dict,
    nutrient_status: list[dict],
    requirements: dict,
) -> list[dict]:
    """标记“已达标但余量较小”的约束，仅用于解释，不改变判定。"""
    flags: list[dict] = []
    status = {item["key"]: item for item in nutrient_status}
    target = requirements["dmi_target_kg"]

    dmi = raw["total_dm_kg"]
    if status.get("dmi", {}).get("pass") and dmi is not None and target:
        if dmi >= requirements["dmi_max_kg"] - BOUNDARY_DMI_MARGIN_FRACTION * target:
            diff = requirements["dmi_max_kg"] - dmi
            _add_metric_flag(
                flags,
                "dmi_upper",
                "干物质采食量接近上限",
                f"实际 {dmi:.3f} kg/d，距上限 {requirements['dmi_max_kg']:.3f} kg/d "
                f"仅 {diff:.3f} kg，余量不超过目标采食量的 2%。",
                "dmi",
                dmi,
                requirements["dmi_max_kg"],
                diff,
                "kg/d",
                diff / target * 100 if target else None,
            )
        elif dmi <= requirements["dmi_min_kg"] + BOUNDARY_DMI_MARGIN_FRACTION * target:
            diff = dmi - requirements["dmi_min_kg"]
            _add_metric_flag(
                flags,
                "dmi_lower",
                "干物质采食量接近下限",
                f"实际 {dmi:.3f} kg/d，距下限 {requirements['dmi_min_kg']:.3f} kg/d "
                f"仅 {diff:.3f} kg，余量不超过目标采食量的 2%。",
                "dmi",
                dmi,
                requirements["dmi_min_kg"],
                diff,
                "kg/d",
                diff / target * 100 if target else None,
            )

    me = raw["me_mj"]
    me_req = requirements["me_requirement_mj"]
    if status.get("me", {}).get("pass") and me is not None and me_req:
        if me - me_req <= BOUNDARY_ME_MARGIN_FRACTION * me_req:
            _add_metric_flag(
                flags,
                "me_min",
                "代谢能接近需求下限",
                f"实际 {me:.3f} MJ/d，高于需求下限 {me_req:.3f} MJ/d 的余量不超过 2%。",
                "me",
                me,
                me_req,
                me - me_req,
                "MJ/d",
                (me - me_req) / me_req * 100,
            )

    for key, label, lower_key, upper_key, threshold in (
        ("cp", "粗蛋白", "cp_min_pct", "cp_max_pct", BOUNDARY_PCT_MARGIN_POINTS),
        ("ndf", "NDF", "ndf_min_pct", "ndf_max_pct", BOUNDARY_PCT_MARGIN_POINTS),
    ):
        actual = raw[f"{key}_pct_dm"]
        if not status.get(key, {}).get("pass") or actual is None:
            continue
        lower = requirements[lower_key]
        upper = requirements[upper_key]
        if actual - lower <= threshold:
            _add_metric_flag(
                flags,
                f"{key}_lower",
                f"{label}接近下限",
                f"实际 {actual:.2f}%DM，距下限 {lower:.2f}%DM 余量不超过 {threshold:.0f} 个百分点。",
                key,
                actual,
                lower,
                actual - lower,
                "percentage_point",
            )
        if upper - actual <= threshold:
            _add_metric_flag(
                flags,
                f"{key}_upper",
                f"{label}接近上限",
                f"实际 {actual:.2f}%DM，距上限 {upper:.2f}%DM 余量不超过 {threshold:.0f} 个百分点。",
                key,
                actual,
                upper,
                upper - actual,
                "percentage_point",
            )

    forage = raw["forage_pct_dm"]
    forage_min = requirements["forage_min_frac"] * 100
    if status.get("forage", {}).get("pass") and forage is not None:
        if forage - forage_min <= BOUNDARY_PCT_MARGIN_POINTS:
            _add_metric_flag(
                flags,
                "forage_lower",
                "粗饲料比例接近下限",
                f"实际 {forage:.2f}%DM，距下限 {forage_min:.0f}%DM 余量不超过 1 个百分点。",
                "forage",
                forage,
                forage_min,
                forage - forage_min,
                "percentage_point",
            )

    for key, label, lower_key, threshold in (
        ("ca", "钙", "ca_min_pct", BOUNDARY_MINERAL_MARGIN_POINTS),
        ("p", "磷", "p_min_pct", BOUNDARY_MINERAL_MARGIN_POINTS),
    ):
        actual = raw[f"{key}_pct_dm"]
        lower = requirements[lower_key]
        if status.get(key, {}).get("pass") and actual is not None:
            if actual - lower <= threshold:
                _add_metric_flag(
                    flags,
                    f"{key}_lower",
                    f"{label}接近下限",
                    f"实际 {actual:.2f}%DM，距下限 {lower:.2f}%DM 余量不超过 {threshold:.1f} 个百分点。",
                    key,
                    actual,
                    lower,
                    actual - lower,
                    "percentage_point",
                )

    cap = raw["ca_p_ratio"]
    if status.get("ca_p", {}).get("pass") and cap is not None:
        cap_min = requirements["ca_p_ratio_min"]
        cap_max = requirements["ca_p_ratio_max"]
        if cap - cap_min <= BOUNDARY_CA_P_RATIO_MARGIN:
            _add_metric_flag(
                flags,
                "ca_p_lower",
                "钙磷比接近下限",
                f"实际 {cap:.2f}，距下限 {cap_min:.1f} 余量不超过 0.05。",
                "ca_p",
                cap,
                cap_min,
                cap - cap_min,
                "ratio",
            )
        if cap_max - cap <= BOUNDARY_CA_P_RATIO_MARGIN:
            _add_metric_flag(
                flags,
                "ca_p_upper",
                "钙磷比接近上限",
                f"实际 {cap:.2f}，距上限 {cap_max:.1f} 余量不超过 0.05。",
                "ca_p",
                cap,
                cap_max,
                cap_max - cap,
                "ratio",
            )

    total_dm = raw.get("total_dm_kg") or 0.0
    for row in rows:
        feed = feeds.get(row["feed_id"])
        if feed is None or total_dm <= 0:
            continue
        dm_share = row["as_fed_kg"] * feed.dm_fraction / total_dm * 100
        cap_pct = feed.max_usage_pct_dm
        if dm_share <= cap_pct and cap_pct - dm_share <= BOUNDARY_FEED_CAP_MARGIN_POINTS:
            _add_metric_flag(
                flags,
                f"feed_cap:{row['feed_id']}",
                f"{row['name']}用量接近上限",
                f"实际占干物质 {dm_share:.2f}%DM，距上限 {cap_pct:.0f}%DM 余量不超过 1 个百分点。",
                "feed_cap",
                dm_share,
                cap_pct,
                cap_pct - dm_share,
                "percentage_point",
            )

    return flags


def build_ration_insights(
    feeds: dict[str, Any],
    feed_rows: list[dict],
    nutrient_status: list[dict],
    requirements: dict,
    owned_ids: list[str],
) -> dict:
    """生成确定性配方解读摘要，供前端和 AI 共用。"""
    owned = list(dict.fromkeys(owned_ids))
    amounts = {row["feed_id"]: row["as_fed_kg"] for row in feed_rows}
    raw = compute_ration_metrics(feeds, amounts)
    me_sources_all = _contribution_shares(feed_rows, feeds, "me")
    cp_sources_all = _contribution_shares(feed_rows, feeds, "cp")
    return {
        "version": RATION_INSIGHTS_VERSION,
        "selected_feed_count": len(owned),
        "used_feed_count": len(feed_rows),
        "total_dm_kg": raw["total_dm_kg"],
        "forage_dm_pct": raw["forage_pct_dm"],
        "top_me_sources": me_sources_all[:TOP_SOURCES],
        "me_sources_all": me_sources_all,
        "top_cp_sources": cp_sources_all[:TOP_SOURCES],
        "cp_sources_all": cp_sources_all,
        "boundary_flags": _boundary_flags(
            feed_rows, feeds, raw, nutrient_status, requirements
        ),
        "scope_notice": SCOPE_NOTICE,
    }
