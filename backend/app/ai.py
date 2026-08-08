"""DeepSeek V4 Flash 校准客户端。

- 仅使用官方 OpenAI 兼容接口：base URL https://api.deepseek.com，
  模型名 deepseek-v4-flash，密钥只从环境变量 DEEPSEEK_API_KEY 读取。
- AI 只接收计算后的结构化摘要，只能输出解释/风险/approved/校准说明；
  任何情况下都不能改变配方克数、需求量、约束或成本（本模块不接收也不回写这些字段）。
- 密钥缺失、超时、传输失败或返回非法 JSON 时，返回本地固定说明并标记 ai_unavailable。
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-v4-flash"
TIMEOUT_SECONDS = 30.0
MAX_RESPONSE_TOKENS = 2000
MAX_EXPLANATIONS = 3
MAX_RISKS = 3
MAX_STRING_LEN = 200
MAX_NOTE_LEN = 300

SYSTEM_PROMPT = (
    "你是奶山羊日粮配比助手的解释模块。你只能基于给定的结构化计算结果，"
    "用通俗中文生成最多 3 条解释和最多 3 条风险提醒，并给出 approved 布尔值与一句校准说明。"
    "严禁修改任何克数、需求量、约束或成本；不得虚构营养数据；不得诊断疾病或承诺提高产奶量。"
    "nutrient_status 中 pass=true 的指标已经通过确定性复算，不得将其描述为不足、过量或相关健康风险；"
    "不得把宏量指标达标表述成完整营养已满足，风险提醒应优先说明默认成分误差、换料、原料品质和持续观察。"
    "必须只输出一个 JSON 对象，格式为："
    '{"explanations": ["..."], "risks": ["..."], "approved": true, "calibration_note": "..."}。'
)

FALLBACK_EXPLANATIONS = [
    "AI 解读暂不可用：未配置 DEEPSEEK_API_KEY、接口超时或返回内容无法解析。",
    "下方的配方由本地确定性优化计算得出，未受 AI 影响，仍按 10 g 取整复算并全部达标。",
]
FALLBACK_RISKS = [
    "默认成分数据为估算值，请以实际检测值复核后再长期使用。",
    "本方案仅覆盖宏量指标，不含微量元素与维生素保证，不能替代全价长期日粮。",
]
FALLBACK_NOTE = "AI 未参与本次解读，以下为固定本地说明。"


def _fallback(reason: str) -> dict:
    return {
        "status": "ok",
        "explanations": FALLBACK_EXPLANATIONS,
        "risks": FALLBACK_RISKS,
        "approved": True,
        "calibration_note": FALLBACK_NOTE,
        "ai_unavailable": True,
        "fallback_reason": reason,
    }


def build_ai_payload(result: dict, requirements: dict) -> dict:
    """从确定性计算结果构造 AI 只读摘要（不含可被误改的配方细节字段）。"""
    return {
        "animal_class": requirements.get("animal_class"),
        "body_weight_kg": requirements.get("body_weight_kg"),
        "milk_kg": requirements.get("milk_kg"),
        "milk_fat_percent": requirements.get("milk_fat_percent"),
        "dmi_target_kg": requirements.get("dmi_target_kg"),
        "me_requirement_mj": requirements.get("me_requirement_mj"),
        "cp_min_pct": requirements.get("cp_min_pct"),
        "totals": result.get("totals", {}),
        "nutrients": result.get("nutrients", {}),
        "nutrient_status": result.get("nutrient_status", []),
        "boundary_statements": result.get("boundary_statements", []),
        "purchased_feeds": result.get("purchased_ids", []),
    }


def _extract_json(content: str) -> dict:
    """解析模型输出中的 JSON（容忍 ```json 代码块与前后杂质）。"""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("AI 返回内容中没有可解析的 JSON 对象")
        data = json.loads(text[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 返回的 JSON 不是对象")
    return data


def _clean_list(items: Any, limit: int) -> list[str]:
    if not isinstance(items, list):
        raise ValueError("字段应为字符串数组")
    out: list[str] = []
    for item in items[:limit]:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("字段包含空字符串或非字符串项")
        out.append(item.strip()[:MAX_STRING_LEN])
    if not out:
        raise ValueError("字段为空")
    return out


def validate_ai_json(data: dict) -> dict:
    """严格校验 AI 输出结构；任何不合规都抛错，由调用方回退。"""
    explanations = _clean_list(data.get("explanations"), MAX_EXPLANATIONS)
    risks = _clean_list(data.get("risks"), MAX_RISKS)
    approved = data.get("approved")
    if not isinstance(approved, bool):
        raise ValueError("approved 必须为布尔值")
    note = data.get("calibration_note")
    if not isinstance(note, str):
        raise ValueError("calibration_note 必须为字符串")
    return {
        "explanations": explanations,
        "risks": risks,
        "approved": approved,
        "calibration_note": note.strip()[:MAX_NOTE_LEN],
    }


def calibrate_with_ai(
    payload: dict,
    client: httpx.Client | None = None,
    api_key: str | None = None,
) -> dict:
    """调用 DeepSeek 并校验输出；失败时回退到本地固定说明。"""
    key = api_key if api_key is not None else os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        return _fallback("未配置 DEEPSEEK_API_KEY")

    own_client = client is None
    http: httpx.Client | None = client
    try:
        if http is None:
            http = httpx.Client(timeout=TIMEOUT_SECONDS)
        response = http.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                "temperature": 0.3,
                # V4 Flash 会先返回 reasoning_content；600 容易在正式 JSON 前截断。
                "max_tokens": MAX_RESPONSE_TOKENS,
                "response_format": {"type": "json_object"},
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(f"DeepSeek API 返回 HTTP {response.status_code}")
        content = response.json()["choices"][0]["message"]["content"]
        validated = validate_ai_json(_extract_json(content))
        return {
            "status": "ok",
            **validated,
            "ai_unavailable": False,
            "fallback_reason": None,
        }
    except Exception as exc:  # 网络/超时/结构错误统一回退，绝不破坏确定性结果
        return _fallback(f"{type(exc).__name__}: {exc}")
    finally:
        if own_client and http is not None:
            http.close()
