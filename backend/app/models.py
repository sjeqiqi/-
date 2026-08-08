"""API 请求/响应模型（Pydantic）。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AnimalInput(BaseModel):
    """动物信息。class 为 lactating（泌乳）或 maintenance（维持）。"""
    class_: Literal["lactating", "maintenance"] = Field(alias="class")
    body_weight_kg: float
    milk_kg: float | None = None
    milk_fat_percent: float | None = None

    model_config = {"populate_by_name": True}


class FeedOverride(BaseModel):
    """用户用检测值覆盖默认成分；除 dm 外均为干物质基础百分数/数值。"""
    dm_pct: float | None = None
    me_mj_per_kg_dm: float | None = None
    cp_pct_dm: float | None = None
    ndf_pct_dm: float | None = None
    ca_pct_dm: float | None = None
    p_pct_dm: float | None = None


class FeedInput(BaseModel):
    """单个原料的输入：owned 表示本次允许使用，另含价格与可选成分覆盖。"""
    feed_id: str
    owned: bool = False
    price_rmb_per_kg: float | None = None
    override: FeedOverride | None = None


class CalculateRequest(BaseModel):
    animal: AnimalInput
    feeds: list[FeedInput] = Field(min_length=1)


class CalibrateRequest(CalculateRequest):
    """与 calculate 相同的请求体；服务端重新确定性计算后再调用 AI。"""
