import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type {
  ApproximateRation,
  CalibrateResult,
  FeedCatalogResponse,
  InfeasibleRation,
  FeasibleRation,
} from "../types";

// ---------- 测试数据 ----------
const CATALOG: FeedCatalogResponse = {
  version: "v1",
  note: "测试数据",
  sources: [],
  feeds: [
    { feed_id: "corn", name: "玉米", category: "concentrate", dm_pct: 86, me_mj_per_kg_dm: 14, cp_pct_dm: 8, ndf_pct_dm: 9.5, ca_pct_dm: 0.02, p_pct_dm: 0.28, default_price_rmb_per_kg: 2.4, max_usage_pct_dm: 35, is_estimate: true, source_name: "s", source_url: "", overridden: false },
    { feed_id: "soybean_meal", name: "豆粕", category: "concentrate", dm_pct: 89, me_mj_per_kg_dm: 14, cp_pct_dm: 46, ndf_pct_dm: 13.5, ca_pct_dm: 0.32, p_pct_dm: 0.62, default_price_rmb_per_kg: 3.6, max_usage_pct_dm: 20, is_estimate: true, source_name: "s", source_url: "", overridden: false },
    { feed_id: "alfalfa_hay", name: "苜蓿干草", category: "forage", dm_pct: 90, me_mj_per_kg_dm: 9.5, cp_pct_dm: 17, ndf_pct_dm: 42, ca_pct_dm: 1.3, p_pct_dm: 0.28, default_price_rmb_per_kg: 2.0, max_usage_pct_dm: 70, is_estimate: true, source_name: "s", source_url: "", overridden: false },
    { feed_id: "corn_silage", name: "全株玉米青贮", category: "forage", dm_pct: 30, me_mj_per_kg_dm: 10.6, cp_pct_dm: 7, ndf_pct_dm: 48, ca_pct_dm: 0.25, p_pct_dm: 0.1, default_price_rmb_per_kg: 0.45, max_usage_pct_dm: 60, is_estimate: true, source_name: "s", source_url: "", overridden: false },
    { feed_id: "salt", name: "食盐", category: "mineral", dm_pct: 100, me_mj_per_kg_dm: 0, cp_pct_dm: 0, ndf_pct_dm: 0, ca_pct_dm: 0, p_pct_dm: 0, default_price_rmb_per_kg: 1.0, max_usage_pct_dm: 100, is_estimate: false, source_name: "s", source_url: "", overridden: false },
  ],
};

const RATION_INSIGHTS = {
  version: "1.1",
  selected_feed_count: 5,
  used_feed_count: 3,
  total_dm_kg: 1.49,
  forage_dm_pct: 68.0,
  top_me_sources: [
    { feed_id: "corn_silage", name: "全株玉米青贮", contribution: 10.3, share_pct: 52.0 },
    { feed_id: "corn", name: "玉米", contribution: 6.45, share_pct: 32.5 },
    { feed_id: "soybean_meal", name: "豆粕", contribution: 3.05, share_pct: 15.4 },
  ],
  me_sources_all: [
    { feed_id: "corn_silage", name: "全株玉米青贮", contribution: 10.3, share_pct: 52.0 },
    { feed_id: "corn", name: "玉米", contribution: 6.45, share_pct: 32.5 },
    { feed_id: "soybean_meal", name: "豆粕", contribution: 3.05, share_pct: 15.4 },
  ],
  top_cp_sources: [
    { feed_id: "soybean_meal", name: "豆粕", contribution: 0.21, share_pct: 55.0 },
    { feed_id: "corn_silage", name: "全株玉米青贮", contribution: 0.07, share_pct: 18.0 },
  ],
  cp_sources_all: [
    { feed_id: "soybean_meal", name: "豆粕", contribution: 0.21, share_pct: 55.0 },
    { feed_id: "alfalfa_hay", name: "苜蓿干草", contribution: 0.1, share_pct: 27.0 },
    { feed_id: "corn_silage", name: "全株玉米青贮", contribution: 0.07, share_pct: 18.0 },
  ],
  boundary_flags: [
    {
      code: "dmi_upper",
      label: "干物质采食量接近上限",
      detail: "实际 1.49 kg/d，距上限 1.50 kg/d 仅 0.01 kg，余量不超过目标采食量的 2%。",
      metric: "dmi",
      value: 1.49,
      limit: 1.5,
      margin: 0.01,
      unit: "kg/d",
      margin_pct: 0.5,
    },
    {
      code: "cp_lower",
      label: "粗蛋白接近下限",
      detail: "实际 19.50%DM，距下限 18.90%DM 余量不超过 1 个百分点。",
      metric: "cp",
      value: 19.5,
      limit: 18.9,
      margin: 0.6,
      unit: "percentage_point",
    },
    {
      code: "cp_upper",
      label: "粗蛋白接近上限",
      detail: "实际 19.50%DM，距上限 20.00%DM 余量不超过 1 个百分点。",
      metric: "cp",
      value: 19.5,
      limit: 20.0,
      margin: 0.5,
      unit: "percentage_point",
    },
    {
      code: "forage_lower",
      label: "粗饲料比例接近下限",
      detail: "实际 68.00%DM，距下限 67.00%DM 余量不超过 1 个百分点。",
      metric: "forage",
      value: 68.0,
      limit: 67.0,
      margin: 1.0,
      unit: "percentage_point",
    },
  ],
  scope_notice: "当前模型仅计算代谢能、粗蛋白、NDF、钙、磷等宏量指标，不计算并保证维生素、微量元素及可代谢蛋白完整满足，因此不能据此认定为完整、长期、全价日粮。",
};

function makeFeasible(): FeasibleRation {
  return {
    status: "feasible",
      qualified: true,
    feed_rows: [
      { feed_id: "corn", name: "玉米", category: "concentrate", owned: true, purchased: false, as_fed_kg: 0.54, dm_kg: 0.46, price_rmb_per_kg: 2.4, cost_rmb: 1.3 },
      { feed_id: "corn_silage", name: "全株玉米青贮", category: "forage", owned: true, purchased: false, as_fed_kg: 3.4, dm_kg: 1.02, price_rmb_per_kg: 0.45, cost_rmb: 1.53 },
      { feed_id: "salt", name: "食盐", category: "mineral", owned: true, purchased: false, as_fed_kg: 0.01, dm_kg: 0.01, price_rmb_per_kg: 1.0, cost_rmb: 0.01 },
    ],
    totals: { as_fed_kg: 3.95, dm_kg: 1.49, cost_rmb: 2.84 },
    nutrients: { total_dm_kg: 1.49, dmi_kg: 1.49, dmi_pct_of_target: 100.0, me_mj: 20.0, me_density_mj_per_kg_dm: 13.4, cp_pct_dm: 15.0, ndf_pct_dm: 33.0, ca_pct_dm: 0.8, p_pct_dm: 0.4, ca_p_ratio: 2.0, forage_pct_dm: 68.0, salt_kg: 0.01 },
    nutrient_status: [
      { key: "dmi", label: "干物质采食量", target: "目标 1.99 kg/d，允许 ±3%", actual: 1.49, unit: "kg/d", pass: true },
      { key: "me", label: "代谢能", target: "≥ 23.61 MJ/d（含 5% 安全余量）", actual: 20.0, unit: "MJ/d", pass: true },
      { key: "cp", label: "粗蛋白", target: "14.7–20.0 %DM（宏量代理指标）", actual: 15.0, unit: "%DM", pass: true },
      { key: "ca_p", label: "钙磷比", target: "1.5–2.0", actual: 2.0, unit: "", pass: true },
    ],
    requirements: { animal_class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4, fcm4_kg: 2.5, fcm35_kg: 2.703, milk_fat_kg: 0.1, dmi_target_kg: 1.99, dmi_min_kg: 1.93, dmi_max_kg: 2.05, me_maintenance_mj: 9.43, me_lactation_mj: 13.06, me_requirement_mj: 23.61, cp_min_pct: 14.7, cp_max_pct: 20, ndf_min_pct: 28, ndf_max_pct: 45, forage_min_frac: 0.5, ca_min_pct: 0.65, p_min_pct: 0.35, ca_p_ratio_min: 1.5, ca_p_ratio_max: 2.0, salt_fraction: 0.005 },
    purchased_ids: [],
    management_tips: [
      "更换原料或调整日粮时应逐步过渡，具体周期和频次请结合养殖条件及专业人员建议确定。",
      "如果输入条件发生变化，请更新输入后重新计算，不建议直接人工修改各原料克数。",
    ],
    boundary_statements: ["默认成分数据为估算值。", "本结果不是疾病诊断或治疗建议，不承诺提高产奶量。"],
    dmi_target_kg: 1.99,
    rounding: { step_kg: 0.01, revalidated: true },
    ration_insights: RATION_INSIGHTS,
  };
}

function makeInfeasible(): InfeasibleRation {
  return {
    status: "infeasible",
    detail: "无法找到满足全部约束的配方。",
    reasons: [{ code: "me", message: "代谢能下限无法满足。" }],
    advice: "请增加原料种类或降低生产目标。",
  };
}

function makeApproximate(): ApproximateRation {
  return {
    status: "approximate",
    qualified: false,
    feed_rows: [
      { feed_id: "corn", name: "玉米", category: "concentrate", owned: true, purchased: false, as_fed_kg: 2.25, dm_kg: 1.94, price_rmb_per_kg: 2.4, cost_rmb: 5.4 },
    ],
    totals: { as_fed_kg: 2.25, dm_kg: 1.94, cost_rmb: 5.4 },
    nutrients: { total_dm_kg: 1.94, dmi_kg: 1.94, dmi_pct_of_target: 97.5, me_mj: 27.1, me_density_mj_per_kg_dm: 14.0, cp_pct_dm: 8.0, ndf_pct_dm: 9.5, ca_pct_dm: 0.02, p_pct_dm: 0.28, ca_p_ratio: 0.07, forage_pct_dm: 0.0, salt_kg: 0 },
    nutrient_status: [
      { key: "dmi", label: "干物质采食量", target: "目标 1.99 kg/d，允许 ±3%", actual: 1.94, unit: "kg/d", pass: true },
      { key: "cp", label: "粗蛋白", target: "14.7–20.0 %DM（宏量代理指标）", actual: 8.0, unit: "%DM", pass: false },
      { key: "forage", label: "粗饲料比例", target: "≥ 50 %DM", actual: 0.0, unit: "%DM", pass: false },
    ],
    requirements: { animal_class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4, fcm4_kg: 2.5, fcm35_kg: 2.703, milk_fat_kg: 0.1, dmi_target_kg: 1.99, dmi_min_kg: 1.93, dmi_max_kg: 2.05, me_maintenance_mj: 9.43, me_lactation_mj: 13.06, me_requirement_mj: 23.61, cp_min_pct: 14.7, cp_max_pct: 20, ndf_min_pct: 28, ndf_max_pct: 45, forage_min_frac: 0.5, ca_min_pct: 0.65, p_min_pct: 0.35, ca_p_ratio_min: 1.5, ca_p_ratio_max: 2.0, salt_fraction: 0.005 },
    purchased_ids: [],
    violations: [
      { code: "cp_band", message: "粗蛋白 8.00%DM 超出范围 [14.70, 20.00]%DM", severity: 0.456 },
      { code: "forage_ratio", message: "粗饲料比例 0.00%DM 低于下限 50%DM", severity: 1.0 },
    ],
    do_not_feed: false,
    detail: "仅使用当前勾选原料无法同时满足全部营养约束，这是这些原料范围内营养缺口最小的近似配比，不是合格配方；未勾选原料不会自动加入。",
    advice: "饲喂前必须由营养师或兽医逐项复核未达标项并补充原料；本结果不能直接作为完整日粮使用。",
    management_tips: ["更新输入后重新计算，不建议直接人工修改各原料克数。"],
    boundary_statements: ["默认成分数据为估算值。"],
    dmi_target_kg: 1.99,
    rounding: { step_kg: 0.01, revalidated: false },
    ration_insights: RATION_INSIGHTS,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const body = handler(url, _init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /下一步：选择原料/ }));
  await screen.findByText("第二步：选择原料并填写价格");
}

async function selectCorn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "自选模式" }));
  const boxes = screen.getAllByRole("checkbox");
  for (const box of boxes) {
    if ((box as HTMLInputElement).checked) await user.click(box);
  }
  await user.click(await screen.findByRole("checkbox", { name: "玉米 用于配方" }));
}

async function uncheckAll(user: ReturnType<typeof userEvent.setup>) {
  const boxes = screen.getAllByRole("checkbox");
  for (const box of boxes) {
    if ((box as HTMLInputElement).checked) await user.click(box);
  }
}

describe("App 三步流程", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) return makeFeasible();
      throw new Error("unexpected fetch: " + url);
    }));
  });

  it("首页说明用途、三步流程并突出推荐模式入口", () => {
    render(<App />);
    expect(screen.getByText(/输入羊只情况、原料和价格，自动计算推荐配方/)).toBeInTheDocument();
    const steps = screen.getByLabelText("使用步骤");
    expect(steps).toHaveTextContent("羊只信息");
    expect(steps).toHaveTextContent("原料选择");
    expect(steps).toHaveTextContent("计算结果");
    expect(screen.getByRole("button", { name: /使用推荐模式开始/ })).toHaveClass("primary");
    expect(screen.getByRole("button", { name: /使用自选模式/ })).toBeInTheDocument();
  });

  it("泌乳期显示产奶量与乳脂率字段", () => {
    render(<App />);
    expect(screen.getByLabelText("日产奶量（kg/d）")).toBeInTheDocument();
    expect(screen.getByLabelText("乳脂率（%，可选）")).toBeInTheDocument();
  });

  it("切换为维持期后隐藏产奶量与乳脂率字段", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText("羊只阶段"), "maintenance");
    expect(screen.queryByLabelText("日产奶量（kg/d）")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("乳脂率（%，可选）")).not.toBeInTheDocument();
  });

  it("体重越界时前端校验并停留在第一步", async () => {
    const user = userEvent.setup();
    render(<App />);
    const weight = screen.getByLabelText("体重（kg）");
    await user.clear(weight);
    await user.type(weight, "100");
    await user.click(screen.getByRole("button", { name: /下一步/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/请输入 25–90 kg 之间的体重/);
    expect(screen.getByText("第一步：填写羊只信息")).toBeInTheDocument();
  });

  it("未勾选任何允许原料时提示错误", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(screen.getByRole("radio", { name: "自选模式" }));
    await uncheckAll(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/请至少选择一种原料/);
  });

  it("推荐模式默认勾选候选原料池并说明勾选不等于最终使用", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(CATALOG.feeds.length);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/推荐原料池（适合不熟悉配方的用户）/)).toBeInTheDocument();
    expect(screen.getByText(/勾选表示允许系统使用，不代表最终配方一定会使用/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "精料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "粗饲料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "矿物质" })).toBeInTheDocument();
    expect(document.querySelectorAll(".feed-card")).toHaveLength(CATALOG.feeds.length);
  });

  it("推荐模式中取消的原料不会被后台重新加入", async () => {
    let captured: { feeds: { feed_id: string; owned: boolean }[] } | null = null;
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) {
        captured = JSON.parse(String(init?.body)) as { feeds: { feed_id: string; owned: boolean }[] };
        return makeFeasible();
      }
      throw new Error("unexpected fetch: " + url);
    }));
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(await screen.findByRole("checkbox", { name: "玉米 用于配方" }));
    await user.click(screen.getByRole("radio", { name: "自选模式" }));
    await user.click(screen.getByRole("radio", { name: "推荐模式" }));
    expect((screen.getByRole("checkbox", { name: "玉米 用于配方" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    const sent = captured as { feeds: { feed_id: string; owned: boolean }[] } | null;
    expect(sent?.feeds.find((f) => f.feed_id === "corn")?.owned).toBe(false);
  });

  it("自选模式少量原料显示黄色预提示但不阻止提交", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    expect(screen.getByText(/只选择 1–2 种原料/)).toBeInTheDocument();
    expect(screen.getByText(/还没有选择粗饲料/)).toBeInTheDocument();
    expect(screen.getByText(/还没有选择食盐/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
  });

  it("可行结果渲染原料表、达标状态与合计成本", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    await screen.findByText("玉米");
    expect(screen.getAllByText("已勾选").length).toBeGreaterThan(0);
    expect(screen.getByText("2.84 元/天")).toBeInTheDocument();
    expect(screen.getAllByText("达标").length).toBeGreaterThan(0);
    expect(screen.getByText(/更新输入后重新计算，不建议直接人工修改各原料克数/)).toBeInTheDocument();
    expect(screen.queryByText(/7 天|2–3 次/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/默认成分数据为估算值/).length).toBeGreaterThan(0);
    const summary = screen.getByLabelText("配方核心结果");
    expect(summary).toHaveTextContent("每日喂料总量");
    expect(summary).toHaveTextContent("干物质");
    expect(summary).toHaveTextContent("日成本");
    expect(summary).toHaveTextContent("配方合格");
  });

  it("可行结果渲染配方特点、贴边约束与使用风险", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    expect(screen.getByText("配方特点")).toBeInTheDocument();
    expect(screen.getByText(/以下比例、来源和边界状态均来自程序确定性计算/)).toBeInTheDocument();
    expect(screen.getByText(/主要能量来源：/)).toBeInTheDocument();
    expect(screen.getByText(/主要蛋白来源：/)).toBeInTheDocument();
    expect(screen.getByText("为什么这样配")).toBeInTheDocument();
    expect(screen.getAllByText(/干物质采食量接近上限/).length).toBeGreaterThan(0);
    expect(screen.getByText("使用建议")).toBeInTheDocument();
    expect(screen.getByText("风险提醒")).toBeInTheDocument();
    expect(screen.getByText(/不能据此认定为完整、长期、全价日粮/)).toBeInTheDocument();
    expect(screen.getByText(/本次结果特别提醒/)).toBeInTheDocument();
  });

  it("结果页按合格状态、营养复核、余量提醒三层展示", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    expect(screen.getByText("① 合格状态")).toBeInTheDocument();
    expect(screen.getByText("② 营养复核")).toBeInTheDocument();
    expect(screen.getByText("③ 余量提醒")).toBeInTheDocument();
    expect(screen.getByText(/以下为已达标指标的余量提醒，不影响本次配方合格判定/)).toBeInTheDocument();
    expect(document.querySelector(".boundary-meaning")).toHaveTextContent(
      /黄色提醒：只表示余量较小，不影响“配方合格”的判定/,
    );
  });

  it("上下界双重贴边合并为一句解释", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    expect(screen.getByText(/粗蛋白位于较窄允许区间/)).toBeInTheDocument();
    expect(screen.getByText(/距下限 0.60 个百分点、距上限 0.50 个百分点/)).toBeInTheDocument();
    expect(screen.queryByText(/粗蛋白接近下限/)).not.toBeInTheDocument();
    expect(screen.queryByText(/粗蛋白接近上限/)).not.toBeInTheDocument();
  });

  it("不可行结果显示结构化原因", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) return makeInfeasible();
      throw new Error("unexpected fetch: " + url);
    }));
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByRole("alert");
    expect(screen.getByText("无法生成可行配方")).toBeInTheDocument();
    expect(screen.getByText("代谢能下限无法满足。")).toBeInTheDocument();
  });

  it("后端 400 校验错误展示清晰信息", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) {
        return new Response(JSON.stringify({ detail: { message: "体重需在 25–90 kg 之间" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error("unexpected fetch: " + url);
    }));
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByRole("alert");
    expect(screen.getByText(/体重需在 25–90 kg 之间/)).toBeInTheDocument();
  });

  it("近似配比显示警告、表格、未达标约束且无 AI 校准按钮", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) return makeApproximate();
      throw new Error("unexpected fetch: " + url);
    }));
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByRole("alert");
    // 醒目警告：不是合格配方、禁止直接饲喂
    expect(screen.getByText(/这不是合格配方/)).toBeInTheDocument();
    expect(screen.getByText(/绝不能直接按此饲喂/)).toBeInTheDocument();
    // 配方表渲染勾选原料行与 10 g 用量，无购买语义
    expect(screen.getByText("玉米")).toBeInTheDocument();
    expect(screen.getAllByText("2.25").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已勾选").length).toBeGreaterThan(0);
    // 营养状态中列出未达标项
    expect(screen.getAllByText("未达标").length).toBeGreaterThan(0);
    // 未达标约束逐项列出
    expect(screen.getByText(/粗蛋白 8.00%DM 超出范围/)).toBeInTheDocument();
    expect(screen.getByText(/粗饲料比例 0.00%DM 低于下限/)).toBeInTheDocument();
    // 近似配比没有 AI 校准入口
    expect(screen.queryByRole("button", { name: /生成 AI 通俗解读/ })).not.toBeInTheDocument();
    expect(screen.queryByText("AI 通俗解读（可选）")).not.toBeInTheDocument();
  });

  it("AI 回退时显示本地说明且不改变结果", async () => {
    const fallback: CalibrateResult = {
      status: "ok",
      explanations: ["AI 解读暂不可用：未配置 DEEPSEEK_API_KEY。"],
      risks: ["默认成分数据为估算值。"],
      approved: true,
      calibration_note: "AI 未参与本次解读。",
      ai_unavailable: true,
    };
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) return makeFeasible();
      if (url.endsWith("/api/rations/calibrate")) return fallback;
      throw new Error("unexpected fetch: " + url);
    }));
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await selectCorn(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    await screen.findByText("第三步：配方结果");
    await screen.findByText("玉米");
    await user.click(screen.getByRole("button", { name: /生成 AI 通俗解读/ }));
    expect(await screen.findByTestId("ai-fallback")).toBeInTheDocument();
    // 结果表仍渲染配方克数（AI 回退不影响确定性结果）
    expect(screen.getByText("3.40")).toBeInTheDocument();
  });
});
