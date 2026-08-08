import { useEffect, useState } from "react";
import { calibrateRation, calculateRation } from "../api";
import type {
  ApproximateRation,
  CalculateRequest,
  CalibrateResult,
  FeasibleRation,
  InfeasibleRation,
  NutrientStatusItem,
  FeedRow,
} from "../types";

interface Props {
  request: CalculateRequest;
  onBack: () => void;
  onEditAnimal: () => void;
}

type Loaded = { kind: "loading" } | { kind: "feasible"; data: FeasibleRation }
  | { kind: "approximate"; data: ApproximateRation }
  | { kind: "infeasible"; data: InfeasibleRation } | { kind: "error"; message: string };

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

      {loaded.kind === "loading" && <p>正在计算最低成本配方…</p>}

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

      <p className="hint">
        总原物质 {totals.as_fed_kg.toFixed(2)} kg/天 · 总干物质 {totals.dm_kg.toFixed(2)} kg/天 ·
        DMI 为目标 {dmiTargetKg.toFixed(2)} kg 的 {nutrients.dmi_pct_of_target.toFixed(1)}%
      </p>

      <h4>营养指标复核（按显示用量 10 g 取整复算）</h4>
      <table className="result-table">
        <thead>
          <tr><th>指标</th><th>目标</th><th>实际</th><th>是否达标</th></tr>
        </thead>
        <tbody>
          {nutrientStatus.map((s) => (
            <tr key={s.key}>
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
    </>
  );
}

function ApproximateView(props: { data: ApproximateRation }) {
  const { data } = props;
  return (
    <div>
      <div className="approximate-warning" role="alert">
        <h3>⚠️ 警告：这不是合格配方</h3>
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

      <h3>近似配比（仅勾选原料，10 g 整数）</h3>
      <RationTables rows={data.feed_rows} totals={data.totals}
        nutrients={data.nutrients} dmiTargetKg={data.dmi_target_kg}
        nutrientStatus={data.nutrient_status} />

      <h4>未达标约束（必须逐项复核）</h4>
      <ul className="unmet">
        {data.violations.map((v) => (
          <li key={v.code}>{v.message}</li>
        ))}
      </ul>

      <p className="advice">{data.advice}</p>
      <p className="hint">{data.detail}</p>

      <h4>使用提示</h4>
      <ul className="tips">
        {data.management_tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>

      <h4>边界声明</h4>
      <ul className="tips">
        {data.boundary_statements.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
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
      <h3>最低成本配方（取整后复算）</h3>
      <RationTables rows={data.feed_rows} totals={data.totals}
        nutrients={data.nutrients} dmiTargetKg={data.dmi_target_kg}
        nutrientStatus={data.nutrient_status} />

      <h4>使用提示</h4>
      <ul className="tips">
        {data.management_tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>

      <h4>边界声明</h4>
      <ul className="tips">
        {data.boundary_statements.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <div className="ai-box">
        <h4>AI 通俗解读（可选）</h4>
        <button className="primary" onClick={props.onCalibrate} disabled={props.calibrating}>
          {props.calibrating ? "生成中…" : "生成 AI 通俗解读与风险提醒"}
        </button>
        {props.calibrateError && <p className="error-text">{props.calibrateError}</p>}
        {props.calibration && (
          <div data-testid="calibration">
            {props.calibration.ai_unavailable && (
              <p className="hint" data-testid="ai-fallback">AI 解读暂不可用，已使用本地固定说明；计算结果未受影响。</p>
            )}
            <ul className="tips">
              {props.calibration.explanations.map((e) => (
                <li key={e}>💡 {e}</li>
              ))}
              {props.calibration.risks.map((r) => (
                <li key={r}>⚠️ {r}</li>
              ))}
            </ul>
            <p className="hint">
              校准：{props.calibration.calibration_note}（approved={props.calibration.approved ? "是" : "否"}）
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
