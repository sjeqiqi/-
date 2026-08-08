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

function makeFeasible(): FeasibleRation {
  return {
    status: "feasible",
    feed_rows: [
      { feed_id: "corn", name: "玉米", category: "concentrate", owned: true, purchased: false, as_fed_kg: 0.54, dm_kg: 0.46, price_rmb_per_kg: 2.4, cost_rmb: 1.3 },
      { feed_id: "corn_silage", name: "全株玉米青贮", category: "forage", owned: true, purchased: false, as_fed_kg: 3.4, dm_kg: 1.02, price_rmb_per_kg: 0.45, cost_rmb: 1.53 },
      { feed_id: "salt", name: "食盐", category: "mineral", owned: true, purchased: false, as_fed_kg: 0.01, dm_kg: 0.01, price_rmb_per_kg: 1.0, cost_rmb: 0.01 },
    ],
    totals: { as_fed_kg: 3.95, dm_kg: 1.49, cost_rmb: 2.84 },
    nutrients: { dmi_kg: 1.49, dmi_pct_of_target: 100.0, me_mj: 20.0, me_density_mj_per_kg_dm: 13.4, cp_pct_dm: 15.0, ndf_pct_dm: 33.0, ca_pct_dm: 0.8, p_pct_dm: 0.4, ca_p_ratio: 2.0, forage_pct_dm: 68.0, salt_kg: 0.01 },
    nutrient_status: [
      { key: "dmi", label: "干物质采食量", target: "目标 1.99 kg/d，允许 ±3%", actual: 1.49, unit: "kg/d", pass: true },
      { key: "me", label: "代谢能", target: "≥ 23.61 MJ/d（含 5% 安全余量）", actual: 20.0, unit: "MJ/d", pass: true },
      { key: "cp", label: "粗蛋白", target: "14.7–20.0 %DM（宏量代理指标）", actual: 15.0, unit: "%DM", pass: true },
      { key: "ca_p", label: "钙磷比", target: "1.5–2.0", actual: 2.0, unit: "", pass: true },
    ],
    requirements: { animal_class: "lactating", body_weight_kg: 50, milk_kg: 2.5, milk_fat_percent: 4, fcm4_kg: 2.5, fcm35_kg: 2.703, milk_fat_kg: 0.1, dmi_target_kg: 1.99, dmi_min_kg: 1.93, dmi_max_kg: 2.05, me_maintenance_mj: 9.43, me_lactation_mj: 13.06, me_requirement_mj: 23.61, cp_min_pct: 14.7, cp_max_pct: 20, ndf_min_pct: 28, ndf_max_pct: 45, forage_min_frac: 0.5, ca_min_pct: 0.65, p_min_pct: 0.35, ca_p_ratio_min: 1.5, ca_p_ratio_max: 2.0, salt_fraction: 0.005 },
    purchased_ids: [],
    management_tips: ["7 天渐进换料。", "分次饲喂并保证饮水。"],
    boundary_statements: ["默认成分数据为估算值。", "仅覆盖宏量指标。"],
    dmi_target_kg: 1.99,
    rounding: { step_kg: 0.01, revalidated: true },
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
    nutrients: { dmi_kg: 1.94, dmi_pct_of_target: 97.5, me_mj: 27.1, me_density_mj_per_kg_dm: 14.0, cp_pct_dm: 8.0, ndf_pct_dm: 9.5, ca_pct_dm: 0.02, p_pct_dm: 0.28, ca_p_ratio: 0.07, forage_pct_dm: 0.0, salt_kg: 0 },
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
    management_tips: ["7 天渐进换料。"],
    boundary_statements: ["默认成分数据为估算值。"],
    dmi_target_kg: 1.99,
    rounding: { step_kg: 0.01, revalidated: false },
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
  await user.click(screen.getByRole("button", { name: /下一步：原料与价格/ }));
  await screen.findByText("第二步：原料与价格");
}

async function selectCorn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("checkbox", { name: "玉米 用于配方" }));
}

describe("App 三步流程", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/api/feeds")) return CATALOG;
      if (url.endsWith("/api/rations/calculate")) return makeFeasible();
      throw new Error("unexpected fetch: " + url);
    }));
  });

  it("泌乳期显示产奶量与乳脂率字段", () => {
    render(<App />);
    expect(screen.getByLabelText("日产奶量（kg/d）")).toBeInTheDocument();
    expect(screen.getByLabelText("乳脂率（%，可选）")).toBeInTheDocument();
  });

  it("切换为维持期后隐藏产奶量与乳脂率字段", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText("动物类别"), "maintenance");
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
    expect(screen.getByRole("alert")).toHaveTextContent(/体重需在 25–90 kg/);
    expect(screen.getByText("第一步：动物信息")).toBeInTheDocument();
  });

  it("未勾选任何允许原料时提示错误", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToStep2(user);
    await user.click(screen.getByRole("button", { name: /下一步：计算配方/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/至少勾选一种允许用于本次配方的原料/);
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
    expect(screen.getByText(/7 天渐进换料/)).toBeInTheDocument();
    expect(screen.getAllByText(/默认成分数据为估算值/).length).toBeGreaterThan(0);
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
    expect(screen.getByText("2.25")).toBeInTheDocument();
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
