"""ration_insights 确定性摘要测试：来源排序、贴边规则、数学状态隔离、AI 无关性。"""
from copy import deepcopy
from types import SimpleNamespace

from app import ai
from app.feeds import load_catalog
from app.insights import (
    BOUNDARY_CA_P_RATIO_MARGIN,
    BOUNDARY_DMI_MARGIN_FRACTION,
    BOUNDARY_FEED_CAP_MARGIN_POINTS,
    BOUNDARY_ME_MARGIN_FRACTION,
    BOUNDARY_MINERAL_MARGIN_POINTS,
    BOUNDARY_PCT_MARGIN_POINTS,
    SCOPE_NOTICE,
    _boundary_flags,
    _contribution_shares,
    build_ration_insights,
)
from app.main import _management_response
from app.nutrition import compute_requirements
from app.optimizer import optimize_ration


def _baseline_result():
    catalog = load_catalog()
    req = compute_requirements("lactating", 50.0, 2.5, 4.0)
    result = optimize_ration(catalog.feeds, list(catalog.feeds), req)
    return catalog, result


def _insights(catalog, result, owned_ids):
    return build_ration_insights(
        catalog.feeds,
        result["feed_rows"],
        result["nutrient_status"],
        result["requirements"],
        owned_ids,
    )


def _raw(**overrides):
    base = {
        "total_dm_kg": 2.0,
        "me_mj": 102.0,
        "cp_pct_dm": 18.5,
        "ndf_pct_dm": 30.0,
        "forage_pct_dm": 50.5,
        "ca_pct_dm": 0.66,
        "p_pct_dm": 0.36,
        "ca_p_ratio": 1.6,
    }
    base.update(overrides)
    return base


def _requirements(**overrides):
    base = {
        "dmi_target_kg": 2.0,
        "dmi_min_kg": 1.94,
        "dmi_max_kg": 2.06,
        "me_requirement_mj": 100.0,
        "cp_min_pct": 18.0,
        "cp_max_pct": 20.0,
        "ndf_min_pct": 28.0,
        "ndf_max_pct": 45.0,
        "forage_min_frac": 0.5,
        "ca_min_pct": 0.65,
        "p_min_pct": 0.35,
        "ca_p_ratio_min": 1.5,
        "ca_p_ratio_max": 2.0,
    }
    base.update(overrides)
    return base


def _boundary_case(raw, requirements, rows=(), feeds=None, passing=()):
    keys = ("dmi", "me", "cp", "ndf", "forage", "ca", "p", "ca_p")
    status = [{"key": key, "pass": key in passing} for key in keys]
    return _boundary_flags(rows, feeds or {}, raw, status, requirements)


def test_baseline_insights_structure():
    catalog, result = _baseline_result()
    insights = _insights(catalog, result, list(catalog.feeds))
    assert insights["version"] == "1.1"
    assert insights["selected_feed_count"] == 13
    assert insights["used_feed_count"] == 9
    assert round(insights["forage_dm_pct"], 2) == result["nutrients"]["forage_pct_dm"]
    assert len(insights["top_me_sources"]) == 3
    assert len(insights["top_cp_sources"]) == 3
    assert insights["top_me_sources"][0]["feed_id"] == "corn_silage"
    assert insights["top_cp_sources"][0]["feed_id"] == "soybean_meal"
    codes = {flag["code"] for flag in insights["boundary_flags"]}
    assert {
        "dmi_upper",
        "me_min",
        "forage_lower",
        "ca_lower",
        "p_lower",
        "feed_cap:rapeseed_meal",
    } <= codes
    assert insights["scope_notice"]


def test_insights_sources_are_sorted_by_contribution():
    catalog, result = _baseline_result()
    insights = _insights(catalog, result, list(catalog.feeds))
    for key in ("top_me_sources", "top_cp_sources"):
        shares = [source["share_pct"] for source in insights[key]]
        assert shares == sorted(shares, reverse=True)
        assert all(0 < share <= 100 for share in shares)
    assert insights["top_me_sources"] == insights["me_sources_all"][:3]
    assert insights["top_cp_sources"] == insights["cp_sources_all"][:3]
    assert len(insights["me_sources_all"]) == 7
    assert len(insights["cp_sources_all"]) == 7
    assert abs(sum(source["share_pct"] for source in insights["me_sources_all"]) - 100.0) < 0.5
    assert abs(sum(source["share_pct"] for source in insights["cp_sources_all"]) - 100.0) < 0.5


def test_dmi_upper_boundary_is_inclusive_at_threshold():
    req = _requirements()
    threshold = req["dmi_max_kg"] - BOUNDARY_DMI_MARGIN_FRACTION * req["dmi_target_kg"]
    assert _boundary_case(_raw(total_dm_kg=threshold), req, passing=("dmi",))[0]["code"] == "dmi_upper"
    assert _boundary_case(_raw(total_dm_kg=threshold - 1e-6), req, passing=("dmi",)) == []
    assert _boundary_case(_raw(total_dm_kg=req["dmi_max_kg"]), req, passing=("dmi",))[0]["code"] == "dmi_upper"


def test_me_min_boundary_is_inclusive_at_threshold():
    req = _requirements()
    threshold = BOUNDARY_ME_MARGIN_FRACTION * req["me_requirement_mj"]
    assert _boundary_case(_raw(me_mj=req["me_requirement_mj"] + threshold), req, passing=("me",))[0]["code"] == "me_min"
    assert _boundary_case(_raw(me_mj=req["me_requirement_mj"] + threshold + 1e-4), req, passing=("me",)) == []
    flag = _boundary_case(_raw(me_mj=102.0), req, passing=("me",))[0]
    assert flag["margin"] == 2.0
    assert flag["margin_pct"] == 2.0


def test_forage_lower_boundary_is_inclusive_at_threshold():
    req = _requirements()
    forage_min = req["forage_min_frac"] * 100
    assert _boundary_case(_raw(forage_pct_dm=forage_min + 1.0), req, passing=("forage",))[0]["code"] == "forage_lower"
    assert _boundary_case(_raw(forage_pct_dm=forage_min + 1.0001), req, passing=("forage",)) == []
    assert _boundary_case(_raw(forage_pct_dm=forage_min), req, passing=("forage",))[0]["code"] == "forage_lower"


def test_feed_cap_boundary_is_inclusive_at_threshold():
    feeds = {"corn": SimpleNamespace(dm_fraction=1.0, max_usage_pct_dm=10.0)}

    def case(as_fed_kg):
        rows = [{"feed_id": "corn", "name": "玉米", "as_fed_kg": as_fed_kg}]
        return _boundary_case(_raw(total_dm_kg=10.0), _requirements(), rows=rows, feeds=feeds)

    at_cap = case(1.0)
    assert at_cap[0]["code"] == "feed_cap:corn"
    assert at_cap[0]["margin"] == 0.0
    one_point_left = case(0.9)
    assert one_point_left[0]["code"] == "feed_cap:corn"
    assert one_point_left[0]["margin"] == 1.0
    assert case(0.89999) == []
    assert case(1.01) == []


def test_dual_lower_upper_boundary_flags_are_both_retained():
    req = _requirements(
        cp_min_pct=18.9,
        cp_max_pct=20.0,
        ndf_min_pct=28.0,
        ndf_max_pct=29.0,
        ca_p_ratio_min=1.5,
        ca_p_ratio_max=1.55,
    )
    raw = _raw(cp_pct_dm=19.5, ndf_pct_dm=28.5, ca_p_ratio=1.525)
    passing = ("cp", "ndf", "ca_p")
    codes = {flag["code"] for flag in _boundary_case(raw, req, passing=passing)}
    assert {"cp_lower", "cp_upper", "ndf_lower", "ndf_upper", "ca_p_lower", "ca_p_upper"} <= codes


def test_boundary_flags_return_deterministic_value_limit_margin():
    catalog, result = _baseline_result()
    insights = _insights(catalog, result, list(catalog.feeds))
    for flag in insights["boundary_flags"]:
        assert {"code", "label", "detail", "metric", "value", "limit", "margin", "unit"} <= set(flag)
        assert flag["margin"] >= 0
        assert flag["metric"] in {"dmi", "me", "cp", "ndf", "forage", "ca", "p", "ca_p", "feed_cap"}

    by_code = {flag["code"]: flag for flag in insights["boundary_flags"]}
    dmi = by_code["dmi_upper"]
    assert dmi["value"] == insights["total_dm_kg"]
    assert dmi["limit"] == result["requirements"]["dmi_max_kg"]
    assert abs(dmi["margin"] - (dmi["limit"] - dmi["value"])) < 1e-9
    assert dmi["unit"] == "kg/d"
    assert "margin_pct" in dmi

    me = by_code["me_min"]
    assert me["limit"] == result["requirements"]["me_requirement_mj"]
    assert abs(me["margin"] - (me["value"] - me["limit"])) < 1e-9
    assert me["unit"] == "MJ/d"
    assert "margin_pct" in me

    cap = by_code["feed_cap:rapeseed_meal"]
    assert cap["limit"] == 10.0
    assert cap["unit"] == "percentage_point"
    assert "margin_pct" not in cap


def test_insights_use_full_precision_not_rounded_display_values():
    catalog, result = _baseline_result()
    insights = _insights(catalog, result, list(catalog.feeds))
    snapshot = deepcopy(insights)

    # 即使页面舍入值被篡改，insights 也只按完整原料参数复算，不读取显示值。
    result["nutrients"]["me_mj"] = 999.0
    result["nutrients"]["forage_pct_dm"] = 0.0
    result["nutrients"]["total_dm_kg"] = 0.0
    rebuilt = _insights(catalog, result, list(catalog.feeds))
    assert rebuilt == snapshot
    assert abs(insights["total_dm_kg"] - 2.0494) < 1e-9
    assert abs(insights["forage_dm_pct"] - 50.06343319996097) < 1e-9
    assert insights["total_dm_kg"] != result["nutrients"]["total_dm_kg"]
    assert round(insights["forage_dm_pct"], 2) == 50.06


def test_insights_never_include_unselected_feeds():
    catalog = load_catalog()
    req = compute_requirements("lactating", 50.0, 2.5, 4.0)
    selected = ["corn"]
    result = optimize_ration(catalog.feeds, selected, req)
    insights = _insights(catalog, result, selected)
    assert insights["selected_feed_count"] == 1
    assert insights["used_feed_count"] == 1
    ids = {source["feed_id"] for source in insights["top_me_sources"]}
    ids.update(source["feed_id"] for source in insights["top_cp_sources"])
    assert ids <= set(selected)


def test_boundary_thresholds_are_fixed_constants():
    assert BOUNDARY_DMI_MARGIN_FRACTION == 0.02
    assert BOUNDARY_ME_MARGIN_FRACTION == 0.02
    assert BOUNDARY_PCT_MARGIN_POINTS == 1.0
    assert BOUNDARY_MINERAL_MARGIN_POINTS == 0.1
    assert BOUNDARY_CA_P_RATIO_MARGIN == 0.05
    assert BOUNDARY_FEED_CAP_MARGIN_POINTS == 1.0


def test_contribution_shares_handle_zero_total_without_division_by_zero():
    feeds = {
        "salt": SimpleNamespace(
            dm_fraction=1.0,
            me_mj_per_kg_dm=0.0,
            cp_pct_dm=0.0,
        ),
    }
    rows = [{"feed_id": "salt", "name": "食盐", "as_fed_kg": 0.5}]
    assert _contribution_shares(rows, feeds, "me") == []
    assert _contribution_shares(rows, feeds, "cp") == []


def test_insights_do_not_mutate_math_result():
    catalog, result = _baseline_result()
    snapshot = deepcopy(result)
    insights = _insights(catalog, result, list(catalog.feeds))

    assert result == snapshot
    assert result["status"] == "feasible"
    assert result["qualified"] is True
    assert all(item["pass"] for item in result["nutrient_status"])
    assert insights["boundary_flags"]


def test_scope_notice_is_deterministic_and_ai_cannot_change_it():
    catalog, result = _baseline_result()
    insights = _insights(catalog, result, list(catalog.feeds))

    assert insights["scope_notice"] == SCOPE_NOTICE

    managed = _management_response(
        result,
        result["requirements"],
        catalog.feeds,
        list(catalog.feeds),
    )
    assert managed["ration_insights"]["scope_notice"] == SCOPE_NOTICE

    ai_payload = ai.build_ai_payload(managed, managed["requirements"])
    assert ai_payload["ration_insights"]["scope_notice"] == SCOPE_NOTICE

    ai_result = ai.validate_ai_json({
        "explanations": ["AI 解释"],
        "risks": ["AI 风险"],
        "approved": True,
        "calibration_note": "AI 校准说明",
    })
    assert "scope_notice" not in ai_result
