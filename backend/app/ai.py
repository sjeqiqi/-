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
import re
from typing import Any

import httpx

DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
TIMEOUT_SECONDS = 30.0
MAX_RESPONSE_TOKENS = 2000
MAX_EXPLANATIONS = 3
MAX_RISKS = 3
MAX_STRING_LEN = 200
MAX_NOTE_LEN = 300

SYSTEM_PROMPT = (
    "你是奶山羊日粮配比助手的解释模块。你只能基于给定的结构化计算结果，"
    "用通俗中文生成最多 3 条解释和最多 3 条风险提醒，并给出 approved 布尔值与一句校准说明。"
    "表达要面向普通养殖户：每条先说结论，再用一句话说明原因；尽量用短句，一句话只表达一个重点。"
    "能用日常说法就不用模型术语；必须使用专业词时，紧接着用括号解释。"
    "例如把‘约束条件’说成‘需要满足的营养要求’，把‘贴边’说成‘虽然达标，但离上限或下限很近’。"
    "不要堆砌英文缩写；DMI、ME、CP、NDF 首次出现时应同时写出中文含义。"
    "严禁修改任何克数、需求量、约束或成本；不得虚构营养数据；不得诊断疾病或承诺提高产奶量。"
    "nutrient_status 中 pass=true 的指标已经通过确定性复算，不得将其描述为不足、过量或相关健康风险；"
    "不得把宏量指标达标表述成完整营养已满足。你只负责转写程序事实，不能新增未经固定知识支持的饲养参数。"
    "禁止给出具体换料天数、每日饲喂次数或手工增减某种原料的克数；禁止建议用户按经验动态、自行或人工修改配方。"
    "涉及输入变化时，只能建议更新原料检测值、价格、实际采食或生产状态后重新运行优化计算，且明确不建议直接人工修改原料克数。"
    "ration_insights 中的字段全部由后端确定性计算（主要能量/蛋白来源、粗饲料比例、贴边约束等），"
    "你只能把这些事实转写成用户看得懂的自然语言，不得修改其中数值、不得虚构新的营养来源或营养结论。"
    "必须只输出一个 JSON 对象，格式为："
    '{"explanations": ["..."], "risks": ["..."], "approved": true, "calibration_note": "..."}。'
)

FALLBACK_EXPLANATIONS = [
    "AI 解读暂不可用：未配置 DEEPSEEK_API_KEY、接口超时或返回内容无法解析。",
    "页面中的配方特点、来源贡献和边界提醒均由程序确定性计算，未受 AI 影响。",
]
FALLBACK_RISKS = [
    "输入条件发生变化时，请更新对应输入后重新计算，不建议直接人工修改各原料克数。",
    "AI 未参与本次解读，不会新增饲养参数或改变程序计算结果。",
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
        "management_tips": result.get("management_tips", []),
        "ration_insights": result.get("ration_insights", {}),
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


UNSAFE_ADVICE_PATTERNS = (
    re.compile(r"\d+(?:\s*[–—-]\s*\d+)?\s*(?:天|次)(?:饲喂|喂|过渡|换料)?"),
    re.compile(r"(?:动态|自行|手工|人工)(?:地)?(?:调整|修改)"),
    re.compile(r"[加减]\s*\d+(?:\.\d+)?\s*(?:g|kg|克|公斤)", re.IGNORECASE),
)


def _ensure_safe_content(items: list[str]) -> None:
    """拒绝未经固定知识支持的具体饲养参数和手工调方建议。"""
    for item in items:
        checked = item.replace("不建议直接人工修改", "").replace("不要直接人工修改", "")
        if any(pattern.search(checked) for pattern in UNSAFE_ADVICE_PATTERNS):
            raise ValueError("AI 输出包含不允许的具体饲养参数或手工调方建议")


def validate_ai_json(data: dict) -> dict:
    """严格校验 AI 输出结构；任何不合规都抛错，由调用方回退。"""
    explanations = _clean_list(data.get("explanations"), MAX_EXPLANATIONS)
    risks = _clean_list(data.get("risks"), MAX_RISKS)
    _ensure_safe_content(explanations + risks)
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
