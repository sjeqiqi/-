"""版本化 JSON 原料库加载器。

目录 backend/app/feeds/ 下每个 *.json 是一个版本，加载器按文件名排序取最新版本，
便于未来新增 v2 数据时无需改代码。所有营养百分比除 DM 外均为干物质基础。
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

FEEDS_DIR = Path(__file__).resolve().parent / "feeds"


@dataclass(frozen=True)
class FeedSpec:
    id: str
    name: str
    category: str                # concentrate | forage | mineral
    dm_pct: float
    me_mj_per_kg_dm: float
    cp_pct_dm: float
    ndf_pct_dm: float
    ca_pct_dm: float
    p_pct_dm: float
    default_price_rmb_per_kg: float
    max_usage_pct_dm: float
    is_estimate: bool
    source_name: str
    source_url: str
    overridden: bool = field(default=False, compare=False)

    @property
    def dm_fraction(self) -> float:
        return self.dm_pct / 100.0

    @property
    def is_forage(self) -> bool:
        return self.category == "forage"

    def to_dict(self) -> dict:
        return {
            "feed_id": self.id,
            "name": self.name,
            "category": self.category,
            "dm_pct": self.dm_pct,
            "me_mj_per_kg_dm": self.me_mj_per_kg_dm,
            "cp_pct_dm": self.cp_pct_dm,
            "ndf_pct_dm": self.ndf_pct_dm,
            "ca_pct_dm": self.ca_pct_dm,
            "p_pct_dm": self.p_pct_dm,
            "default_price_rmb_per_kg": self.default_price_rmb_per_kg,
            "max_usage_pct_dm": self.max_usage_pct_dm,
            "is_estimate": self.is_estimate,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "overridden": self.overridden,
        }


@dataclass(frozen=True)
class FeedCatalog:
    version: str
    sources: list[dict]
    feeds: dict[str, FeedSpec]
    note: str = ""

    def get(self, feed_id: str) -> FeedSpec:
        return self.feeds[feed_id]


def _load_file(path: Path) -> tuple[str, list[dict], list[dict], str]:
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    feeds = [FeedSpec(**item) for item in raw["feeds"]]
    return raw["version"], raw.get("sources", []), feeds, raw.get("note", "")


def load_catalog(feeds_dir: Path | None = None) -> FeedCatalog:
    """按文件名字典序取最新版本。"""
    directory = feeds_dir or FEEDS_DIR
    files = sorted(directory.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"未找到原料数据文件: {directory}")
    version, sources, feeds, note = _load_file(files[-1])
    by_id = {f.id: f for f in feeds}
    if len(by_id) != len(feeds):
        raise ValueError("原料数据存在重复 id")
    return FeedCatalog(version=version, sources=sources, feeds=by_id, note=note)
