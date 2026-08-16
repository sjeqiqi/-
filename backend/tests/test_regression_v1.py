"""V1.0 数学结果回归基线（V1.1 只改展示层，不得改变这些数值）。"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _baseline_payload():
    owned = [
        "corn", "wheat_bran", "soybean_meal", "rapeseed_meal", "peanut_meal",
        "alfalfa_hay", "corn_stover", "peanut_vine", "sheep_grass", "oat_hay",
        "corn_silage", "salt", "limestone",
    ]
    return {
        "animal": {
            "class": "lactating",
            "body_weight_kg": 50,
            "milk_kg": 2.5,
            "milk_fat_percent": 4,
        },
        "feeds": [{"feed_id": fid, "owned": True} for fid in owned],
    }


def test_v10_baseline_math_result_is_unchanged():
    r = client.post("/api/rations/calculate", json=_baseline_payload())
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["status"] == "feasible"
    assert data["qualified"] is True
    assert data["totals"] == {"as_fed_kg": 4.46, "dm_kg": 2.049, "cost_rmb": 4.762}
    assert data["nutrients"] == {
        "total_dm_kg": 2.049,
        "dmi_kg": 2.049,
        "dmi_pct_of_target": 103.0,
        "me_mj": 23.613,
        "me_density_mj_per_kg_dm": 11.522,
        "cp_pct_dm": 17.22,
        "ndf_pct_dm": 33.0,
        "ca_pct_dm": 0.65,
        "p_pct_dm": 0.35,
        "ca_p_ratio": 1.86,
        "forage_pct_dm": 50.06,
        "salt_kg": 0.01,
    }

    expected_rows = {
        "corn_silage": 3.24,
        "corn": 0.39,
        "soybean_meal": 0.35,
        "rapeseed_meal": 0.23,
        "wheat_bran": 0.11,
        "peanut_vine": 0.06,
        "peanut_meal": 0.05,
        "limestone": 0.02,
        "salt": 0.01,
    }
    assert {row["feed_id"]: row["as_fed_kg"] for row in data["feed_rows"]} == expected_rows
    assert {row["feed_id"] for row in data["feed_rows"]} == set(expected_rows)
    assert all(row["owned"] for row in data["feed_rows"])
    assert all(item["pass"] for item in data["nutrient_status"])
    assert data["rounding"] == {"step_kg": 0.01, "revalidated": True}


def test_v10_baseline_insights_are_deterministic():
    r = client.post("/api/rations/calculate", json=_baseline_payload())
    data = r.json()
    insights = data["ration_insights"]
    assert insights["version"] == "1.1"
    assert insights["selected_feed_count"] == 13
    assert insights["used_feed_count"] == 9
    assert abs(insights["total_dm_kg"] - 2.0494) < 1e-9
    assert round(insights["forage_dm_pct"], 2) == 50.06
    assert len(insights["me_sources_all"]) == 7
    assert len(insights["cp_sources_all"]) == 7
    assert insights["top_me_sources"] == insights["me_sources_all"][:3]
    assert insights["top_cp_sources"] == insights["cp_sources_all"][:3]
    assert insights["top_me_sources"][0]["name"] == "全株玉米青贮"
    assert insights["top_cp_sources"][0]["name"] == "豆粕"

    codes = {flag["code"] for flag in insights["boundary_flags"]}
    assert codes == {
        "dmi_upper",
        "me_min",
        "forage_lower",
        "ca_lower",
        "p_lower",
        "feed_cap:rapeseed_meal",
    }
    for flag in insights["boundary_flags"]:
        assert {"code", "label", "detail", "metric", "value", "limit", "margin", "unit"} <= set(flag)
        if flag["code"] in ("dmi_upper", "me_min"):
            assert "margin_pct" in flag
