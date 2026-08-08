"""PROJECT_PLAN.md 中所有固定数值的唯一定义处。

任何修改都必须与 PROJECT_PLAN.md 逐条核对；改动会影响数学约束与验收标准。
"""
from __future__ import annotations

# ---- 输入适用范围（超出即 4xx） ----
WEIGHT_MIN_KG = 25.0
WEIGHT_MAX_KG = 90.0
MILK_MIN_KG = 0.2
MILK_MAX_KG = 5.0
FAT_MIN_PCT = 2.0
FAT_MAX_PCT = 7.0
FAT_DEFAULT_PCT = 4.0

# ---- 安全余量与取整 ----
DMI_TOLERANCE = 0.03          # DMI 目标 ±3%
ME_MARGIN = 0.05              # ME 固定 5% 安全余量
CP_MARGIN = 0.05              # CP 下限再乘 5% 计算余量
CP_MAX_DM_PCT = 20.0          # CP 上限固定 20% DM
SALT_FRACTION = 0.005         # 食盐固定为日粮干物质的 0.5%
SALT_TOLERANCE_KG = 0.005     # 食盐复算容差：半个 10 g 显示步长（取整分辨率固有误差）
ROUND_STEP_KG = 0.01          # 10 g 原物质取整（=0.01 kg）
REPAIR_MAX_ITERATIONS = 200   # 小步修正最大迭代次数（0.01 kg 步长）

# ---- 尽力解（approximate）矿物质安全上界（基于目标 DMI，而非实际 DMI） ----
# 只用于 fallback：食盐上界 = 0.5% 目标干物质 + 半个 10 g 步长（SALT_TOLERANCE_KG）；
# 石灰石上界 = 目标干物质的 2% + 一个 10 g 步长。防止用盐/石粉做体积填充。
LIMESTONE_FALLBACK_MAX_PCT_DM = 2.0

# ---- 维持期营养目标 ----
CP_MAINTENANCE_MIN_PCT = 9.0
NDF_MAINTENANCE = (30.0, 55.0)     # % DM
FORAGE_MAINTENANCE_MIN = 0.70      # 粗饲料比例 ≥70% DM
CA_MAINTENANCE_MIN_PCT = 0.18
P_MAINTENANCE_MIN_PCT = 0.14

# ---- 泌乳期营养目标（按 FCM4 分档的 CP 下限） ----
# 每项为 (FCM4 上限 kg/d, CP 下限 %DM)，按顺序判断
CP_LACTATING_TIERS = ((1.0, 12.0), (2.5, 14.0), (3.5, 16.0), (float("inf"), 18.0))
NDF_LACTATING = (28.0, 45.0)       # % DM
FORAGE_LACTATING_MIN = 0.50        # 粗饲料比例 ≥50% DM
CA_LACTATING_MIN_PCT = 0.65
P_LACTATING_MIN_PCT = 0.35

# ---- 钙磷比（所有阶段） ----
CAP_RATIO_MIN = 1.5
CAP_RATIO_MAX = 2.0

# ---- 复算仅使用浮点数值容差 ----
# 10 g 取整误差必须由 round_and_repair 真正修正，不能靠放宽营养下限掩盖。
# 食盐因显示步长固定为 10 g，单独保留 SALT_TOLERANCE_KG。
EPS_DMI_KG = 1e-9
EPS_PCT_POINT = 1e-9
EPS_CAP_RATIO = 1e-9
EPS_DM_KG = 1e-9
EPS_ME_MJ = 1e-9

# ---- API / 产品元数据 ----
API_TITLE = "奶山羊常用原料日粮配比助手"
SERVICE_NAME = "dairy-goat-ration-mvp"
VERSION = "0.1.0"
