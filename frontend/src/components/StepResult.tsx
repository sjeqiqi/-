import { useEffect, useState } from "react";
import { calibrateRation, calculateRation } from "../api";
import type {
  ApproximateRation,
  BoundaryFlag,
  CalculateRequest,
  CalibrateResult,
  FeasibleRation,
  InfeasibleRation,
  NutrientStatusItem,
  FeedRow,
  RationInsights,
} from "../types";

interface Props {
  request: CalculateRequest;
  onBack: () => void;
  onEditAnimal: () => void;
}

type Loaded = { kind: "loading" } | { kind: "feasible"; data: FeasibleRation }
  | { kind: "approximate"; data: ApproximateRation }
  | { kind: "infeasible"; data: InfeasibleRation } | { kind: "error"; message: string };

function CoreResultCards(props: {
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  qualified: boolean;
}) {
  const { totals, qualified } = props;
  return (
    <div className="core-results" aria-label="配方核心结果">
      <div className="metric-card">
        <span>每日喂料总量</span>
        <strong>{totals.as_fed_kg.toFixed(2)} <small>kg/只</small></strong>
      </div>
      <div className="metric-card">
        <span>干物质</span>
        <strong>{totals.dm_kg.toFixed(2)} <small>kg/只</small></strong>
      </div>
      <div className="metric-card">
        <span>日成本</span>
        <strong>{totals.cost_rmb.toFixed(2)} <small>元/只</small></strong>
      </div>
      <div className={`metric-card status-card ${qualified ? "status-green" : "status-red"}`}>
        <span>状态</span>
        <strong>{qualified ? "配方合格" : "暂不合格"}</strong>
      </div>
    </div>
  );
}

export function StepResult({ request, onBack, onEditAnimal }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [calibration, setCalibration] = useState<CalibrateResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateError, setCalibrateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ kind: "loading" });
    calculateRation(request)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "feasible") setLoaded({ kind: "feasible", data: res });
        else if (res.status === "approximate") setLoaded({ kind: "approximate", data: res });
        else setLoaded({ kind: "infeasible", data: res });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoaded({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const handleCalibrate = async () => {
    setCalibrating(true);
    setCalibrateError(null);
    setCalibration(null);
    try {
      const res = await calibrateRation(request);
      setCalibration(res);
    } catch (err) {
      setCalibrateError((err as Error).message);
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <section className="card" aria-label="配方结果">
      <h2>第三步：配方结果</h2>

      {loaded.kind === "loading" && <p className="loading-note">正在根据羊只情况、原料和价格计算配方…</p>}

      {loaded.kind === "error" && (
        <>
          <p className="error-text" role="alert">{loaded.message}</p>
          <div className="actions">
            <button onClick={onBack}>返回修改原料</button>
            <button onClick={onEditAnimal}>修改动物信息</button>
          </div>
        </>
      )}

      {loaded.kind === "infeasible" && (
        <div className="infeasible" role="alert">
          <h3>无法生成可行配方</h3>
          <p>{loaded.data.detail}</p>
          <ul>
            {loaded.data.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
          <p className="advice">{loaded.data.advice}</p>
          <div className="actions">
            <button onClick={onBack}>返回修改原料</button>
            <button onClick={onEditAnimal}>修改动物信息</button>
          </div>
        </div>
      )}

      {loaded.kind === "feasible" && (
        <FeasibleView data={loaded.data} calibrating={calibrating} calibration={calibration}
          calibrateError={calibrateError} onCalibrate={handleCalibrate} />
      )}

      {loaded.kind === "approximate" && (
        <ApproximateView data={loaded.data} />
      )}

      <div className="actions">
        <button onClick={onBack}>上一步</button>
      </div>
    </section>
  );
}

function RationTables(props: {
  rows: FeedRow[];
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  nutrients: { dmi_pct_of_target: number };
  dmiTargetKg: number;
  nutrientStatus: NutrientStatusItem[];
}) {
  const { rows, totals, nutrients, dmiTargetKg, nutrientStatus } = props;
  return (
    <>
      <div className="table-scroll" role="region" aria-label="每日原料用量" tabIndex={0}>
      <table className="result-table">
        <thead>
          <tr>
            <th>原料</th>
            <th>用量（kg/只/天）</th>
            <th>选择状态</th>
            <th>单价（元/kg）</th>
            <th>成本（元/天）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feed_id}>
              <td>{r.name}</td>
              <td>{r.as_fed_kg.toFixed(2)}</td>
              <td>{r.owned ? "已勾选" : "—"}</td>
              <td>{r.price_rmb_per_kg.toFixed(2)}</td>
              <td>{r.cost_rmb.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>合计</td>
            <td>{totals.cost_rmb.toFixed(2)} 元/天</td>
          </tr>
        </tfoot>
      </table>
      </div>

      <p className="hint">
        总原物质 {totals.as_fed_kg.toFixed(2)} kg/天 · 总干物质 {totals.dm_kg.toFixed(2)} kg/天 ·
        DMI 为目标 {dmiTargetKg.toFixed(2)} kg 的 {nutrients.dmi_pct_of_target.toFixed(1)}%
      </p>

      <h4>营养复核 <span className="heading-note">按最终配方重新核对，显示值已四舍五入</span></h4>
      <div className="table-scroll" role="region" aria-label="营养复核明细" tabIndex={0}>
      <table className="result-table nutrient-table">
        <thead>
          <tr><th>指标</th><th>目标</th><th>实际</th><th>是否达标</th></tr>
        </thead>
        <tbody>
          {nutrientStatus.map((s) => (
            <tr key={s.key} className={s.pass ? "status-row-green" : "status-row-red"}>
              <td>{s.label}</td>
              <td>{s.target}</td>
              <td>{s.actual === null ? "—" : `${s.actual}${s.unit ? " " + s.unit : ""}`}</td>
              <td>
                <span className={s.pass ? "pass" : "fail"}>
                  {s.pass ? "达标" : "未达标"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

const METRIC_LABELS: Record<string, string> = {
  dmi: "干物质采食量",
  me: "代谢能",
  cp: "粗蛋白",
  ndf: "NDF",
  forage: "粗饲料比例",
  ca: "钙",
  p: "磷",
  ca_p: "钙磷比",
  feed_cap: "原料用量",
};

interface BoundaryGroup {
  kind: "single" | "dual";
  metric: string;
  flag?: BoundaryFlag;
  lower?: BoundaryFlag;
  upper?: BoundaryFlag;
}

function buildBoundaryGroups(flags: BoundaryFlag[]): BoundaryGroup[] {
  const groups: BoundaryGroup[] = [];
  const merged = new Set<string>();
  const dualMetrics = new Set(["cp", "ndf", "ca_p"]);
  for (const flag of flags) {
    if (merged.has(flag.code)) continue;
    if (dualMetrics.has(flag.metric) && flag.code.endsWith("_lower")) {
      const upper = flags.find((f) => f.metric === flag.metric && f.code.endsWith("_upper"));
      if (upper) {
        groups.push({ kind: "dual", metric: flag.metric, lower: flag, upper });
        merged.add(flag.code);
        merged.add(upper.code);
        continue;
      }
    }
    groups.push({ kind: "single", metric: flag.metric, flag });
  }
  return groups;
}

function DualBoundaryItem({ lower, upper }: { lower: BoundaryFlag; upper: BoundaryFlag }) {
  const label = METRIC_LABELS[lower.metric] ?? lower.label;
  const suffix = lower.unit === "percentage_point" ? "%DM" : "";
  const unitText = lower.unit === "percentage_point"
    ? " 个百分点"
    : lower.unit === "ratio"
      ? ""
      : ` ${lower.unit}`;
  return (
    <li className="dual">
      <strong>{label}位于较窄允许区间</strong>：当前值 {lower.value.toFixed(2)}{suffix}，
      距下限 {lower.margin.toFixed(2)}{unitText}、距上限 {upper.margin.toFixed(2)}{unitText}。
    </li>
  );
}

function BoundaryReminderSection(props: { flags: BoundaryFlag[]; qualified: boolean }) {
  const { flags, qualified } = props;
  const groups = buildBoundaryGroups(flags);
  return (
    <div className="result-layer boundary-layer">
      <h4>③ 余量提醒</h4>
      <p className="hint boundary-notice">
        {qualified
          ? "以下为已达标指标的余量提醒，不影响本次配方合格判定。"
          : "以下为已达标指标的余量提醒，仅用于解释；未达标项仍以营养复核表为准。"}
      </p>
      {qualified && (
        <p className="boundary-meaning"><strong>黄色提醒：</strong>只表示余量较小，不影响“配方合格”的判定。</p>
      )}
      {groups.length > 0 ? (
        <ul className="boundary-flags">
          {groups.map((group) =>
            group.kind === "dual" && group.lower && group.upper ? (
              <DualBoundaryItem key={group.metric} lower={group.lower} upper={group.upper} />
            ) : (
              <li key={group.flag?.code}>
                <strong>{group.flag?.label}</strong>：{group.flag?.detail}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="hint">当前结果没有指标贴近约束边界。</p>
      )}
    </div>
  );
}

function ExplanationSections(props: {
  insights: RationInsights;
  managementTips: string[];
  risks: string[];
  qualified: boolean;
  calibration?: CalibrateResult | null;
  calibrating?: boolean;
  calibrateError?: string | null;
  onCalibrate?: () => void;
}) {
  const { insights } = props;
  const boundaryLabels = Array.from(new Set(insights.boundary_flags.map((flag) =>
    flag.metric === "feed_cap"
      ? flag.label.replace(/用量接近上限$/, "用量")
      : (METRIC_LABELS[flag.metric] ?? flag.label),
  )));
  const fixedRisks = Array.from(new Set([insights.scope_notice, ...props.risks]));
  const aiAvailable = props.calibration && !props.calibration.ai_unavailable;
  return (
    <section className="explanation" aria-label="配方解读">
      <div className="explanation-heading">
        <div>
          <h3>配方解读</h3>
          <p>用四部分说明这份配方怎么看、怎么用。</p>
        </div>
        {props.onCalibrate && (
          <button className="secondary-ai" onClick={props.onCalibrate} disabled={props.calibrating}>
            {props.calibrating ? "正在补充说明…" : "生成 AI 通俗解读"}
          </button>
        )}
      </div>
      {props.calibrateError && <p className="error-text">AI 补充说明暂时没有生成，稍后可以再试。</p>}
      {props.calibration?.ai_unavailable && (
        <p className="hint" data-testid="ai-fallback">AI 解读暂不可用，已使用本地固定说明；计算结果未受影响。</p>
      )}
      <div className="explanation-grid">
      <article className="explanation-card">
        <h4>配方特点</h4>
        <p className="fact-source">以下比例、来源和边界状态均来自程序确定性计算，不是 AI 自行判断。</p>
        <ul>
        <li>
          本次共选择 {insights.selected_feed_count} 种候选原料，最终用到{" "}
          {insights.used_feed_count} 种。
        </li>
        {insights.forage_dm_pct !== null && (
          <li>粗饲料占干物质 {insights.forage_dm_pct.toFixed(2)}%。</li>
        )}
        {insights.top_me_sources.length > 0 && (
          <li>
            主要能量来源：
            {insights.top_me_sources
              .map((s) => `${s.name}（贡献 ${s.share_pct.toFixed(1)}%）`)
              .join("、")}
            。
          </li>
        )}
        {insights.top_cp_sources.length > 0 && (
          <li>
            主要蛋白来源：
            {insights.top_cp_sources
              .map((s) => `${s.name}（贡献 ${s.share_pct.toFixed(1)}%）`)
              .join("、")}
            。
          </li>
        )}
        </ul>
      </article>
      <article className="explanation-card">
        <h4>为什么这样配</h4>
        <p>
          系统首先要求最终 10 g 配方满足 DMI、ME、CP、NDF、粗饲料比例、Ca、P、Ca:P、
          食盐和单项原料上限等约束，再在满足条件的方案中寻找成本较低的组合。因此，最低成本解中部分指标会自然接近允许边界。
        </p>
        <p>
          本次总干物质为 {insights.total_dm_kg.toFixed(3)} kg/d。
          {boundaryLabels.length > 0
            ? `${boundaryLabels.join("、")}；${props.qualified ? "以上项目当前均仍为达标状态。" : "这些提醒仅说明已达标项目的剩余空间。"}`
            : "当前没有已达标指标贴近约束边界。"}
        </p>
        {aiAvailable && props.calibration!.explanations.length > 0 && (
          <div className="ai-paraphrase">
            <strong>AI 通俗补充（不改变上述计算事实）</strong>
            <ul>{props.calibration!.explanations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
      </article>
      <article className="explanation-card advice-card">
        <h4>使用建议</h4>
        <ul>{props.managementTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </article>
      <article className="explanation-card risk-card">
        <h4>风险提醒</h4>
        <ul>
          {fixedRisks.map((risk) => <li key={risk}>{risk}</li>)}
          {boundaryLabels.length > 0 && (
            <li><strong>本次结果特别提醒：</strong>{boundaryLabels.join("、")}接近相应约束边界。</li>
          )}
        </ul>
        {aiAvailable && props.calibration!.risks.length > 0 && (
          <div className="ai-paraphrase">
            <strong>AI 通俗补充（不新增科学结论）</strong>
            <ul>{props.calibration!.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </div>
        )}
      </article>
      </div>
    </section>
  );
}

function ApproximateView(props: { data: ApproximateRation }) {
  const { data } = props;
  return (
    <div>
      <CoreResultCards totals={data.totals} qualified={false} />
      <div className="approximate-warning" role="alert">
        <h3>这不是合格配方，请先调整</h3>
        <p>
          该结果只是当前勾选原料范围内营养缺口最小的近似配比，<strong>不是合格配方，绝不能直接按此饲喂</strong>；
          未达标项必须由营养师或兽医逐项复核并补充原料后，才能作为日粮使用。
        </p>
        {data.do_not_feed && (
          <p className="error-text">
            当前只勾选了矿物质（食盐/石粉等），不能构成日粮；该结果仅为诊断用最小剂量示例，禁止直接饲喂！
          </p>
        )}
      </div>

      <div className="result-layer">
        <h4>① 合格状态</h4>
        <div className="result-status result-status-warning">
          <span className="fail">状态：暂不合格</span>
          <span className="hint">下面会列出缺少的营养，系统不会自动加入未选择的原料</span>
        </div>
      </div>

      <div className="result-layer">
        <h4>② 营养复核</h4>
        <RationTables rows={data.feed_rows} totals={data.totals}
          nutrients={data.nutrients} dmiTargetKg={data.dmi_target_kg}
          nutrientStatus={data.nutrient_status} />
      </div>

      <h4>还没达标的项目（请逐项检查）</h4>
      <ul className="unmet">
        {data.violations.map((v) => (
          <li key={v.code}>{v.message}</li>
        ))}
      </ul>

      <BoundaryReminderSection flags={data.ration_insights.boundary_flags} qualified={false} />

      <p className="advice">{data.advice}</p>
      <p className="hint">{data.detail}</p>

      <ExplanationSections insights={data.ration_insights} managementTips={data.management_tips}
        risks={data.boundary_statements} qualified={false} />
    </div>
  );
}

function FeasibleView(props: {
  data: FeasibleRation;
  calibrating: boolean;
  calibration: CalibrateResult | null;
  calibrateError: string | null;
  onCalibrate: () => void;
}) {
  const { data } = props;
  return (
    <div>
      <CoreResultCards totals={data.totals} qualified />
      <div className="result-layer">
        <h4>① 合格状态</h4>
        <div className="result-status">
          <span className="pass">营养要求已通过，配方合格</span>
          <span className="hint">
            已选 {data.ration_insights.selected_feed_count} 种，最终使用{" "}
            {data.ration_insights.used_feed_count} 种
          </span>
        </div>
      </div>

      <div className="result-layer">
        <h4>② 营养复核</h4>
        <RationTables rows={data.feed_rows} totals={data.totals}
          nutrients={data.nutrients} dmiTargetKg={data.dmi_target_kg}
          nutrientStatus={data.nutrient_status} />
      </div>

      <BoundaryReminderSection flags={data.ration_insights.boundary_flags} qualified />
      <ExplanationSections insights={data.ration_insights} managementTips={data.management_tips}
        risks={data.boundary_statements} qualified calibration={props.calibration}
        calibrating={props.calibrating} calibrateError={props.calibrateError}
        onCalibrate={props.onCalibrate} />
    </div>
  );
}
