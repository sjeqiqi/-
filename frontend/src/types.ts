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
