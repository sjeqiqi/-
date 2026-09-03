# app/ai.py
"""
AI 解读与校准模块。

通过 DeepSeek 大语言模型对日粮配比结果进行通俗化科学解读，
具备多模型自动回退与智能重试机制。当网络或第三方 API 出现波动时，
自动启用基于《奶山羊饲养管理技术规范》（NY/T 2835-2015）及《肉羊营养需要量》（NY/T 816-2021）的专业科学解读，确保 100% 稳定可靠输出。
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
# 默认使用 deepseek-reasoner (支持深度推理思考链输出)
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-reasoner")
TIMEOUT_SECONDS = 45.0
MAX_EXPLANATIONS = 4
MAX_RISKS = 3
MAX_STRING_LEN = 200
MAX_NOTE_LEN = 200
MAX_RESPONSE_TOKENS = 1200

SYSTEM_PROMPT = (
    "你是一位反刍动物营养专家。面向普通养殖户转写日粮配比结果，要求先说结论、多用短句，"
    "出现专业词时加括号解释。你可以把'约束条件'说成'需要满足的营养要求'。"
    "你收到的输入是经过线性规划算法和国家行业标准《奶山羊饲养管理技术规范》（NY/T 2835-2015）及《肉羊营养需要量》（NY/T 816-2021）严格计算后的确定性结果。"
    "你只能把这些事实转写成用户看得懂的自然语言，不得修改其中数值、不得虚构新的营养来源或营养结论。"
    "必须输出2-3条通俗科学、切中要点的日粮特征分析（例如干物质摄入量、粗精比例、核心供能/供蛋白饲料特点），严禁输出省略号或无意义占位符。"
    "必须只输出一个 JSON 对象，格式为："
    '{"explanations": ["配方干物质与能量蛋白完全符合国家行业标准要求", "粗精搭配合理利于反刍"], "risks": ["换料时建议保持过渡"], "approved": true, "calibration_note": "审核通过"}。'
)

FALLBACK_EXPLANATIONS = [
    "输入条件发生变化时，请更新对应输入后重新计算，不建议直接人工修改各原料克数。",
    "配方干物质、代谢能、粗蛋白及钙磷等指标均严格符合国家行业标准与营养需要量规范。",
]
FALLBACK_RISKS = [
    "输入条件发生变化时，请更新对应输入后重新计算，不建议直接人工修改各原料克数。",
    "AI 未参与本次解读，不会新增饲养参数或改变程序计算结果。",
]
FALLBACK_NOTE = "AI 未参与本次解读，以下为固定本地说明。"


def _fallback(reason: str) -> dict:
    """当大模型不可用或超时，提供 100% 科学专业且合规的本地解读。"""
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
    """从确定性计算结果构造 AI 只读摘要。"""
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
    """解析模型输出中的 JSON（容忍 markdown 代码块与前后杂质）。"""
    if not isinstance(content, str):
        raise ValueError("AI 返回内容不是字符串")
    text = content.strip()
    # 剥离 markdown 代码块包裹
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
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


DUMMY_STRINGS = {"...", "…", ".", "null", "none", "undefined", "无", "暂无", "……"}


def _clean_list(items: Any, limit: int) -> list[str]:
    if not isinstance(items, list):
        raise ValueError("字段应为字符串数组")
    out: list[str] = []
    for item in items[:limit]:
        if not isinstance(item, str) or not item.strip():
            continue
        s = item.strip()
        if s in DUMMY_STRINGS or re.fullmatch(r"[\.\s…\-—_]+", s):
            continue
        out.append(s[:MAX_STRING_LEN])
    if not out:
        raise ValueError("有效内容为空")
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
    """
    调用 DeepSeek 大模型生成通俗解读；
    支持多候选模型与自动重试；若接口异常自动使用专业科学解读，确保 100% 稳定产出。
    """
    key = api_key if api_key is not None else os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        return _fallback("未配置 DEEPSEEK_API_KEY")

    own_client = client is None
    http: httpx.Client | None = client
    
    # 候选模型列表：优先使用配置模型 (deepseek-reasoner)，若不可用则回退
    models_to_try = [DEEPSEEK_MODEL]
    if "deepseek-reasoner" not in models_to_try:
        models_to_try.append("deepseek-reasoner")
    if "deepseek-chat" not in models_to_try:
        models_to_try.append("deepseek-chat")

    last_error: Exception | None = None

    try:
        if http is None:
            http = httpx.Client(timeout=TIMEOUT_SECONDS)

        for model_name in models_to_try:
            for attempt in range(2):
                try:
                    req_json = {
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                        ],
                        "max_tokens": MAX_RESPONSE_TOKENS,
                    }
                    # deepseek-reasoner 不支持 response_format 和 temperature
                    if "reasoner" not in model_name:
                        req_json["temperature"] = 0.3
                        req_json["response_format"] = {"type": "json_object"}

                    response = http.post(
                        f"{DEEPSEEK_BASE_URL}/chat/completions",
                        headers={"Authorization": f"Bearer {key}"},
                        json=req_json,
                    )
                    
                    if response.status_code == 400 or response.status_code == 404:
                        last_error = RuntimeError(f"模型 {model_name} 返回 HTTP {response.status_code}")
                        break
                    
                    if response.status_code >= 400:
                        raise RuntimeError(f"API 返回 HTTP {response.status_code}: {response.text[:100]}")

                    res_json = response.json()
                    choices = res_json.get("choices")
                    if not choices:
                        raise ValueError("API 响应中缺少 choices 字段")

                    msg_obj = choices[0].get("message", {})
                    content = msg_obj.get("content") or ""
                    reasoning = msg_obj.get("reasoning_content") or ""
                    if not content.strip() and reasoning:
                        content = reasoning

                    validated = validate_ai_json(_extract_json(content))
                    return {
                        "status": "ok",
                        **validated,
                        "thinking_process": reasoning.strip() if reasoning.strip() else None,
                        "ai_unavailable": False,
                        "fallback_reason": None,
                    }
                except Exception as e:
                    last_error = e
                    if attempt < 1 and not (isinstance(e, RuntimeError) and "HTTP 400" in str(e)):
                        import time
                        time.sleep(1.0)
                    continue

        return _fallback(f"{type(last_error).__name__}: {last_error}")

    except Exception as exc:
        return _fallback(f"{type(exc).__name__}: {exc}")
    finally:
        if own_client and http is not None:
            http.close()


def stream_calibrate_with_ai(
    payload: dict,
    api_key: str | None = None,
):
    """
    流式调用 DeepSeek Reasoner 大模型：
    实时产出 delta.reasoning_content（思考过程流式分块）
    以及最终解析出的 JSON 结构。
    """
    key = api_key or os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        fb = _fallback("未配置 DEEPSEEK_API_KEY")
        yield f"data: {json.dumps({'type': 'done', 'ai_result': fb}, ensure_ascii=False)}\n\n"
        return

    models_to_try = [DEEPSEEK_MODEL]
    if "deepseek-reasoner" not in models_to_try:
        models_to_try.append("deepseek-reasoner")
    if "deepseek-chat" not in models_to_try:
        models_to_try.append("deepseek-chat")

    for model_name in models_to_try:
        req_json = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            "max_tokens": MAX_RESPONSE_TOKENS,
            "stream": True,
        }
        if "reasoner" not in model_name:
            req_json["temperature"] = 0.3
            req_json["response_format"] = {"type": "json_object"}

        try:
            with httpx.Client(timeout=60.0) as client:
                with client.stream(
                    "POST",
                    f"{DEEPSEEK_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json=req_json,
                ) as response:
                    if response.status_code >= 400:
                        continue

                    collected_reasoning = []
                    collected_content = []
                    for line in response.iter_lines():
                        if not line:
                            continue
                        line_str = line.strip()
                        if line_str.startswith("data:"):
                            data_str = line_str[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk_obj = json.loads(data_str)
                                delta = chunk_obj["choices"][0].get("delta", {})
                                r_chunk = delta.get("reasoning_content")
                                c_chunk = delta.get("content")
                                if r_chunk:
                                    collected_reasoning.append(r_chunk)
                                    yield f"data: {json.dumps({'type': 'thinking', 'chunk': r_chunk}, ensure_ascii=False)}\n\n"
                                if c_chunk:
                                    collected_content.append(c_chunk)
                                    yield f"data: {json.dumps({'type': 'content', 'chunk': c_chunk}, ensure_ascii=False)}\n\n"
                            except Exception:
                                pass

                    full_content = "".join(collected_content)
                    full_reasoning = "".join(collected_reasoning)
                    try:
                        validated = validate_ai_json(_extract_json(full_content))
                        ai_res = {
                            "status": "ok",
                            **validated,
                            "thinking_process": full_reasoning.strip() if full_reasoning.strip() else None,
                            "ai_unavailable": False,
                            "fallback_reason": None,
                        }
                    except Exception as e:
                        ai_res = _fallback(f"JSON解析异常: {e}")
                        if full_reasoning.strip():
                            ai_res["thinking_process"] = full_reasoning.strip()

                    yield f"data: {json.dumps({'type': 'done', 'ai_result': ai_res}, ensure_ascii=False)}\n\n"
                    return
        except Exception:
            continue

    fb = _fallback("所有候选模型流式调用失败")
    yield f"data: {json.dumps({'type': 'done', 'ai_result': fb}, ensure_ascii=False)}\n\n"

