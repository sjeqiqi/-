"""AI 模块测试：回退路径、JSON 校验、不可篡改。"""
import httpx
import pytest

from app import ai


def _fake_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


class FakeClient:
    def __init__(self, response):
        self._response = response
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self._response


def test_missing_key_returns_fallback(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    result = ai.calibrate_with_ai({"x": 1})
    assert result["ai_unavailable"] is True
    assert result["explanations"] and result["risks"]
    assert result["approved"] is True
    assert "DEEPSEEK_API_KEY" in result["fallback_reason"]


def test_valid_ai_response(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    content = '{"explanations": ["解释1", "解释2"], "risks": ["风险1"], "approved": true, "calibration_note": "ok"}'
    client = FakeClient(_fake_response(content))
    result = ai.calibrate_with_ai({"x": 1}, client=client)
    assert result["ai_unavailable"] is False
    assert result["explanations"] == ["解释1", "解释2"]
    assert result["risks"] == ["风险1"]
    assert result["approved"] is True
    assert client.calls[0][1]["json"]["model"] == "deepseek-v4-flash"
    assert client.calls[0][1]["json"]["max_tokens"] == ai.MAX_RESPONSE_TOKENS
    assert client.calls[0][0][0].startswith("https://api.deepseek.com")


def test_code_fenced_json():
    content = '```json\n{"explanations": ["a"], "risks": ["b"], "approved": false, "calibration_note": "n"}\n```'
    result = ai.validate_ai_json(ai._extract_json(content))
    assert result["approved"] is False


def test_invalid_json_returns_fallback(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    client = FakeClient(_fake_response("这不是 JSON"))
    result = ai.calibrate_with_ai({"x": 1}, client=client)
    assert result["ai_unavailable"] is True


def test_transport_error_returns_fallback(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")

    class BoomClient:
        def post(self, *args, **kwargs):
            raise httpx.TimeoutException("timeout")

    result = ai.calibrate_with_ai({"x": 1}, client=BoomClient())
    assert result["ai_unavailable"] is True
    assert "timeout" in result["fallback_reason"].lower()


def test_client_initialization_error_returns_fallback(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")

    def fail_to_create_client(*args, **kwargs):
        raise ImportError("missing proxy dependency")

    monkeypatch.setattr(ai.httpx, "Client", fail_to_create_client)
    result = ai.calibrate_with_ai({"x": 1})
    assert result["ai_unavailable"] is True
    assert "missing proxy dependency" in result["fallback_reason"]


def test_malformed_structure_returns_fallback(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    bad = '{"explanations": "not-a-list", "risks": [], "approved": 1, "calibration_note": "x"}'
    result = ai.calibrate_with_ai({"x": 1}, client=FakeClient(_fake_response(bad)))
    assert result["ai_unavailable"] is True


def test_ai_payload_contains_only_summary():
    result = {
        "totals": {"dm_kg": 2.0},
        "nutrients": {"cp_pct_dm": 15.0},
        "nutrient_status": [{"key": "cp", "target": "≥14%", "actual": 15.0, "pass": True}],
        "boundary_statements": ["仅覆盖宏量指标"],
        "purchased_ids": ["alfalfa_hay"],
    }
    req = {"animal_class": "lactating", "body_weight_kg": 50, "milk_kg": 2.5, "milk_fat_percent": 4.0,
           "dmi_target_kg": 1.99, "me_requirement_mj": 23.6, "cp_min_pct": 14.7}
    payload = ai.build_ai_payload(result, req)
    assert "feed_rows" not in payload
    assert "amounts" not in payload
    assert payload["nutrient_status"][0]["pass"] is True
    assert payload["boundary_statements"] == ["仅覆盖宏量指标"]
