# boundary_flags 规则与测试说明

- 定位：`ration_insights.boundary_flags` 是产品提示规则，只解释“已达标但余量较小”的约束，不参与 `qualified`、`status`、`do_not_feed`、`violations` 判定。
- 数据来源：全部使用“最终 10 g 原物质用量 + 完整原料参数”复算出的内部完整精度值。
- 命名语义：`dmi_target_kg` = 动物模型预测 DMI；`total_dm_kg` = 最终显示配方重新计算出的日粮总 DM。二者严格分开，`feed_cap` 的分母固定使用 `total_dm_kg`。
- 舍入隔离：`qualified`、`violations`、`boundary_flags` 一律用内部完整精度判断；页面格式化值（`nutrients` 等 2 位/3 位小数）只用于展示，不得回流参与任何判断。
- 输出格式：每条 flag 固定为 `{code, label, detail, metric, value, limit, margin, unit}`；DMI/ME 额外带 `margin_pct`。`code` 用于前端去重和产品埋点，不进入数学状态。

## 1. 固定触发公式与阈值

| code | 前置条件 | 触发公式 | 固定阈值 |
| --- | --- | --- | --- |
| `dmi_upper` | `dmi` 状态 `pass=true` | `total_dm_kg >= dmi_max_kg - 0.02 * dmi_target_kg` | `BOUNDARY_DMI_MARGIN_FRACTION = 0.02` |
| `dmi_lower` | `dmi` 状态 `pass=true` | `total_dm_kg <= dmi_min_kg + 0.02 * dmi_target_kg` | `BOUNDARY_DMI_MARGIN_FRACTION = 0.02` |
| `me_min` | `me` 状态 `pass=true` | `me_mj - me_requirement_mj <= 0.02 * me_requirement_mj` | `BOUNDARY_ME_MARGIN_FRACTION = 0.02` |
| `cp_lower` | `cp` 状态 `pass=true` | `cp_pct_dm - cp_min_pct <= 1.0` | `BOUNDARY_PCT_MARGIN_POINTS = 1.0` |
| `cp_upper` | `cp` 状态 `pass=true` | `cp_max_pct - cp_pct_dm <= 1.0` | `BOUNDARY_PCT_MARGIN_POINTS = 1.0` |
| `ndf_lower` | `ndf` 状态 `pass=true` | `ndf_pct_dm - ndf_min_pct <= 1.0` | `BOUNDARY_PCT_MARGIN_POINTS = 1.0` |
| `ndf_upper` | `ndf` 状态 `pass=true` | `ndf_max_pct - ndf_pct_dm <= 1.0` | `BOUNDARY_PCT_MARGIN_POINTS = 1.0` |
| `forage_lower` | `forage` 状态 `pass=true` | `forage_pct_dm - forage_min_frac * 100 <= 1.0` | `BOUNDARY_PCT_MARGIN_POINTS = 1.0` |
| `ca_lower` | `ca` 状态 `pass=true` | `ca_pct_dm - ca_min_pct <= 0.1` | `BOUNDARY_MINERAL_MARGIN_POINTS = 0.1` |
| `p_lower` | `p` 状态 `pass=true` | `p_pct_dm - p_min_pct <= 0.1` | `BOUNDARY_MINERAL_MARGIN_POINTS = 0.1` |
| `ca_p_lower` | `ca_p` 状态 `pass=true` | `ca_p_ratio - ca_p_ratio_min <= 0.05` | `BOUNDARY_CA_P_RATIO_MARGIN = 0.05` |
| `ca_p_upper` | `ca_p` 状态 `pass=true` | `ca_p_ratio_max - ca_p_ratio <= 0.05` | `BOUNDARY_CA_P_RATIO_MARGIN = 0.05` |
| `feed_cap:<feed_id>` | 该原料出现在最终配方中 | `dm_share_pct = as_fed_kg * dm_fraction / total_dm_kg * 100`，触发条件为 `dm_share_pct <= max_usage_pct_dm` 且 `max_usage_pct_dm - dm_share_pct <= 1.0` | `BOUNDARY_FEED_CAP_MARGIN_POINTS = 1.0` |

说明：

- 所有公式中的 `value` 为完整精度复算值；`limit` 为对应约束边界；`margin = limit - value`（`dmi_upper`、`me_min` 等下限类为 `value - limit`）。前端、AI、日志只读取这些确定性字段，不自行重算“接近多少”。
- DMI、ME、CP、NDF、粗饲料比例、Ca、P、Ca:P 的贴边提示只在对应 `nutrient_status.pass=true` 时生成；未达标指标只出现在 `violations` 或营养复核表中，不会同时被标记为“贴边”。
- CP、NDF、Ca:P 同时满足上下界贴边条件时，底层同时返回 `*_lower` 和 `*_upper` 两个 code，由 UI 合并成一句“位于较窄允许区间”的解释，便于测试与埋点。
- `feed_cap:<feed_id>` 是原料用量上限的产品提示，不依赖营养状态，但只描述“接近上限”，不改变任何判定；超过上限的原料进入 `violations`，不会生成贴边提示。
- 阈值全部按完整精度判断：`margin == 阈值` 时触发（公式为 `<=`），`margin` 略大于阈值时立即不触发。页面文案统一为“余量不超过 X% / X 个百分点”，不再写“不足”。

## 2. 三类确定性测试

新增测试位于 `backend/tests/test_insights.py`：

| 测试 | 验证内容 |
| --- | --- |
| `test_contribution_shares_handle_zero_total_without_division_by_zero` | ME/CP 总贡献为 0 时返回空列表，不触发除零错误。 |
| `test_insights_do_not_mutate_math_result` | 生成 `ration_insights` 前后，`optimize_ration` 的完整结果深比较相等；`status`、`qualified`、`nutrient_status.pass` 均不变化。 |
| `test_scope_notice_is_deterministic_and_ai_cannot_change_it` | `scope_notice` 固定等于 `SCOPE_NOTICE`；AI 载荷携带同一常量；AI 输出 schema 中不存在 `scope_notice`，因此 AI 无法改写。 |
| `test_boundary_thresholds_are_fixed_constants` | 六个阈值常量固定为 `0.02 / 0.02 / 1.0 / 0.1 / 0.05 / 1.0`。 |
| `test_dmi_upper_boundary_is_inclusive_at_threshold` | DMI 恰等于 `dmi_max - 2% * dmi_target` 时触发；再小 `1e-6` 不触发；到达 `dmi_max` 仍触发。 |
| `test_me_min_boundary_is_inclusive_at_threshold` | ME 余量恰为 2% 时触发；余量为 2.0001% 时不触发；返回 `margin=2.0`、`margin_pct=2.0`。 |
| `test_forage_lower_boundary_is_inclusive_at_threshold` | 粗饲料余量恰为 1.0 个百分点时触发；1.0001 个百分点时不触发。 |
| `test_feed_cap_boundary_is_inclusive_at_threshold` | 原料恰好达到上限（margin=0）与余量恰为 1.0 个百分点时触发；余量 1.0001 时不触发；超过上限不触发（归 `violations`）。 |
| `test_dual_lower_upper_boundary_flags_are_both_retained` | CP/NDF/Ca:P 上下界同时贴边时底层保留两个 code，供 UI 合并展示。 |
| `test_boundary_flags_return_deterministic_value_limit_margin` | 每条 flag 带 `metric/value/limit/margin/unit`，DMI/ME 带 `margin_pct`，`margin = limit - value`。 |
| `test_insights_use_full_precision_not_rounded_display_values` | 篡改页面舍入值后 insights 不变；insights 只读取完整原料参数复算值。 |
| `test_insights_include_complete_sorted_source_lists` | `me_sources_all` / `cp_sources_all` 返回完整排序，`top_*` 固定取前 3。 |

## 3. 测试结果

- 后端：`70 passed`，含 V1.0 数学回归基线与新增边界规则测试。
- 前端：`15 passed`，覆盖结果页“数学资格 / 营养复算 / 余量提醒”三层展示、上下界贴边合并文案与既有页面流程。
- 生产构建：`npm run build` 通过，含 TypeScript 类型检查与 Vite 打包。
- 黄金样例：50 kg / 2.5 kg 奶 / 4% 乳脂输入下，totals、nutrients、feed_rows、rounding 与 V1.0 完全一致；另锁定 `boundary_flag_codes = {dmi_upper, me_min, forage_lower, ca_lower, p_lower, feed_cap:rapeseed_meal}` 与 `ration_insights.version/total_dm_kg/me_sources_all/cp_sources_all`。
