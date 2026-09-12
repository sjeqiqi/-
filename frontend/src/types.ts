// 与后端 API 结构对应的类型定义
export type AnimalClass = "lactating" | "maintenance";

export interface AnimalInput {
  class: AnimalClass;
  body_weight_kg: number;
  milk_kg?: number | null;
  milk_fat_percent?: number | null;
}

export interface FeedOverride {
  dm_pct?: number | null;
  me_mj_per_kg_dm?: number | null;
  cp_pct_dm?: number | null;
  ndf_pct_dm?: number | null;
  ca_pct_dm?: number | null;
  p_pct_dm?: number | null;
}

export interface FeedInput {
  feed_id: string;
  owned: boolean;
  price_rmb_per_kg?: number | null;
  override?: FeedOverride | null;
}

export interface CalculateRequest {
  animal: AnimalInput;
  feeds: FeedInput[];
}

export interface CatalogFeed {
  feed_id: string;
  name: string;
  category: "concentrate" | "forage" | "mineral";
  dm_pct: number;
  me_mj_per_kg_dm: number;
  cp_pct_dm: number;
  ndf_pct_dm: number;
  ca_pct_dm: number;
  p_pct_dm: number;
  default_price_rmb_per_kg: number;
  max_usage_pct_dm: number;
  is_estimate: boolean;
  source_name: string;
  source_url: string;
  overridden: boolean;
}

export interface FeedCatalogResponse {
  version: string;
  note: string;
  sources: { name: string; url: string }[];
  feeds: CatalogFeed[];
}

export interface FeedRow {
  feed_id: string;
  name: string;
  category: string;
  owned: boolean;
  purchased: boolean;
  as_fed_kg: number;
  dm_kg: number;
  price_rmb_per_kg: number;
  cost_rmb: number;
}

export interface Nutrients {
  total_dm_kg: number;
  dmi_kg: number;
  dmi_pct_of_target: number;
  me_mj: number;
  me_density_mj_per_kg_dm: number;
  cp_pct_dm: number;
  ndf_pct_dm: number;
  ca_pct_dm: number;
  p_pct_dm: number;
  ca_p_ratio: number | null;
  forage_pct_dm: number;
  salt_kg: number;
}

export interface Requirements {
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

export interface NutrientStatusItem {
  key: string;
  label: string;
  target: string;
  actual: number | null;
  unit: string;
  pass: boolean;
}

export interface InsightSource {
  feed_id: string;
  name: string;
  contribution: number;
  share_pct: number;
}

export interface BoundaryFlag {
  code: string;
  label: string;
  detail: string;
  metric: string;
  value: number;
  limit: number;
  margin: number;
  unit: string;
  margin_pct?: number;
}

export interface RationInsights {
  version: string;
  selected_feed_count: number;
  used_feed_count: number;
  total_dm_kg: number;
  forage_dm_pct: number | null;
  top_me_sources: InsightSource[];
  me_sources_all: InsightSource[];
  top_cp_sources: InsightSource[];
  cp_sources_all: InsightSource[];
  boundary_flags: BoundaryFlag[];
  scope_notice: string;
}

export interface FeasibleRation {
  status: "feasible";
  qualified: true;
  feed_rows: FeedRow[];
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  nutrients: Nutrients;
  nutrient_status: NutrientStatusItem[];
  requirements: Requirements;
  purchased_ids: string[];
  management_tips: string[];
  boundary_statements: string[];
  dmi_target_kg: number;
  rounding: { step_kg: number; revalidated: boolean };
  ration_insights: RationInsights;
}

export interface Violation {
  code: string;
  message: string;
  severity: number;
}

export interface InfeasibleRation {
  status: "infeasible";
  detail: string;
  reasons: { code: string; message: string }[];
  advice: string;
  management_tips?: string[];
  boundary_statements?: string[];
}

export interface ApproximateRation {
  status: "approximate";
  qualified: false;
  feed_rows: FeedRow[];
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  nutrients: Nutrients;
  nutrient_status: NutrientStatusItem[];
  requirements: Requirements;
  purchased_ids: string[];
  violations: Violation[];
  do_not_feed?: boolean;
  detail: string;
  advice: string;
  management_tips: string[];
  boundary_statements: string[];
  dmi_target_kg: number;
  rounding: { step_kg: number; revalidated: boolean };
  ration_insights: RationInsights;
}

export type RationResult = FeasibleRation | ApproximateRation | InfeasibleRation;

export interface CalibrateResult {
  status: "ok";
  explanations: string[];
  risks: string[];
  approved: boolean;
  calibration_note: string;
  ai_unavailable: boolean;
  fallback_reason?: string | null;
}

// 牧场主产区
export interface Region {
  id: string;
  name: string;
  desc: string;
  badge: string;
}

export const DEFAULT_REGIONS: Region[] = [
  {
    id: "guanzhong",
    name: "陕西关中优势产区",
    desc: "全国奶山羊全产业链核心基地（关中羊/莎能羊高产带）",
    badge: "国家核心区",
  },
  {
    id: "neimenggu",
    name: "内蒙古奶业优势带",
    desc: "草场与优质牧草资源带（羊草、苜蓿等粗饲料优势）",
    badge: "牧草优质带",
  },
  {
    id: "shandong",
    name: "山东黄淮海产区",
    desc: "集约化养殖与农副产物集散地（花生秧、玉米副产物优势）",
    badge: "集约示范区",
  },
  {
    id: "henan_hebei",
    name: "河南/河北农区产区",
    desc: "大宗农作物秸秆与全株青贮成本优势带",
    badge: "大宗农区",
  },
];

// 牧场羊群结构
export interface HerdStructure {
  lactatingPct: number;
  lactatingCount: number;
  growingPct: number;
  growingCount: number;
  lambPct: number;
  lambCount: number;
}

// 牧场信息模型
export interface PastureInfo {
  calcMode: "pasture" | "single";
  regionId: string;
  regionName: string;
  totalFlockCount: number;
  herdStructure: HerdStructure;
  coreTarget: "lactating" | "growing" | "lamb";
  coreTargetName: string;
  coreCount: number;
}

// 称重流水线原料项
export interface WeighFeedItem {
  feed_id: string;
  name: string;
  as_fed_kg: number;
  raw_g: number;
  target_g: number;
  tolerance_g: number;
  status: "pending" | "weighing" | "completed";
  weighed_g?: number | null;
}

export interface ScaleOption {
  key: string;
  label: string;
  ratio: number;
}

// 主产区行情与营养数据库
export interface RegionalFeedItem {
  price: number;
  dm_pct: number;
  me: number;
  cp_pct_dm: number;
  ndf_pct_dm: number;
  ca: number;
  p: number;
}

export interface RegionalFeedData {
  name: string;
  note: string;
  feeds: Record<string, RegionalFeedItem>;
}

export const REGIONAL_FEED_DATABASE: Record<string, RegionalFeedData> = {
  guanzhong: {
    name: "陕西关中优势产区",
    note: "关中/莎能奶山羊核心主产带，玉米、青贮及关中麦麸产地丰富",
    feeds: {
      corn: { price: 2.35, dm_pct: 86.0, me: 14.0, cp_pct_dm: 8.2, ndf_pct_dm: 9.5, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.85, dm_pct: 88.0, me: 10.2, cp_pct_dm: 15.2, ndf_pct_dm: 40.5, ca: 0.11, p: 0.92 },
      soybean_meal: { price: 3.55, dm_pct: 89.0, me: 14.0, cp_pct_dm: 46.5, ndf_pct_dm: 13.0, ca: 0.32, p: 0.62 },
      rapeseed_meal: { price: 2.70, dm_pct: 89.0, me: 11.0, cp_pct_dm: 36.0, ndf_pct_dm: 30.0, ca: 0.65, p: 1.02 },
      peanut_meal: { price: 2.95, dm_pct: 90.0, me: 13.0, cp_pct_dm: 47.0, ndf_pct_dm: 15.0, ca: 0.22, p: 0.55 },
      alfalfa_hay: { price: 2.10, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.5, ndf_pct_dm: 42.0, ca: 1.30, p: 0.28 },
      corn_stover: { price: 0.45, dm_pct: 90.0, me: 6.5, cp_pct_dm: 5.5, ndf_pct_dm: 68.0, ca: 0.45, p: 0.08 },
      peanut_vine: { price: 0.95, dm_pct: 90.0, me: 8.3, cp_pct_dm: 10.0, ndf_pct_dm: 52.0, ca: 1.40, p: 0.20 },
      sheep_grass: { price: 1.60, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.10, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.42, dm_pct: 32.0, me: 10.6, cp_pct_dm: 7.2, ndf_pct_dm: 46.0, ca: 0.25, p: 0.10 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.40, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 },
    },
  },
  neimenggu: {
    name: "内蒙古奶业优势带",
    note: "高纬度光照充足，羊草、燕麦干草与苜蓿草场低价优势",
    feeds: {
      corn: { price: 2.45, dm_pct: 86.5, me: 13.8, cp_pct_dm: 8.0, ndf_pct_dm: 9.8, ca: 0.02, p: 0.27 },
      wheat_bran: { price: 1.95, dm_pct: 88.0, me: 10.0, cp_pct_dm: 14.8, ndf_pct_dm: 41.5, ca: 0.10, p: 0.90 },
      soybean_meal: { price: 3.70, dm_pct: 89.0, me: 14.0, cp_pct_dm: 46.0, ndf_pct_dm: 13.5, ca: 0.30, p: 0.60 },
      rapeseed_meal: { price: 2.85, dm_pct: 89.0, me: 11.0, cp_pct_dm: 35.5, ndf_pct_dm: 30.5, ca: 0.65, p: 1.00 },
      peanut_meal: { price: 3.15, dm_pct: 90.0, me: 12.8, cp_pct_dm: 46.5, ndf_pct_dm: 15.5, ca: 0.20, p: 0.52 },
      alfalfa_hay: { price: 1.80, dm_pct: 91.0, me: 9.8, cp_pct_dm: 18.2, ndf_pct_dm: 40.0, ca: 1.35, p: 0.30 },
      corn_stover: { price: 0.40, dm_pct: 90.0, me: 6.5, cp_pct_dm: 5.2, ndf_pct_dm: 69.0, ca: 0.42, p: 0.08 },
      peanut_vine: { price: 1.10, dm_pct: 90.0, me: 8.1, cp_pct_dm: 9.5, ndf_pct_dm: 53.0, ca: 1.35, p: 0.18 },
      sheep_grass: { price: 1.25, dm_pct: 92.0, me: 8.8, cp_pct_dm: 8.6, ndf_pct_dm: 58.0, ca: 0.38, p: 0.20 },
      oat_hay: { price: 1.75, dm_pct: 91.0, me: 9.2, cp_pct_dm: 9.5, ndf_pct_dm: 53.0, ca: 0.32, p: 0.26 },
      corn_silage: { price: 0.45, dm_pct: 31.0, me: 10.5, cp_pct_dm: 7.0, ndf_pct_dm: 47.0, ca: 0.24, p: 0.10 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.42, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 },
    },
  },
  shandong: {
    name: "山东黄淮海产区",
    note: "沿海港口蛋白饲料加工集聚，花生秧及副产物成本优势显著",
    feeds: {
      corn: { price: 2.28, dm_pct: 86.5, me: 14.1, cp_pct_dm: 8.2, ndf_pct_dm: 9.2, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.80, dm_pct: 88.5, me: 10.2, cp_pct_dm: 15.3, ndf_pct_dm: 40.0, ca: 0.11, p: 0.94 },
      soybean_meal: { price: 3.48, dm_pct: 89.5, me: 14.2, cp_pct_dm: 47.0, ndf_pct_dm: 12.8, ca: 0.32, p: 0.64 },
      rapeseed_meal: { price: 2.65, dm_pct: 89.0, me: 11.2, cp_pct_dm: 36.2, ndf_pct_dm: 29.5, ca: 0.66, p: 1.05 },
      peanut_meal: { price: 2.80, dm_pct: 90.5, me: 13.2, cp_pct_dm: 47.8, ndf_pct_dm: 14.5, ca: 0.24, p: 0.58 },
      alfalfa_hay: { price: 2.25, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.2, ndf_pct_dm: 42.5, ca: 1.28, p: 0.27 },
      corn_stover: { price: 0.42, dm_pct: 89.5, me: 6.5, cp_pct_dm: 5.6, ndf_pct_dm: 67.5, ca: 0.46, p: 0.09 },
      peanut_vine: { price: 0.78, dm_pct: 89.0, me: 8.4, cp_pct_dm: 10.5, ndf_pct_dm: 50.0, ca: 1.45, p: 0.22 },
      sheep_grass: { price: 1.70, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.15, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.40, dm_pct: 30.5, me: 10.6, cp_pct_dm: 7.2, ndf_pct_dm: 46.5, ca: 0.25, p: 0.11 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.38, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 },
    },
  },
  henan_hebei: {
    name: "河南/河北农区产区",
    note: "黄淮海传统粮仓大区，玉米青贮与小麦麸大宗原料供应充足",
    feeds: {
      corn: { price: 2.30, dm_pct: 86.0, me: 14.0, cp_pct_dm: 8.1, ndf_pct_dm: 9.5, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.75, dm_pct: 88.5, me: 10.3, cp_pct_dm: 15.5, ndf_pct_dm: 39.8, ca: 0.11, p: 0.95 },
      soybean_meal: { price: 3.52, dm_pct: 89.0, me: 14.1, cp_pct_dm: 46.5, ndf_pct_dm: 13.2, ca: 0.32, p: 0.63 },
      rapeseed_meal: { price: 2.70, dm_pct: 89.0, me: 11.0, cp_pct_dm: 36.0, ndf_pct_dm: 30.0, ca: 0.65, p: 1.02 },
      peanut_meal: { price: 2.90, dm_pct: 90.0, me: 13.0, cp_pct_dm: 47.0, ndf_pct_dm: 15.0, ca: 0.22, p: 0.55 },
      alfalfa_hay: { price: 2.15, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.3, ndf_pct_dm: 42.0, ca: 1.30, p: 0.28 },
      corn_stover: { price: 0.40, dm_pct: 90.0, me: 6.6, cp_pct_dm: 5.6, ndf_pct_dm: 67.0, ca: 0.46, p: 0.09 },
      peanut_vine: { price: 0.88, dm_pct: 89.5, me: 8.3, cp_pct_dm: 10.2, ndf_pct_dm: 51.0, ca: 1.42, p: 0.21 },
      sheep_grass: { price: 1.65, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.10, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.38, dm_pct: 30.0, me: 10.8, cp_pct_dm: 7.2, ndf_pct_dm: 46.0, ca: 0.26, p: 0.11 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.38, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 },
    },
  },
};


