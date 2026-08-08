"""优化器测试：严格原料集合、不可行、价格敏感、10 g 取整复算。"""
import math
from dataclasses import replace

from app import spec
from app.feeds import load_catalog
from app.nutrition import compute_requirements
from app.optimizer import (
    evaluate_ration,
    optimize_ration,
    round_and_repair,
    round_half_up,
)


def _lactating_50kg() -> dict:
    return compute_requirements("lactating", 50.0, 2.5, 4.0)


def _maintenance_50kg() -> dict:
    return compute_requirements("maintenance", 50.0)


def test_round_half_up():
    assert round_half_up(1.005, 2) == 1.01
    assert round_half_up(0.004, 2) == 0.0
    assert round_half_up(0.996, 2) == 1.0
    assert round_half_up(0.5, 0) == 1.0


def test_acceptance_case_feasible_and_revalidated():
    catalog = load_catalog()
    req = _lactating_50kg()
    all_ids = list(catalog.feeds)
    result = optimize_ration(catalog.feeds, all_ids, req)
    assert result["status"] == "feasible", result
    # 所有显示用量均为 10 g（0.01 kg）整数倍
    for row in result["feed_rows"]:
        assert round_half_up(row["as_fed_kg"], 2) == row["as_fed_kg"]
        assert math.isclose(row["as_fed_kg"] * 100, round(row["as_fed_kg"] * 100), abs_tol=1e-6)
    # 复算结果与显示用量一致：用 feed_rows 重算总量与营养
    totals, nutrients = _recompute_from_rows(catalog, result["feed_rows"])
    assert math.isclose(totals["dm_kg"], result["totals"]["dm_kg"], abs_tol=0.01)
    assert math.isclose(totals["cost_rmb"], result["totals"]["cost_rmb"], abs_tol=0.01)
    # 全部约束达标（用取整后的显示用量复验）
    amounts = {r["feed_id"]: r["as_fed_kg"] for r in result["feed_rows"]}
    ev = evaluate_ration(catalog.feeds, amounts, req)
    assert ev["violations"] == [], ev["violations"]
    assert result["nutrients"]["me_mj"] >= req.me_requirement_mj
    # DMI 在目标 ±3% 内
    assert req.dmi_min_kg - 0.001 <= nutrients["dmi_kg"] <= req.dmi_max_kg + 0.001


def _recompute_from_rows(catalog, rows):
    amounts = {r["feed_id"]: r["as_fed_kg"] for r in rows}
    total_asfed = sum(amounts.values())
    total_dm = sum(amounts[fid] * catalog.feeds[fid].dm_fraction for fid in amounts)
    cost = sum(amounts[r["feed_id"]] * r["price_rmb_per_kg"] for r in rows)
    me = sum(catalog.feeds[fid].me_mj_per_kg_dm * amounts[fid] * catalog.feeds[fid].dm_fraction for fid in amounts)
    return {"as_fed_kg": total_asfed, "dm_kg": total_dm, "cost_rmb": cost, "me_mj": me}, {
        "dmi_kg": total_dm,
    }


def test_rounding_never_adds_unselected_feed():
    """取整与修正只能在勾选集合内进行，未勾选原料必须保持为零。"""
    catalog = load_catalog()
    req = _maintenance_50kg()
    selected = [
        "alfalfa_hay", "corn_stover", "peanut_vine",
        "sheep_grass", "oat_hay", "corn_silage", "salt",
    ]
    result = optimize_ration(catalog.feeds, selected, req)
    assert result["status"] == "feasible", result
    assert {row["feed_id"] for row in result["feed_rows"]} <= set(selected)
    assert result["purchased_ids"] == []
    assert all(row["owned"] and not row["purchased"] for row in result["feed_rows"])


def test_post_rounding_revalidation_does_not_hide_small_shortfalls():
    """最终显示值必须真正达标，不能用 0.15 MJ/0.30 百分点容差掩盖短缺。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result["status"] == "feasible", result
    amounts = {row["feed_id"]: row["as_fed_kg"] for row in result["feed_rows"]}
    actual = result["nutrients"]

    me_short = replace(req, me_requirement_mj=actual["me_mj"] + 0.01)
    me_ev = evaluate_ration(catalog.feeds, amounts, me_short)
    assert "me_min" in {v["code"] for v in me_ev["violations"]}

    ca_short = replace(req, ca_min_pct=actual["ca_pct_dm"] + 0.01)
    ca_ev = evaluate_ration(catalog.feeds, amounts, ca_short)
    assert "ca_min" in {v["code"] for v in ca_ev["violations"]}


def test_high_production_returns_approximate_with_visible_gaps():
    """高生产需求下严格解不可行：必须返回 approximate 且列出未达标项。"""
    catalog = load_catalog()
    req = compute_requirements("lactating", 90.0, 5.0, 7.0)
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result["status"] == "approximate", result
    assert result["qualified"] is False
    assert result["violations"], "近似配比必须列出结构化未达标项"
    assert result["advice"]
    assert result["feed_rows"]


def test_maintenance_feasible():
    catalog = load_catalog()
    req = _maintenance_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result["status"] == "feasible", result
    amounts = {r["feed_id"]: r["as_fed_kg"] for r in result["feed_rows"]}
    ev = evaluate_ration(catalog.feeds, amounts, req)
    assert ev["violations"] == [], ev["violations"]


def test_price_sensitivity():
    catalog = load_catalog()
    req = _lactating_50kg()
    cheap = dict(catalog.feeds)
    expensive = dict(catalog.feeds)
    from dataclasses import replace
    cheap["corn"] = replace(catalog.feeds["corn"], default_price_rmb_per_kg=0.1)
    expensive["corn"] = replace(catalog.feeds["corn"], default_price_rmb_per_kg=9.9)
    r1 = optimize_ration(cheap, list(catalog.feeds), req)
    r2 = optimize_ration(expensive, list(catalog.feeds), req)
    assert r1["status"] == "feasible" and r2["status"] == "feasible"
    # 营养约束两种价格下都达标
    for result in (r1, r2):
        amounts = {r["feed_id"]: r["as_fed_kg"] for r in result["feed_rows"]}
        ev = evaluate_ration(catalog.feeds, amounts, req)
        assert ev["violations"] == [], ev["violations"]
    # 玉米价格显著不同时，成本或配方应不同（至少成本不同）
    assert abs(r1["totals"]["cost_rmb"] - r2["totals"]["cost_rmb"]) > 0.01


def test_salt_is_fixed_05pct():
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    salt_rows = [r for r in result["feed_rows"] if r["feed_id"] == "salt"]
    assert salt_rows, "方案必须包含食盐"
    salt_dm = salt_rows[0]["dm_kg"]
    assert abs(salt_dm - 0.005 * result["totals"]["dm_kg"]) <= 0.005


def test_round_and_repair_deterministic():
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    # 同样的输入两次结果完全一致（确定性）
    result2 = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result == result2


def test_nutrient_status_all_pass_for_acceptance():
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result["status"] == "feasible"
    status = {s["key"]: s for s in result["nutrient_status"]}
    for key, item in status.items():
        assert item["pass"] is True, f"{key}: {item}"
    assert set(status.keys()) >= {"dmi", "me", "cp", "ndf", "forage", "ca", "p", "ca_p", "salt"}
    assert status["cp"]["actual"] == result["nutrients"]["cp_pct_dm"]
    assert set(status.keys()) >= {"dmi", "me", "cp", "ndf", "forage", "ca", "p", "ca_p", "salt"}
    assert status["cp"]["actual"] == result["nutrients"]["cp_pct_dm"]


# ---------------------------------------------------------------- 尽力解（approximate）


def test_corn_only_returns_approximate_with_only_corn():
    """仅勾选玉米：strict 不可行时返回 approximate，只含玉米、未达标项可见。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, ["corn"], req)
    assert result["status"] == "approximate", result
    assert result["qualified"] is False
    assert result["feed_rows"], "近似配比必须有至少一行原料"
    assert {row["feed_id"] for row in result["feed_rows"]} == {"corn"}
    assert result["purchased_ids"] == []
    assert all(row["owned"] and not row["purchased"] for row in result["feed_rows"])
    assert any(not s["pass"] for s in result["nutrient_status"]), "未达标项必须显示在营养状态中"
    assert result["violations"], "近似配比必须列出结构化未达标项"
    assert "未勾选原料不会自动加入" in result["detail"]
    assert result["advice"]
    for row in result["feed_rows"]:
        assert math.isclose(row["as_fed_kg"] * 100, round(row["as_fed_kg"] * 100), abs_tol=1e-6)


def test_roughage_only_returns_approximate_with_visible_gaps():
    """仅勾选粗饲料（无精料/无食盐）：approximate，输出只含勾选原料，磷等缺口可见。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    selected = ["alfalfa_hay", "corn_stover"]
    result = optimize_ration(catalog.feeds, selected, req)
    assert result["status"] == "approximate", result
    assert result["feed_rows"]
    assert {row["feed_id"] for row in result["feed_rows"]} <= set(selected)
    assert result["purchased_ids"] == []
    codes = {v["code"] for v in result["violations"]}
    # 粗饲料集合无法满足食盐固定比例，且磷/能量等缺口必须可见
    assert "salt" in codes
    assert codes & {"p_min", "me_min", "ca_p_ratio"}, codes


def test_mineral_only_never_outputs_bulk_minerals():
    """仅勾选食盐（或盐+石粉）：approximate + 禁止饲喂，且盐/石粉受保守上界约束。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    salt_ub = spec.SALT_FRACTION * req.dmi_target_kg + spec.SALT_TOLERANCE_KG
    limestone_ub = spec.LIMESTONE_FALLBACK_MAX_PCT_DM / 100 * req.dmi_target_kg + spec.ROUND_STEP_KG

    for selected in (["salt"], ["salt", "limestone"]):
        result = optimize_ration(catalog.feeds, selected, req)
        assert result["status"] == "approximate", result
        assert result["qualified"] is False
        assert result["do_not_feed"] is True
        assert result["feed_rows"]
        amounts = {row["feed_id"]: row["as_fed_kg"] for row in result["feed_rows"]}
        assert amounts.get("salt", 0.0) <= salt_ub + 1e-9
        assert amounts.get("limestone", 0.0) <= limestone_ub + 1e-9
        assert amounts.get("salt", 0.0) < 0.5, "绝不能输出公斤级食盐"
        assert "me_min" in {v["code"] for v in result["violations"]}
        assert "dmi_band" in {v["code"] for v in result["violations"]}


def test_full_selection_stays_feasible_and_qualified():
    """全选正常验收案例：保持 feasible，且 qualified=true。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    assert result["status"] == "feasible", result
    assert result["qualified"] is True
    amounts = {row["feed_id"]: row["as_fed_kg"] for row in result["feed_rows"]}
    ev = evaluate_ration(catalog.feeds, amounts, req)
    assert ev["violations"] == [], ev["violations"]


def test_approximate_is_deterministic_and_10g():
    """同样的输入两次结果一致（确定性），且全部用量是 10 g 整数倍。"""
    catalog = load_catalog()
    req = _lactating_50kg()
    r1 = optimize_ration(catalog.feeds, ["corn"], req)
    r2 = optimize_ration(catalog.feeds, ["corn"], req)
    assert r1 == r2
    for row in r1["feed_rows"]:
        assert round_half_up(row["as_fed_kg"], 2) == row["as_fed_kg"]
        assert math.isclose(row["as_fed_kg"] * 100, round(row["as_fed_kg"] * 100), abs_tol=1e-6)