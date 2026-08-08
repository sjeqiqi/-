"""营养需求计算：乳脂校正乳、干物质采食量、代谢能、CP/NDF/矿物质目标。

公式来源与数值见 PROJECT_PLAN.md 第 3 节；本模块只做确定性计算，不做优化。
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal

from . import spec

AnimalClass = Literal["lactating", "maintenance"]


def metabolic_weight(body_weight_kg: float) -> float:
    """BW^0.75"""
    return body_weight_kg ** 0.75


def fcm4(milk_kg: float, milk_fat_percent: float) -> float:
    """4% FCM = milkKg * (0.40 + 0.15 * milkFatPercent)"""
    return milk_kg * (0.40 + 0.15 * milk_fat_percent)


def milk_fat_kg(milk_kg: float, milk_fat_percent: float) -> float:
    return milk_kg * milk_fat_percent / 100.0


def fcm35(milk_kg: float, milk_fat_percent: float) -> float:
    """3.5% FCM = 0.432 * milkKg + 16.23 * milkFatKg"""
    return 0.432 * milk_kg + 16.23 * milk_fat_kg(milk_kg, milk_fat_percent)


def dmi_lactating(body_weight_kg: float, milk_kg: float, milk_fat_percent: float) -> float:
    """DMI = 0.062 * BW^0.75 + 0.305 * FCM3.5"""
    return 0.062 * metabolic_weight(body_weight_kg) + 0.305 * fcm35(milk_kg, milk_fat_percent)


def dmi_maintenance(body_weight_kg: float) -> float:
    """DMI = 0.062 * BW^0.75"""
    return 0.062 * metabolic_weight(body_weight_kg)


def me_maintenance(body_weight_kg: float) -> float:
    """ME_m = 0.5013 * BW^0.75 MJ/d"""
    return 0.5013 * metabolic_weight(body_weight_kg)


def me_lactation(fcm4_value: float) -> float:
    """ME_l = 5.224 * FCM4 MJ/d"""
    return 5.224 * fcm4_value


def cp_floor_lactating(fcm4_value: float) -> float:
    """泌乳 CP 下限（%DM），按 FCM4 分档；非泌乳期为维持下限。"""
    for upper, floor in spec.CP_LACTATING_TIERS:
        if fcm4_value <= upper:
            return floor
    return spec.CP_LACTATING_TIERS[-1][1]


@dataclass(frozen=True)
class Requirements:
    """一次计算的全部需求与约束边界（含 5% 余量后的最终数学约束）。"""
    animal_class: AnimalClass
    body_weight_kg: float
    milk_kg: float | None
    milk_fat_percent: float | None
    fcm4_kg: float
    fcm35_kg: float
    milk_fat_kg: float
    dmi_target_kg: float
    dmi_min_kg: float
    dmi_max_kg: float
    me_maintenance_mj: float
    me_lactation_mj: float
    me_requirement_mj: float   # 数学约束下限（含 5% 余量）
    cp_min_pct: float          # 含 5% 计算余量，封顶 20
    cp_max_pct: float
    ndf_min_pct: float
    ndf_max_pct: float
    forage_min_frac: float
    ca_min_pct: float
    p_min_pct: float
    ca_p_ratio_min: float
    ca_p_ratio_max: float
    salt_fraction: float

    def to_dict(self) -> dict:
        data = asdict(self)
        data["animal_class"] = str(self.animal_class)
        return data


def compute_requirements(
    animal_class: AnimalClass,
    body_weight_kg: float,
    milk_kg: float | None = None,
    milk_fat_percent: float | None = None,
) -> Requirements:
    """根据动物信息计算全部需求。

    milk_fat_percent 缺省时按 spec.FAT_DEFAULT_PCT（4.0）处理。
    """
    fat = spec.FAT_DEFAULT_PCT if milk_fat_percent is None else milk_fat_percent
    if animal_class == "maintenance":
        milk = 0.0
        fcm4v = 0.0
        fcm35v = 0.0
        fat_kg = 0.0
        dmi = dmi_maintenance(body_weight_kg)
        me_m = me_maintenance(body_weight_kg)
        me_l = 0.0
        cp_base = spec.CP_MAINTENANCE_MIN_PCT
        ndf_lo, ndf_hi = spec.NDF_MAINTENANCE
        forage_min = spec.FORAGE_MAINTENANCE_MIN
        ca_min = spec.CA_MAINTENANCE_MIN_PCT
        p_min = spec.P_MAINTENANCE_MIN_PCT
    else:
        milk = milk_kg if milk_kg is not None else 0.0
        fcm4v = fcm4(milk, fat)
        fcm35v = fcm35(milk, fat)
        fat_kg = milk_fat_kg(milk, fat)
        dmi = dmi_lactating(body_weight_kg, milk, fat)
        me_m = me_maintenance(body_weight_kg)
        me_l = me_lactation(fcm4v)
        cp_base = cp_floor_lactating(fcm4v)
        ndf_lo, ndf_hi = spec.NDF_LACTATING
        forage_min = spec.FORAGE_LACTATING_MIN
        ca_min = spec.CA_LACTATING_MIN_PCT
        p_min = spec.P_LACTATING_MIN_PCT

    cp_min = min(spec.CP_MAX_DM_PCT, cp_base * (1.0 + spec.CP_MARGIN))
    me_min = (me_m + me_l) * (1.0 + spec.ME_MARGIN)

    return Requirements(
        animal_class=animal_class,
        body_weight_kg=body_weight_kg,
        milk_kg=milk if animal_class == "lactating" else None,
        milk_fat_percent=fat if animal_class == "lactating" else None,
        fcm4_kg=fcm4v,
        fcm35_kg=fcm35v,
        milk_fat_kg=fat_kg,
        dmi_target_kg=dmi,
        dmi_min_kg=dmi * (1.0 - spec.DMI_TOLERANCE),
        dmi_max_kg=dmi * (1.0 + spec.DMI_TOLERANCE),
        me_maintenance_mj=me_m,
        me_lactation_mj=me_l,
        me_requirement_mj=me_min,
        cp_min_pct=cp_min,
        cp_max_pct=spec.CP_MAX_DM_PCT,
        ndf_min_pct=ndf_lo,
        ndf_max_pct=ndf_hi,
        forage_min_frac=forage_min,
        ca_min_pct=ca_min,
        p_min_pct=p_min,
        ca_p_ratio_min=spec.CAP_RATIO_MIN,
        ca_p_ratio_max=spec.CAP_RATIO_MAX,
        salt_fraction=spec.SALT_FRACTION,
    )
