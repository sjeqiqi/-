"""FastAPI 应用入口。

- GET  /api/health
- GET  /api/feeds
- POST /api/rations/calculate
- POST /api/rations/calibrate
若 ../frontend/dist 存在，则同时托管构建后的前端页面（本地桌面式网页部署）。
"""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import ai, spec
from .feeds import load_catalog
from .insights import build_ration_insights
from .models import CalculateRequest, CalibrateRequest
from .optimizer import optimize_ration
from .service import prepare_request

app = FastAPI(title=spec.API_TITLE, version=spec.VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_catalog = load_catalog()
_logger = logging.getLogger(__name__)

MANAGEMENT_TIPS = [
    "实际使用前，优先录入本批次原料的检测值后重新计算。",
    "更换原料或调整日粮时应逐步过渡，避免突然更换；具体过渡周期和饲喂频次应结合养殖条件及专业人员建议确定。",
    "请持续观察采食、反刍、体况及泌乳表现，出现明显异常时应由兽医或动物营养专业人员评估。",
    "本结果为当前输入条件和已选原料下的最低成本数学解。若实际采食、原料检测值、价格或羊只生产状态发生变化，请更新对应输入后重新计算，不建议直接人工修改各原料克数。",
]

BOUNDARY_STATEMENTS = [
    "当前原料营养参数若使用默认值，则属于估算数据；实际原料批次差异可能使贴近约束边界的指标发生变化。有检测值时应优先录入检测值重新计算。",
    "本结果不是疾病诊断或治疗建议，也不承诺提高产奶量。",
]


def _management_response(
    result: dict,
    requirements: dict,
    feeds: dict | None = None,
    owned_ids: list[str] | None = None,
) -> dict:
    result["management_tips"] = MANAGEMENT_TIPS
    result["boundary_statements"] = BOUNDARY_STATEMENTS
    result["dmi_target_kg"] = requirements["dmi_target_kg"]
    result["requirements"] = requirements
    # revalidated 仅对合格（feasible）结果标记为 True；近似配比虽按显示用量
    # 复算并报告未达标项，但不能宣称“复核通过”。
    result["rounding"] = {
        "step_kg": spec.ROUND_STEP_KG,
        "revalidated": result.get("status") == "feasible",
    }
    if result.get("feed_rows") and feeds is not None and owned_ids is not None:
        result["ration_insights"] = build_ration_insights(
            feeds,
            result["feed_rows"],
            result["nutrient_status"],
            requirements,
            owned_ids,
        )
    return result


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": spec.SERVICE_NAME, "version": spec.VERSION}


@app.get("/api/feeds")
def list_feeds() -> dict:
    return {
        "version": _catalog.version,
        "note": _catalog.note,
        "sources": _catalog.sources,
        "feeds": [f.to_dict() for f in _catalog.feeds.values()],
    }


def _run_calculation(request: CalculateRequest) -> dict:
    try:
        req, effective, owned = prepare_request(_catalog, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    result = optimize_ration(effective, owned, req)
    result = _management_response(result, req.to_dict(), effective, owned)
    audit = {
        "request_id": uuid.uuid4().hex,
        "animal": request.animal.model_dump(by_alias=True),
        "selected_feed_ids": owned,
        "requirements": req.to_dict(),
        "final_10g_amounts": {
            row["feed_id"]: row["as_fed_kg"] for row in result.get("feed_rows", [])
        },
        "nutrient_status": result.get("nutrient_status", []),
        "violations": result.get("violations", []),
        "boundary_flags": (result.get("ration_insights") or {}).get("boundary_flags", []),
        "solver_status": result.get("status"),
        "qualified": result.get("qualified"),
        "cost_rmb": (result.get("totals") or {}).get("cost_rmb"),
    }
    _logger.info("ration_audit %s", json.dumps(audit, ensure_ascii=False))
    return result


@app.post("/api/rations/calculate")
def calculate(request: CalculateRequest) -> dict:
    return _run_calculation(request)


@app.post("/api/rations/calibrate")
def calibrate(request: CalibrateRequest) -> dict:
    try:
        req, effective, owned = prepare_request(_catalog, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    result = optimize_ration(effective, owned, req)
    result = _management_response(result, req.to_dict(), effective, owned)
    if result["status"] != "feasible":
        raise HTTPException(
            status_code=422,
            detail={"message": "当前输入不可行或只能给出近似配比，无法生成 AI 校准解读。", "result": result},
        )
    payload = ai.build_ai_payload(result, req.to_dict())
    return ai.calibrate_with_ai(payload)


# ---- 可选：托管构建后的前端（本地单服务部署） ----
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = _dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
