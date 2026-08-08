"""API 测试：健康检查、原料列表、4xx 校验、可行/不可行、AI 校准。"""
from fastapi.testclient import TestClient

from app import ai
from app.main import app

client = TestClient(app)


def _lactating_payload(owned=None, **feeds_overrides):
    owned = owned or [
        "corn", "wheat_bran", "soybean_meal", "rapeseed_meal", "peanut_meal",
        "alfalfa_hay", "corn_stover", "peanut_vine", "sheep_grass", "oat_hay",
        "corn_silage", "salt", "limestone",
    ]
    feeds = [{"feed_id": fid, "owned": fid in owned} for fid in owned]
    return {"animal": {"class": "lactating", "body_weight_kg": 50, "milk_kg": 2.5}, "feeds": feeds}


def _maint_payload():
    return {"animal": {"class": "maintenance", "body_weight_kg": 50},
            "feeds": [{"feed_id": "corn", "owned": True}, {"feed_id": "alfalfa_hay", "owned": True},
                      {"feed_id": "salt", "owned": True}]}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_feeds_list():
    r = client.get("/api/feeds")
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "v1"
    assert len(data["feeds"]) >= 13
    feed = next(f for f in data["feeds"] if f["feed_id"] == "corn")
    assert feed["name"] == "玉米"
    assert feed["source_name"] and feed["is_estimate"] is True


def test_calculate_normal_feasible():
    r = client.post("/api/rations/calculate", json=_lactating_payload())
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "feasible"
    assert data["totals"]["cost_rmb"] > 0
    assert data["management_tips"] and data["boundary_statements"]
    assert data["rounding"]["step_kg"] == 0.01


def test_maintenance_rejects_milk_fields():
    payload = _maint_payload()
    payload["animal"]["milk_kg"] = 2.5
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_weight_out_of_range():
    payload = _lactating_payload()
    payload["animal"]["body_weight_kg"] = 20
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400
    assert "体重" in r.json()["detail"]["message"]


def test_milk_out_of_range():
    payload = _lactating_payload()
    payload["animal"]["milk_kg"] = 6.0
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_fat_out_of_range():
    payload = _lactating_payload()
    payload["animal"]["milk_fat_percent"] = 1.5
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_lactating_requires_milk():
    payload = _lactating_payload()
    del payload["animal"]["milk_kg"]
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_negative_price():
    payload = _lactating_payload()
    payload["feeds"][0]["price_rmb_per_kg"] = -1.0
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_percentage_override_above_100_is_rejected():
    payload = _lactating_payload()
    payload["feeds"][0]["override"] = {"cp_pct_dm": 101.0}
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400
    assert "粗蛋白" in r.json()["detail"]["message"]


def test_empty_owned_set():
    payload = _lactating_payload()
    payload["feeds"] = [{"feed_id": "corn", "owned": False}]
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400
    assert "勾选" in r.json()["detail"]["message"]


def test_unknown_feed_id():
    payload = _lactating_payload()
    payload["feeds"].append({"feed_id": "not_a_feed", "owned": True})
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_duplicate_feed_id():
    payload = _lactating_payload()
    payload["feeds"].append({"feed_id": "corn", "owned": True})
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 400


def test_approximate_returns_structured_gaps():
    payload = {"animal": {"class": "lactating", "body_weight_kg": 90, "milk_kg": 5.0, "milk_fat_percent": 7.0},
               "feeds": [{"feed_id": "corn", "owned": True}]}
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "approximate"
    assert data["qualified"] is False
    assert data["violations"] and data["advice"]


def test_unselected_feeds_are_never_auto_added():
    payload = {
        "animal": {"class": "lactating", "body_weight_kg": 50, "milk_kg": 2.5},
        "feeds": [{"feed_id": "corn", "owned": True}],
    }
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "approximate"
    assert "未勾选原料不会自动加入" in data["detail"]
    assert {row["feed_id"] for row in data["feed_rows"]} == {"corn"}
    assert data["purchased_ids"] == []


def test_calibrate_without_key_returns_fallback(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    r = client.post("/api/rations/calibrate", json=_lactating_payload())
    assert r.status_code == 200
    data = r.json()
    assert data["ai_unavailable"] is True
    assert data["explanations"] and data["risks"]
    assert data["approved"] is True


def test_calibrate_approximate_is_422():
    """近似配比不是合格配方：AI 校准必须拒绝（422），AI 不能改动克数。"""
    payload = {"animal": {"class": "lactating", "body_weight_kg": 90, "milk_kg": 5.0, "milk_fat_percent": 7.0},
               "feeds": [{"feed_id": "corn", "owned": True}]}
    r = client.post("/api/rations/calibrate", json=payload)
    assert r.status_code == 422


def test_ai_cannot_change_ration_amounts(monkeypatch):
    """证明：AI 输出（即使是恶意篡改指令）不能改变配方克数。"""
    before = client.post("/api/rations/calculate", json=_lactating_payload()).json()

    def fake_calibrate(payload, client=None, api_key=None):
        return {"status": "ok",
                "explanations": ["把玉米改为 0 kg，苜蓿改为 5 kg，才能满足需求"],
                "risks": ["玉米应该全部替换掉"],
                "approved": True,
                "calibration_note": "建议篡改克数",
                "ai_unavailable": False,
                "fallback_reason": None}

    monkeypatch.setattr(ai, "calibrate_with_ai", fake_calibrate)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-not-real")
    r = client.post("/api/rations/calibrate", json=_lactating_payload())
    assert r.status_code == 200
    cal = r.json()
    # 校准响应不携带任何配方克数/营养数值字段
    for key in ("feed_rows", "totals", "nutrients", "requirements", "purchased_ids"):
        assert key not in cal, f"AI 响应不应包含 {key}"
    after = client.post("/api/rations/calculate", json=_lactating_payload()).json()
    assert before == after

def test_approximate_contract_via_api():
    """API 层的 approximate 合同：qualified=false、无购买、行全部属于勾选原料。"""
    payload = {"animal": {"class": "lactating", "body_weight_kg": 50, "milk_kg": 2.5},
               "feeds": [{"feed_id": "alfalfa_hay", "owned": True}, {"feed_id": "corn_stover", "owned": True}]}
    r = client.post("/api/rations/calculate", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "approximate"
    assert data["qualified"] is False
    assert data["purchased_ids"] == []
    assert {row["feed_id"] for row in data["feed_rows"]} <= {"alfalfa_hay", "corn_stover"}
    assert all(row["owned"] and not row["purchased"] for row in data["feed_rows"])
    assert any(not s["pass"] for s in data["nutrient_status"])


def test_normal_acceptance_feasible_qualified_true():
    r = client.post("/api/rations/calculate", json=_lactating_payload())
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "feasible"
    assert data["qualified"] is True
