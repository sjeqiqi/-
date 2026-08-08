"""营养公式测试：与 PROJECT_PLAN.md 第 3 节逐条对应。"""
import math

from app import spec
from app.nutrition import (
    compute_requirements,
    dmi_lactating,
    dmi_maintenance,
    fcm35,
    fcm4,
    me_lactation,
    me_maintenance,
    milk_fat_kg,
)


def test_fcm4_formula():
    assert math.isclose(fcm4(2.5, 4.0), 2.5 * (0.40 + 0.15 * 4.0), abs_tol=1e-9)


def test_fcm35_formula():
    assert math.isclose(fcm35(2.5, 4.0), 0.432 * 2.5 + 16.23 * 0.1, abs_tol=1e-9)
    assert math.isclose(milk_fat_kg(2.5, 4.0), 0.1, abs_tol=1e-9)


def test_dmi_lactating_formula():
    bw, milk, fat = 50.0, 2.5, 4.0
    mw = bw ** 0.75
    assert math.isclose(dmi_lactating(bw, milk, fat), 0.062 * mw + 0.305 * fcm35(milk, fat), abs_tol=1e-9)


def test_dmi_maintenance_formula():
    bw = 50.0
    assert math.isclose(dmi_maintenance(bw), 0.062 * bw ** 0.75, abs_tol=1e-9)


def test_me_formulas():
    bw = 50.0
    assert math.isclose(me_maintenance(bw), 0.5013 * bw ** 0.75, abs_tol=1e-9)
    assert math.isclose(me_lactation(2.5), 5.224 * 2.5, abs_tol=1e-9)


def test_acceptance_me_value():
    """验收标准：50 kg、2.5 kg/d、4% 乳脂，未加余量时 ME 约 22.48 MJ/d。"""
    req = compute_requirements("lactating", 50.0, 2.5, 4.0)
    theory = req.me_maintenance_mj + req.me_lactation_mj
    assert math.isclose(theory, 22.48, abs_tol=0.05)
    # 加 5% 余量后的数学约束下限
    assert math.isclose(req.me_requirement_mj, theory * 1.05, abs_tol=1e-9)


def test_cp_tiers_and_margin():
    assert compute_requirements("lactating", 50.0, 1.0, 4.0).cp_min_pct == min(20.0, 12.0 * 1.05)
    assert compute_requirements("lactating", 50.0, 2.5, 4.0).cp_min_pct == min(20.0, 14.0 * 1.05)
    # 高 FCM4 档：18% 下限 × 1.05 = 18.9，且不超过 20
    high = compute_requirements("lactating", 60.0, 5.0, 5.0)
    assert math.isclose(high.cp_min_pct, 18.9, abs_tol=1e-9)
    assert high.cp_max_pct == 20.0
    # 维持期 CP 下限 9% × 1.05
    maint = compute_requirements("maintenance", 50.0)
    assert math.isclose(maint.cp_min_pct, 9.45, abs_tol=1e-9)


def test_requirements_bands():
    lact = compute_requirements("lactating", 50.0, 2.5, 4.0)
    assert lact.ndf_min_pct == 28.0 and lact.ndf_max_pct == 45.0
    assert lact.forage_min_frac == 0.50
    assert lact.ca_min_pct == 0.65 and lact.p_min_pct == 0.35
    maint = compute_requirements("maintenance", 50.0)
    assert maint.ndf_min_pct == 30.0 and maint.ndf_max_pct == 55.0
    assert maint.forage_min_frac == 0.70
    assert maint.ca_min_pct == 0.18 and maint.p_min_pct == 0.14
    assert maint.ca_p_ratio_min == 1.5 and maint.ca_p_ratio_max == 2.0
    assert maint.salt_fraction == 0.005


def test_maintenance_has_no_milk_fields():
    req = compute_requirements("maintenance", 50.0)
    assert req.milk_kg is None and req.milk_fat_percent is None
    assert req.me_lactation_mj == 0.0
    assert req.fcm4_kg == 0.0


def test_dmi_band():
    req = compute_requirements("lactating", 50.0, 2.5, 4.0)
    assert math.isclose(req.dmi_min_kg, req.dmi_target_kg * 0.97, abs_tol=1e-9)
    assert math.isclose(req.dmi_max_kg, req.dmi_target_kg * 1.03, abs_tol=1e-9)


def test_fat_default_is_4():
    req = compute_requirements("lactating", 50.0, 2.5)
    assert req.milk_fat_percent == spec.FAT_DEFAULT_PCT
