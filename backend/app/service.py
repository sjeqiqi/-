"""服务层：校验输入、合并用户覆盖值、组装需求与有效原料字典。"""
from __future__ import annotations

import math
from dataclasses import replace

from . import spec
from .feeds import FeedCatalog, FeedSpec
from .models import AnimalInput, CalculateRequest, FeedInput
from .nutrition import Requirements, compute_requirements


def validate_animal(animal: AnimalInput) -> Requirements:
    """校验动物输入范围并计算需求；越界抛出 ValueError（上层转 4xx）。"""
    if not (spec.WEIGHT_MIN_KG <= animal.body_weight_kg <= spec.WEIGHT_MAX_KG):
        raise ValueError(
            f"体重需在 {spec.WEIGHT_MIN_KG:.0f}–{spec.WEIGHT_MAX_KG:.0f} kg 之间，"
            f"当前 {animal.body_weight_kg:g} kg；超出首版适用范围，请由营养师或兽医复核。"
        )
    if animal.class_ == "maintenance":
        if animal.milk_kg is not None or animal.milk_fat_percent is not None:
            raise ValueError("维持期（非泌乳）羊不需要也不应填写产奶量与乳脂率。")
        return compute_requirements("maintenance", animal.body_weight_kg)

    milk = animal.milk_kg
    if milk is None:
        raise ValueError("泌乳期必须填写日产奶量（kg/d）。")
    if not (spec.MILK_MIN_KG <= milk <= spec.MILK_MAX_KG):
        raise ValueError(
            f"日产奶量需在 {spec.MILK_MIN_KG:.1f}–{spec.MILK_MAX_KG:.1f} kg/d 之间，"
            f"当前 {milk:g} kg/d；超出首版适用范围，请由营养师或兽医复核。"
        )
    fat = spec.FAT_DEFAULT_PCT if animal.milk_fat_percent is None else animal.milk_fat_percent
    if not (spec.FAT_MIN_PCT <= fat <= spec.FAT_MAX_PCT):
        raise ValueError(
            f"乳脂率需在 {spec.FAT_MIN_PCT:.1f}–{spec.FAT_MAX_PCT:.1f}% 之间，"
            f"当前 {fat:g}%；超出首版适用范围，请由营养师或兽医复核。"
        )
    return compute_requirements("lactating", animal.body_weight_kg, milk, fat)


def _apply_override(feed: FeedSpec, override) -> FeedSpec:
    values = {
        "dm_pct": override.dm_pct,
        "me_mj_per_kg_dm": override.me_mj_per_kg_dm,
        "cp_pct_dm": override.cp_pct_dm,
        "ndf_pct_dm": override.ndf_pct_dm,
        "ca_pct_dm": override.ca_pct_dm,
        "p_pct_dm": override.p_pct_dm,
    }
    merged = {k: v for k, v in values.items() if v is not None}
    if "dm_pct" in merged:
        dm = merged["dm_pct"]
        if not (0.0 < dm <= 100.0):
            raise ValueError(f"干物质（DM）需在 (0, 100]% 之间，当前 {dm:g}%。")
    percentage_keys = {"cp_pct_dm", "ndf_pct_dm", "ca_pct_dm", "p_pct_dm"}
    for key, label in (("me_mj_per_kg_dm", "代谢能"), ("cp_pct_dm", "粗蛋白"),
                       ("ndf_pct_dm", "NDF"), ("ca_pct_dm", "钙"), ("p_pct_dm", "磷")):
        v = merged.get(key)
        if v is not None and (not math.isfinite(v) or v < 0):
            raise ValueError(f"{label}覆盖值必须是有限的非负数（当前 {v:g}）。")
        if v is not None and key in percentage_keys and v > 100:
            raise ValueError(f"{label}覆盖值需在 [0, 100]% 之间（当前 {v:g}%）。")
    return replace(feed, overridden=True, **merged) if merged else feed


def build_effective_feeds(
    catalog: FeedCatalog,
    feeds: list[FeedInput],
) -> tuple[dict[str, FeedSpec], list[str]]:
    """校验原料输入并返回 (有效原料字典, 本次勾选允许使用的原料 id 列表)。"""
    seen: set[str] = set()
    owned: list[str] = []
    effective: dict[str, FeedSpec] = dict(catalog.feeds)

    for item in feeds:
        if item.feed_id not in catalog.feeds:
            raise ValueError(f"未知原料 id：{item.feed_id!r}。")
        if item.feed_id in seen:
            raise ValueError(f"原料 {item.feed_id!r} 在请求中重复出现。")
        seen.add(item.feed_id)
        feed = catalog.feeds[item.feed_id]
        price = feed.default_price_rmb_per_kg if item.price_rmb_per_kg is None else item.price_rmb_per_kg
        if not math.isfinite(price) or price < 0:
            raise ValueError(f"原料 {feed.name} 的价格必须是有限的非负数（当前 {price:g} 元/kg）。")
        if item.override is not None:
            feed = _apply_override(feed, item.override)
        effective[item.feed_id] = replace(feed, default_price_rmb_per_kg=price, overridden=True) \
            if price != feed.default_price_rmb_per_kg or feed.overridden else feed
        if item.owned:
            owned.append(item.feed_id)

    if not owned:
        raise ValueError("请至少勾选一种允许用于本次配方的原料。")
    return effective, owned


def prepare_request(
    catalog: FeedCatalog,
    request: CalculateRequest,
) -> tuple[Requirements, dict[str, FeedSpec], list[str]]:
    """完整的请求校验：先动物后原料，返回 (需求, 有效原料, 本次勾选原料 id)。"""
    req = validate_animal(request.animal)
    effective, owned = build_effective_feeds(catalog, request.feeds)
    return req, effective, owned
