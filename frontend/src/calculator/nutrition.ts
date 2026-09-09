// 营养需求计算模块（100% 对齐 nutrition.py 与行业标准 NY/T 2835）
import type { AnimalClass, Requirements as ReqType } from "../types";
import * as spec from "./spec";

export interface Requirements extends ReqType {
  animal_class: AnimalClass;
  body_weight_kg: number;
  milk_kg: number | null;
  milk_fat_percent: number | null;
  fcm4_kg: number;
  fcm35_kg: number;
  milk_fat_kg: number;
  dmi_target_kg: number;
  dmi_min_kg: number;
  dmi_max_kg: number;
  me_maintenance_mj: number;
  me_lactation_mj: number;
  me_requirement_mj: number;
  cp_min_pct: number;
  cp_max_pct: number;
  ndf_min_pct: number;
  ndf_max_pct: number;
  forage_min_frac: number;
  ca_min_pct: number;
  p_min_pct: number;
  ca_p_ratio_min: number;
  ca_p_ratio_max: number;
  salt_fraction: number;
}

export function metabolicWeight(bw: number): number {
  return Math.pow(bw, 0.75);
}

export function fcm4(milk: number, fatPct: number): number {
  return milk * (0.40 + 0.15 * fatPct);
}

export function milkFatKg(milk: number, fatPct: number): number {
  return (milk * fatPct) / 100.0;
}

export function fcm35(milk: number, fatPct: number): number {
  return 0.432 * milk + 16.23 * milkFatKg(milk, fatPct);
}

export function dmiLactating(bw: number, milk: number, fatPct: number): number {
  return 0.062 * metabolicWeight(bw) + 0.305 * fcm35(milk, fatPct);
}

export function dmiMaintenance(bw: number): number {
  return 0.062 * metabolicWeight(bw);
}

export function meMaintenance(bw: number): number {
  return 0.5013 * metabolicWeight(bw);
}

export function meLactation(fcm4Val: number): number {
  return 5.224 * fcm4Val;
}

export function cpFloorLactating(fcm4Val: number): number {
  for (const [upper, floor] of spec.CP_LACTATING_TIERS) {
    if (fcm4Val <= upper) return floor;
  }
  return spec.CP_LACTATING_TIERS[spec.CP_LACTATING_TIERS.length - 1][1];
}

export function computeRequirements(
  animalClass: AnimalClass,
  bodyWeightKg: number,
  milkKg?: number | null,
  milkFatPercent?: number | null,
): Requirements {
  const fat = milkFatPercent ?? spec.FAT_DEFAULT_PCT;

  let milk = 0.0;
  let fcm4v = 0.0;
  let fcm35v = 0.0;
  let fatKg = 0.0;
  let dmi = 0.0;
  let meM = 0.0;
  let meL = 0.0;
  let cpBase = 0.0;
  let ndfLo = 0.0;
  let ndfHi = 0.0;
  let forageMin = 0.0;
  let caMin = 0.0;
  let pMin = 0.0;

  if (animalClass === "maintenance") {
    dmi = dmiMaintenance(bodyWeightKg);
    meM = meMaintenance(bodyWeightKg);
    cpBase = spec.CP_MAINTENANCE_MIN_PCT;
    [ndfLo, ndfHi] = spec.NDF_MAINTENANCE;
    forageMin = spec.FORAGE_MAINTENANCE_MIN;
    caMin = spec.CA_MAINTENANCE_MIN_PCT;
    pMin = spec.P_MAINTENANCE_MIN_PCT;
  } else {
    milk = milkKg ?? 0.0;
    fcm4v = fcm4(milk, fat);
    fcm35v = fcm35(milk, fat);
    fatKg = milkFatKg(milk, fat);
    dmi = dmiLactating(bodyWeightKg, milk, fat);
    meM = meMaintenance(bodyWeightKg);
    meL = meLactation(fcm4v);
    cpBase = cpFloorLactating(fcm4v);
    [ndfLo, ndfHi] = spec.NDF_LACTATING;
    forageMin = spec.FORAGE_LACTATING_MIN;
    caMin = spec.CA_LACTATING_MIN_PCT;
    pMin = spec.P_LACTATING_MIN_PCT;
  }

  const cpMin = Math.min(spec.CP_MAX_DM_PCT, cpBase * (1.0 + spec.CP_MARGIN));
  const meMin = (meM + meL) * (1.0 + spec.ME_MARGIN);

  return {
    animal_class: animalClass,
    body_weight_kg: bodyWeightKg,
    milk_kg: animalClass === "lactating" ? milk : null,
    milk_fat_percent: animalClass === "lactating" ? fat : null,
    fcm4_kg: fcm4v,
    fcm35_kg: fcm35v,
    milk_fat_kg: fatKg,
    dmi_target_kg: dmi,
    dmi_min_kg: dmi * (1.0 - spec.DMI_TOLERANCE),
    dmi_max_kg: dmi * (1.0 + spec.DMI_TOLERANCE),
    me_maintenance_mj: meM,
    me_lactation_mj: meL,
    me_requirement_mj: meMin,
    cp_min_pct: cpMin,
    cp_max_pct: spec.CP_MAX_DM_PCT,
    ndf_min_pct: ndfLo,
    ndf_max_pct: ndfHi,
    forage_min_frac: forageMin,
    ca_min_pct: caMin,
    p_min_pct: pMin,
    ca_p_ratio_min: spec.CAP_RATIO_MIN,
    ca_p_ratio_max: spec.CAP_RATIO_MAX,
    salt_fraction: spec.SALT_FRACTION,
  };
}
