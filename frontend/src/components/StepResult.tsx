import { useEffect, useState, useRef } from "react";
import { calculateRation, calibrateRation, buildFullThinkingText } from "../api";
import type {
  ApproximateRation,
  BoundaryFlag,
  CalibrateResult,
  CalculateRequest,
  FeedRow,
  FeasibleRation,
  InfeasibleRation,
  NutrientStatusItem,
  RationInsights,
} from "../types";
import type { PastureForm } from "./StepAnimal";

type Loaded =
  | { kind: "loading" }
  | { kind: "feasible"; data: FeasibleRation }
  | { kind: "approximate"; data: ApproximateRation }
  | { kind: "infeasible"; data: InfeasibleRation }
  | { kind: "error"; message: string };

interface Props {
  request: CalculateRequest;
  pastureInfo?: PastureForm;
  onBack: () => void;
  onEditAnimal: () => void;
}

export function StepResult({ request, pastureInfo, onBack, onEditAnimal }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [calibration, setCalibration] = useState<CalibrateResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateError, setCalibrateError] = useState<string | null>(null);

  // 思考过程状态
  const [streamingText, setStreamingText] = useState("");
  const [thinkingStage, setThinkingStage] = useState(1);
  const [thinkingDuration, setThinkingDuration] = useState("0.0s");
  const [isThinking, setIsThinking] = useState(true);
  const [showThinkingDrawer, setShowThinkingDrawer] = useState(false);

  // 维度切换：单只羊 vs 全群 (默认展示单只精准标准配比，可一键切换全群批次总量)
  const [dimension, setDimension] = useState<"single" | "all">("single");

  // 免责声明弹窗
  const [showAgreement, setShowAgreement] = useState(false);

  const streamTimerRef = useRef<any>(null);
  const durationTimerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ kind: "loading" });
    setIsThinking(true);
    setStreamingText("");
    setThinkingStage(1);

    const fullThinking = buildFullThinkingText(
      {
        regionName: pastureInfo?.regionName,
        totalFlockCount: pastureInfo?.totalFlockCount ? parseInt(pastureInfo.totalFlockCount, 10) : 500,
        coreTargetName: pastureInfo?.coreTargetName,
        coreCount: pastureInfo?.coreCount,
      },
      {
        bodyWeightKg: request.animal.body_weight_kg,
        milkKg: request.animal.milk_kg,
        milkFatPercent: request.animal.milk_fat_percent,
        class: request.animal.class,
      },
    );

    // 计时器
    const startMs = Date.now();
    durationTimerRef.current = setInterval(() => {
      const sec = ((Date.now() - startMs) / 1000).toFixed(1);
      setThinkingDuration(`${sec}s`);
    }, 100);

    // 流式打字推演模拟
    let curIdx = 0;
    const chunkSize = 22;
    streamTimerRef.current = setInterval(() => {
      curIdx += chunkSize;
      if (curIdx >= fullThinking.length) {
        setStreamingText(fullThinking);
        setThinkingStage(4);
        clearInterval(streamTimerRef.current);
        clearInterval(durationTimerRef.current);
        setTimeout(() => setIsThinking(false), 400);
      } else {
        const sub = fullThinking.slice(0, curIdx);
        let st = 1;
        if (sub.includes("> [阶段 4:")) st = 4;
        else if (sub.includes("> [阶段 3:")) st = 3;
        else if (sub.includes("> [阶段 2:")) st = 2;
        setStreamingText(sub);
        setThinkingStage(st);
      }
    }, 30);

    calculateRation(request)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "feasible") {
          setLoaded({ kind: "feasible", data: res });
          // 自动启动 AI 校准
          calibrateRation(request)
            .then((c) => {
              if (!cancelled) setCalibration(c);
            })
            .catch(() => {});
        } else if (res.status === "approximate") {
          setLoaded({ kind: "approximate", data: res });
        } else {
          setLoaded({ kind: "infeasible", data: res });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoaded({ kind: "error", message: err.message });
      });

    return () => {
      cancelled = true;
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [request, pastureInfo]);

  const handleSkipThinking = () => {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    setIsThinking(false);
  };

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

  const coreCount = pastureInfo?.coreCount || (pastureInfo?.calcMode === "pasture" ? 350 : 1);

  return (
    <section className="card" aria-label="配方结果">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <h2>第三步：配方结果</h2>
        {/* 维度切换 */}
        {loaded.kind === "feasible" && (
          <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", padding: "3px", borderRadius: "8px" }}>
            <button
              type="button"
              onClick={() => setDimension("single")}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                border: "none",
                borderRadius: "6px",
                background: dimension === "single" ? "#16a34a" : "transparent",
                color: dimension === "single" ? "#ffffff" : "#475569",
                cursor: "pointer",
                fontWeight: dimension === "single" ? "bold" : "normal",
              }}
            >
              按单只羊展示
            </button>
            <button
              type="button"
              onClick={() => setDimension("all")}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                border: "none",
                borderRadius: "6px",
                background: dimension === "all" ? "#16a34a" : "transparent",
                color: dimension === "all" ? "#ffffff" : "#475569",
                cursor: "pointer",
                fontWeight: dimension === "all" ? "bold" : "normal",
              }}
            >
              按全群规模展示 (共{coreCount}只)
            </button>
          </div>
        )}
      </div>

      {/* 深度思考流式推演框 */}
      {isThinking && (
        <div
          style={{
            background: "#0f172a",
            color: "#f8fafc",
            borderRadius: "10px",
            padding: "16px",
            margin: "12px 0 16px 0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: "bold", color: "#38bdf8" }}>
                DeepSeek-Flash
              </span>
              <span
                style={{
                  fontSize: "11px",
                  background: "rgba(56,189,248,0.2)",
                  color: "#38bdf8",
                  padding: "2px 8px",
                  borderRadius: "10px",
                }}
              >
                ● 深度推理中 ({thinkingDuration})
              </span>
            </div>
            <button
              type="button"
              onClick={handleSkipThinking}
              style={{
                background: "#334155",
                color: "#f8fafc",
                border: "none",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              ⏩ 跳过思考
            </button>
          </div>

          {/* 阶段条 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", marginBottom: "12px" }}>
            {[
              { id: 1, title: "需要量推导" },
              { id: 2, title: "行情成本建模" },
              { id: 3, title: "反刍安全校验" },
              { id: 4, title: "全场收敛求解" },
            ].map((st) => (
              <div
                key={st.id}
                style={{
                  textAlign: "center",
                  padding: "6px 2px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  background: thinkingStage >= st.id ? "#0284c7" : "#1e293b",
                  color: thinkingStage >= st.id ? "#ffffff" : "#64748b",
                  fontWeight: thinkingStage >= st.id ? "bold" : "normal",
                }}
              >
                {thinkingStage > st.id ? "✓" : st.id}. {st.title}
              </div>
            ))}
          </div>

          {/* 终端流式打字文本 */}
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "12px",
              lineHeight: "1.6",
              color: "#94a3b8",
              maxHeight: "180px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {streamingText}
            <span style={{ color: "#38bdf8", animation: "pulse 1s infinite" }}>▌</span>
          </div>
        </div>
      )}

      {/* 思考折叠抽屉 */}
      {!isThinking && streamingText && (
        <div style={{ marginBottom: "14px" }}>
          <button
            type="button"
            onClick={() => setShowThinkingDrawer(!showThinkingDrawer)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#334155",
              fontSize: "13px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <span>🧠 DeepSeek-Flash 深度思考推演链 ({thinkingDuration})</span>
            <span>{showThinkingDrawer ? "▲ 收起" : "▼ 展开查看"}</span>
          </button>
          {showThinkingDrawer && (
            <div
              style={{
                background: "#0f172a",
                color: "#94a3b8",
                borderRadius: "0 0 8px 8px",
                padding: "14px",
                fontSize: "12px",
                lineHeight: "1.6",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                borderTop: "none",
              }}
            >
              {streamingText}
            </div>
          )}
        </div>
      )}

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
        <FeasibleView
          data={loaded.data}
          dimension={dimension}
          coreCount={coreCount}
          calibrating={calibrating}
          calibration={calibration}
          calibrateError={calibrateError}
          onCalibrate={handleCalibrate}
        />
      )}

      {loaded.kind === "approximate" && (
        <ApproximateView data={loaded.data} dimension={dimension} coreCount={coreCount} />
      )}

      <div className="actions" style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={onBack}>上一步：修改原料</button>
        <button onClick={onEditAnimal}>重新填写牧场</button>
      </div>

      {/* 底部服务协议与免责声明入口 */}
      <div style={{ textAlign: "center", marginTop: "24px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          📖 营养需要量依据 NRC《小反刍动物营养需要》（2007）等公开文献体系计算，饲养管理参照 NY/T 2835-2015，原料成分参考《中国饲料成分及营养价值表（2020）》
        </div>
        <button
          type="button"
          onClick={() => setShowAgreement(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "#16a34a",
            fontSize: "12px",
            textDecoration: "underline",
            marginTop: "4px",
            cursor: "pointer",
          }}
        >
          查看《用户服务协议与科学免责声明》
        </button>
      </div>

      {/* 免责声明弹窗 */}
      {showAgreement && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
          onClick={() => setShowAgreement(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              maxWidth: "500px",
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, color: "#166534" }}>用户服务协议与科学免责声明</h3>
              <button type="button" onClick={() => setShowAgreement(false)} style={{ border: "none", background: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#334155" }}>
              <h4 style={{ color: "#0f172a", marginBottom: "4px" }}>一、科学模型与计算依据</h4>
              <p>本系统营养需要量依据美国 NRC《小反刍动物营养需要》（2007）及 Sahlu 等（2004）公开文献体系计算，并包含产品设计参数（代谢能与粗蛋白安全余量、干物质采食量 ±3% 带宽、10 g 取整）；饲养管理要求参照《奶山羊饲养管理技术规范》（NY/T 2835-2015）；原料成分参考《中国饲料成分及营养价值表（2020）》及公开附表；配方求解采用线性规划与 10 g 整数规划。本工具输出为参考方案，不替代专业营养师或兽医意见。</p>

              <h4 style={{ color: "#0f172a", marginBottom: "4px" }}>二、原料数据与批次差异说明</h4>
              <p>系统内置的原料营养成分参考《中国饲料成分及营养价值表（2020）》及全国畜牧总站公开附表（食盐为通用常识值）。不同产地、不同批次原料的实际营养成分可能存在差异；如您具备原料检测化验报告，建议在“原料选择”页录入实测值以获得更精准的配方结果。</p>

              <h4 style={{ color: "#0f172a", marginBottom: "4px" }}>三、换料过渡与饲喂管理建议</h4>
              <p>更换日粮或调整配方时应保持 5–7 天逐步过渡，避免突然更换导致瘤胃菌群紊乱；在日常饲喂中请持续观察羊只采食、反刍、体况及产奶表现。</p>

              <h4 style={{ color: "#0f172a", marginBottom: "4px" }}>四、AI 辅助解读性质声明</h4>
              <p>本工具中的 AI 解读模块基于确定性计算结果进行通俗化辅助语言转写，旨在帮助养殖户通俗理解指标，不改变底层计算克数与营养达标判定；本工具不作疾病诊断、医疗方案或产量承诺，特殊异常情况建议咨询畜牧兽医专业人员。</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAgreement(false)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "6px",
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: "bold",
                marginTop: "16px",
                cursor: "pointer",
              }}
            >
              我已阅读并理解
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RationTables(props: {
  rows: FeedRow[];
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  nutrients: { dmi_pct_of_target: number };
  dmiTargetKg: number;
  nutrientStatus: NutrientStatusItem[];
  dimension?: "single" | "all";
  coreCount?: number;
}) {
  const { rows, totals, nutrients, dmiTargetKg, nutrientStatus, dimension = "single", coreCount = 1 } = props;
  const isAll = dimension === "all" && coreCount > 1;
  const scale = isAll ? coreCount : 1;

  return (
    <>
      <div className="table-scroll" role="region" aria-label="每日原料用量" tabIndex={0}>
        <table className="result-table">
          <thead>
            <tr>
              <th>原料</th>
              <th>{isAll ? `全群配料 (${scale}只)` : "用量（kg/只/天）"}</th>
              <th>选择状态</th>
              <th>单价（元/kg）</th>
              <th>{isAll ? "全群日成本 (元/天)" : "成本（元/天）"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.feed_id}>
                <td>{r.name}</td>
                <td>
                  <strong>{(r.as_fed_kg * scale).toFixed(2)}</strong> {isAll ? "kg" : ""}
                </td>
                <td>{r.owned ? "已勾选" : "—"}</td>
                <td>{r.price_rmb_per_kg.toFixed(2)}</td>
                <td>{(r.cost_rmb * scale).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>合计</td>
              <td>{(totals.cost_rmb * scale).toFixed(2)} 元/天</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="hint">
        {isAll ? (
          <>
            全群总原物 {(totals.as_fed_kg * scale).toFixed(1)} kg/天 · 全群总干物 {(totals.dm_kg * scale).toFixed(1)} kg/天 · 
            单只 DMI {totals.dm_kg.toFixed(2)} kg (达目标 {nutrients.dmi_pct_of_target.toFixed(1)}%)
          </>
        ) : (
          <>
            总原物质 {totals.as_fed_kg.toFixed(2)} kg/天 · 总干物质 {totals.dm_kg.toFixed(2)} kg/天 ·
            DMI 为目标 {dmiTargetKg.toFixed(2)} kg 的 {nutrients.dmi_pct_of_target.toFixed(1)}%
          </>
        )}
      </p>

      <h4>营养复核 <span className="heading-note">按单只日粮标准复核，显示值已四舍五入</span></h4>
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

      {/* 专家认证徽章 */}
      {props.calibration && props.calibration.approved && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#166534",
            fontSize: "13px",
            fontWeight: "500",
          }}
        >
          <span style={{ fontSize: "18px" }}>✓</span>
          <div>
            <strong>DeepSeek-Flash 营养师审核认证</strong>
            <div style={{ fontSize: "11px", color: "#15803d", marginTop: "2px" }}>
              {props.calibration.calibration_note}
            </div>
          </div>
        </div>
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

function CoreResultCards(props: {
  totals: { as_fed_kg: number; dm_kg: number; cost_rmb: number };
  qualified: boolean;
  dimension?: "single" | "all";
  coreCount?: number;
}) {
  const { totals, qualified, dimension = "single", coreCount = 1 } = props;
  const isAll = dimension === "all" && coreCount > 1;
  const scale = isAll ? coreCount : 1;

  return (
    <div className="core-result-cards" aria-label="配方核心结果">
      <div className="core-card">
        <span className="card-label">{isAll ? `全群每日喂料总量 (${scale}只)` : "每日喂料总量"}</span>
        <span className="card-value">{(totals.as_fed_kg * scale).toFixed(2)}</span>
        <span className="card-unit">kg/天</span>
      </div>
      <div className="core-card">
        <span className="card-label">{isAll ? `全群干物质 (${scale}只)` : "干物质"}</span>
        <span className="card-value">{(totals.dm_kg * scale).toFixed(2)}</span>
        <span className="card-unit">kg/天</span>
      </div>
      <div className="core-card cost-card">
        <span className="card-label">{isAll ? `全群日成本 (${scale}只)` : "日成本"}</span>
        <span className="card-value">¥{(totals.cost_rmb * scale).toFixed(2)}</span>
        <span className="card-unit">元/天</span>
      </div>
      <div className={`core-card status-card ${qualified ? "qualified" : "unqualified"}`}>
        <span className="card-label">{qualified ? "配方合格" : "配方待调整"}</span>
        <span className="card-value">{qualified ? "配方合格" : "暂不合格"}</span>
        <span className="card-unit">{qualified ? "可直接投喂" : "需补充原料"}</span>
      </div>
    </div>
  );
}

function ApproximateView(props: {
  data: ApproximateRation;
  dimension?: "single" | "all";
  coreCount?: number;
}) {
  const { data, dimension, coreCount } = props;
  return (
    <div>
      <CoreResultCards totals={data.totals} qualified={false} dimension={dimension} coreCount={coreCount} />
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
        <RationTables
          rows={data.feed_rows}
          totals={data.totals}
          nutrients={data.nutrients}
          dmiTargetKg={data.dmi_target_kg}
          nutrientStatus={data.nutrient_status}
          dimension={dimension}
          coreCount={coreCount}
        />
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

      <ExplanationSections
        insights={data.ration_insights}
        managementTips={data.management_tips}
        risks={data.boundary_statements}
        qualified={false}
      />
    </div>
  );
}

function FeasibleView(props: {
  data: FeasibleRation;
  dimension?: "single" | "all";
  coreCount?: number;
  calibrating: boolean;
  calibration: CalibrateResult | null;
  calibrateError: string | null;
  onCalibrate: () => void;
}) {
  const { data, dimension, coreCount } = props;
  return (
    <div>
      <CoreResultCards totals={data.totals} qualified dimension={dimension} coreCount={coreCount} />
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
        <RationTables
          rows={data.feed_rows}
          totals={data.totals}
          nutrients={data.nutrients}
          dmiTargetKg={data.dmi_target_kg}
          nutrientStatus={data.nutrient_status}
          dimension={dimension}
          coreCount={coreCount}
        />
      </div>

      <BoundaryReminderSection flags={data.ration_insights.boundary_flags} qualified />
      <ExplanationSections
        insights={data.ration_insights}
        managementTips={data.management_tips}
        risks={data.boundary_statements}
        qualified
        calibration={props.calibration}
        calibrating={props.calibrating}
        calibrateError={props.calibrateError}
        onCalibrate={props.onCalibrate}
      />
    </div>
  );
}
