// 规格常数定义（100% 对齐 spec.py 与行业标准 NY/T 2835）

// 输入适用范围
export const WEIGHT_MIN_KG = 25.0;
export const WEIGHT_MAX_KG = 90.0;
export const MILK_MIN_KG = 0.2;
export const MILK_MAX_KG = 5.0;
export const FAT_MIN_PCT = 2.0;
export const FAT_MAX_PCT = 7.0;
export const FAT_DEFAULT_PCT = 4.0;

// 安全余量与取整
export const DMI_TOLERANCE = 0.03;          // DMI 目标 ±3%
export const ME_MARGIN = 0.05;              // ME 固定 5% 安全余量
export const CP_MARGIN = 0.05;              // CP 下限乘 5% 计算余量
export const CP_MAX_DM_PCT = 20.0;          // CP 上限固定 20% DM
export const SALT_FRACTION = 0.005;         // 食盐固定为日粮干物质的 0.5%
export const SALT_TOLERANCE_KG = 0.005;     // 食盐复算容差：半个 10 g 步长
export const ROUND_STEP_KG = 0.01;          // 10 g 原物质取整（=0.01 kg）
export const REPAIR_MAX_ITERATIONS = 200;   // 小步修正最大迭代次数

// 尽力解（approximate）安全上限
export const LIMESTONE_FALLBACK_MAX_PCT_DM = 2.0;

// 维持期营养目标
export const CP_MAINTENANCE_MIN_PCT = 9.0;
export const NDF_MAINTENANCE: [number, number] = [30.0, 55.0];
export const FORAGE_MAINTENANCE_MIN = 0.70;
export const CA_MAINTENANCE_MIN_PCT = 0.18;
export const P_MAINTENANCE_MIN_PCT = 0.14;

// 泌乳期营养目标（按 FCM4 分档）
export const CP_LACTATING_TIERS: [number, number][] = [
  [1.0, 12.0],
  [2.5, 14.0],
  [3.5, 16.0],
  [Infinity, 18.0],
];
export const NDF_LACTATING: [number, number] = [28.0, 45.0];
export const FORAGE_LACTATING_MIN = 0.50;
export const CA_LACTATING_MIN_PCT = 0.65;
export const P_LACTATING_MIN_PCT = 0.35;

// 钙磷比
export const CAP_RATIO_MIN = 1.5;
export const CAP_RATIO_MAX = 2.0;

// 复算容差
export const EPS_DMI_KG = 1e-9;
export const EPS_PCT_POINT = 1e-9;
export const EPS_CAP_RATIO = 1e-9;
export const EPS_DM_KG = 1e-9;
export const EPS_ME_MJ = 1e-9;

export const SERVICE_NAME = "dairy-goat-ration-mvp";
export const VERSION = "0.1.0";
