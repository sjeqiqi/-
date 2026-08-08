"""FastAPI 应用入口。

- GET  /api/health
- GET  /api/feeds
- POST /api/rations/calculate
- POST /api/rations/calibrate
若 ../frontend/dist 存在，则同时托管构建后的前端页面（本地桌面式网页部署）。
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import ai, spec
from .feeds import load_catalog
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

MANAGEMENT_TIPS = [
    "换料或调整配方时，请用 7 天左右逐步过渡，避免突然更换导致消化紊乱。",
    "建议将日粮分成 2–3 次饲喂，并保证充足、清洁的饮水。",
    "请持续观察剩料、粪便、体况与产奶量变化；出现异常应及时联系兽医或营养师。",
    "首版方案仅作当前宏量营养的最低成本参考，请按实际采食量与羊只状态动态调整。",
]

BOUNDARY_STATEMENTS = [
    "默认成分数据为公开资料估算值，不是实验室检测值；有检测值时请用覆盖功能录入。",
    "本工具仅覆盖宏量指标（能量、粗蛋白、NDF、钙、磷），不含微量元素与维生素保证，不能替代全价长期日粮。",
    "粗蛋白为宏量代理指标，不代表可代谢蛋白（MP）精确满足。",
    "本结果不是兽医诊断或治疗建议，不承诺提高产奶量。",
]


def _management_response(result: dict, requirements: dict) -> dict:
    result["management_tips"] = MANAGEMENT_TIPS
    result["boundary_statements"] = BOUNDARY_STATEMENTS
    result["dmi_target_kg"] = requirements["dmi_target_kg"]
    # revalidated 仅对合格（feasible）结果标记为 True；近似配比虽按显示用量
    # 复算并报告未达标项，但不能宣称“复核通过”。
    result["rounding"] = {
        "step_kg": spec.ROUND_STEP_KG,
        "revalidated": result.get("status") == "feasible",
    }
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
    return _management_response(result, req.to_dict())


@app.post("/api/rations/calculate")
def calculate(request: CalculateRequest) -> dict:
    return _run_calculation(request)


@app.post("/api/rations/calibrate")
def calibrate(request: CalibrateRequest) -> dict:
    result = _run_calculation(request)
    if result["status"] != "feasible":
        raise HTTPException(
            status_code=422,
            detail={"message": "当前输入不可行或只能给出近似配比，无法生成 AI 校准解读。", "result": result},
        )
    payload = ai.build_ai_payload(result, result["requirements"])
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
