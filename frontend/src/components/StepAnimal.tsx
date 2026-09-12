import { useState } from "react";
import { DEFAULT_REGIONS, type AnimalClass, type Region } from "../types";

export interface AnimalForm {
  class: AnimalClass;
  bodyWeightKg: string;
  milkKg: string;
  milkFatPercent: string;
}

export interface PastureForm {
  calcMode: "pasture" | "single";
  regionId: string;
  regionName: string;
  totalFlockCount: string;
  lactatingPct: number;
  lactatingCount: number;
  growingPct: number;
  growingCount: number;
  lambPct: number;
  lambCount: number;
  coreTarget: "lactating" | "growing" | "lamb";
  coreTargetName: string;
  coreCount: number;
}

const WEIGHT_MIN = 25;
const WEIGHT_MAX = 90;
const MILK_MIN = 0.2;
const MILK_MAX = 5.0;
const FAT_MIN = 2.0;
const FAT_MAX = 7.0;

interface Props {
  initial: AnimalForm;
  initialPasture?: PastureForm;
  onNext: (form: AnimalForm, pasture: PastureForm) => void;
}

export function StepAnimal({ initial, initialPasture, onNext }: Props) {
  const [calcMode, setCalcMode] = useState<"pasture" | "single">(
    initialPasture?.calcMode || "pasture",
  );
  const [selectedRegion, setSelectedRegion] = useState<Region>(
    DEFAULT_REGIONS.find((r) => r.id === initialPasture?.regionId) || DEFAULT_REGIONS[0],
  );
  const [totalFlockCount, setTotalFlockCount] = useState<string>(
    initialPasture?.totalFlockCount || "500",
  );

  const [lactatingPct, setLactatingPct] = useState<number>(initialPasture?.lactatingPct ?? 70);
  const [growingPct, setGrowingPct] = useState<number>(initialPasture?.growingPct ?? 20);
  const [lambPct, setLambPct] = useState<number>(initialPasture?.lambPct ?? 10);

  const [coreTarget, setCoreTarget] = useState<"lactating" | "growing" | "lamb">(
    initialPasture?.coreTarget || "lactating",
  );

  const [form, setForm] = useState<AnimalForm>(initial);
  const [errors, setErrors] = useState<string[]>([]);

  const totalNum = Math.max(1, parseInt(totalFlockCount, 10) || 500);
  const lactatingCount = Math.round((totalNum * lactatingPct) / 100);
  const growingCount = Math.round((totalNum * growingPct) / 100);
  const lambCount = Math.max(0, totalNum - lactatingCount - growingCount);

  const coreTargetName =
    coreTarget === "lactating"
      ? "成年泌乳期生产群"
      : coreTarget === "growing"
        ? "青年育成羊群"
        : "断奶生长羔羊群";

  const coreCount =
    coreTarget === "lactating"
      ? lactatingCount
      : coreTarget === "growing"
        ? growingCount
        : lambCount;

  const update = (patch: Partial<AnimalForm>) => setForm((f) => ({ ...f, ...patch }));

  const validate = (): string[] => {
    const errs: string[] = [];
    const w = Number(form.bodyWeightKg);
    if (!Number.isFinite(w) || w < WEIGHT_MIN || w > WEIGHT_MAX) {
      errs.push(`请输入 ${WEIGHT_MIN}–${WEIGHT_MAX} kg 之间的体重`);
    }
    if (form.class === "lactating") {
      const m = Number(form.milkKg);
      if (!Number.isFinite(m) || m < MILK_MIN || m > MILK_MAX) {
        errs.push(`请输入 ${MILK_MIN}–${MILK_MAX} kg 之间的日产奶量`);
      }
      if (form.milkFatPercent.trim() !== "") {
        const fat = Number(form.milkFatPercent);
        if (!Number.isFinite(fat) || fat < FAT_MIN || fat > FAT_MAX) {
          errs.push(`乳脂率请填写 ${FAT_MIN}–${FAT_MAX}% 之间的数值`);
        }
      }
    }
    return errs;
  };

  const handleNext = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length === 0) {
      const pastureData: PastureForm = {
        calcMode,
        regionId: selectedRegion.id,
        regionName: selectedRegion.name,
        totalFlockCount,
        lactatingPct,
        lactatingCount,
        growingPct,
        growingCount,
        lambPct,
        lambCount,
        coreTarget,
        coreTargetName,
        coreCount,
      };
      onNext(form, pastureData);
    }
  };

  return (
    <section className="card animal-card" aria-label="羊只信息">
      <h2>第一步：填写羊只信息</h2>
      <p className="section-lead">
        支持规模化牧场全场配料与单只个体精细化配方计算，依据国家标准《奶山羊饲养管理技术规范》（NY/T 2835）。
      </p>

      <div className="mode-toggle-bar" style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
        <button
          type="button"
          className={`btn-mode-tab ${calcMode === "pasture" ? "active" : ""}`}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: calcMode === "pasture" ? "2px solid #16a34a" : "1px solid #cbd5e1",
            background: calcMode === "pasture" ? "#f0fdf4" : "#ffffff",
            color: calcMode === "pasture" ? "#166534" : "#475569",
            fontWeight: calcMode === "pasture" ? "bold" : "normal",
            cursor: "pointer",
          }}
          onClick={() => setCalcMode("pasture")}
        >
          🏡 规模化牧场模式
        </button>
        <button
          type="button"
          className={`btn-mode-tab ${calcMode === "single" ? "active" : ""}`}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: calcMode === "single" ? "2px solid #16a34a" : "1px solid #cbd5e1",
            background: calcMode === "single" ? "#f0fdf4" : "#ffffff",
            color: calcMode === "single" ? "#166534" : "#475569",
            fontWeight: calcMode === "single" ? "bold" : "normal",
            cursor: "pointer",
          }}
          onClick={() => setCalcMode("single")}
        >
          🐐 单只精准模式
        </button>
      </div>

      {/* 1. 全国奶山羊优势主产区选择 (两种模式均支持联动产区行情，与微信小程序完全对齐) */}
      <div className="field" style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "18px", border: "1px solid #e2e8f0" }}>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <strong>📍 奶山羊优势主产区</strong>
            <span style={{ fontSize: "12px", color: "#64748b" }}>自动联动产区采购行情与营养库</span>
          </div>
          <span style={{ fontSize: "12px", color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" }}>
            {selectedRegion.badge}
          </span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {DEFAULT_REGIONS.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRegion(r)}
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: selectedRegion.id === r.id ? "2px solid #16a34a" : "1px solid #e2e8f0",
                background: selectedRegion.id === r.id ? "#ffffff" : "#f1f5f9",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              <div style={{ fontWeight: selectedRegion.id === r.id ? "bold" : "normal", color: selectedRegion.id === r.id ? "#166534" : "#334155" }}>
                {r.name}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                {r.desc.slice(0, 18)}…
              </div>
            </div>
          ))}
        </div>
      </div>

      {calcMode === "pasture" && (
        <div className="pasture-section" style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "18px", border: "1px solid #e2e8f0" }}>
          <div className="field" style={{ marginBottom: "14px" }}>
            <label htmlFor="pasture-flock">
              <strong>🐏 全场总存栏量（只）</strong>
            </label>
            <input
              id="pasture-flock"
              type="number"
              inputMode="numeric"
              min="10"
              max="20000"
              value={totalFlockCount}
              onChange={(e) => setTotalFlockCount(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              {["100", "300", "500", "1000", "2000"].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setTotalFlockCount(cnt)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    border: totalFlockCount === cnt ? "1px solid #16a34a" : "1px solid #cbd5e1",
                    background: totalFlockCount === cnt ? "#dcfce7" : "#ffffff",
                    color: totalFlockCount === cnt ? "#166534" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  {cnt}只
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: "14px" }}>
            <label><strong>📊 羊群结构分布与只数</strong></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "6px" }}>
              <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: "#475569" }}>成年泌乳群</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#166534", margin: "3px 0" }}>{lactatingCount} <small style={{ fontSize: "11px" }}>只</small></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    min="10"
                    max="90"
                    value={lactatingPct}
                    onChange={(e) => setLactatingPct(Math.max(10, Math.min(90, parseInt(e.target.value, 10) || 70)))}
                    style={{ width: "42px", padding: "2px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                  />
                  <span>%</span>
                </div>
              </div>
              <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: "#475569" }}>青年育成羊</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#0284c7", margin: "3px 0" }}>{growingCount} <small style={{ fontSize: "11px" }}>只</small></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={growingPct}
                    onChange={(e) => setGrowingPct(Math.max(5, Math.min(50, parseInt(e.target.value, 10) || 20)))}
                    style={{ width: "42px", padding: "2px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                  />
                  <span>%</span>
                </div>
              </div>
              <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: "#475569" }}>断奶羔羊</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#d97706", margin: "3px 0" }}>{lambCount} <small style={{ fontSize: "11px" }}>只</small></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={lambPct}
                    onChange={(e) => setLambPct(Math.max(0, Math.min(40, parseInt(e.target.value, 10) || 10)))}
                    style={{ width: "42px", padding: "2px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="core-target"><strong>🎯 本次日粮配方核心优化群体</strong></label>
            <select
              id="core-target"
              value={coreTarget}
              onChange={(e) => {
                const val = e.target.value as "lactating" | "growing" | "lamb";
                setCoreTarget(val);
                if (val === "lactating") update({ class: "lactating" });
                else update({ class: "maintenance" });
              }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
            >
              <option value="lactating">成年泌乳期生产群 ({lactatingCount} 只 · 产奶与维持双重营养)</option>
              <option value="growing">青年育成羊群 ({growingCount} 只 · 生长发育与骨骼沉积)</option>
              <option value="lamb">断奶羔羊群 ({lambCount} 只 · 早期瘤胃培育与适口性)</option>
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="animal-class">羊只阶段</label>
        <select
          id="animal-class"
          value={form.class}
          onChange={(e) => update({ class: e.target.value as AnimalClass })}
        >
          <option value="lactating">成年泌乳奶山羊</option>
          <option value="maintenance">成年非泌乳维持期</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="body-weight">体重（kg）</label>
        <input
          id="body-weight"
          type="number"
          inputMode="decimal"
          min={WEIGHT_MIN}
          max={WEIGHT_MAX}
          step="0.1"
          value={form.bodyWeightKg}
          onChange={(e) => update({ bodyWeightKg: e.target.value })}
        />
        <span className="hint">适用范围 {WEIGHT_MIN}–{WEIGHT_MAX} kg</span>
      </div>

      {form.class === "lactating" && (
        <>
          <div className="field">
            <label htmlFor="milk-kg">日产奶量（kg/d）</label>
            <input
              id="milk-kg"
              type="number"
              inputMode="decimal"
              min={MILK_MIN}
              max={MILK_MAX}
              step="0.1"
              value={form.milkKg}
              onChange={(e) => update({ milkKg: e.target.value })}
            />
            <span className="hint">适用范围 {MILK_MIN}–{MILK_MAX} kg/d</span>
          </div>

          <div className="field">
            <label htmlFor="milk-fat">乳脂率（%，可选）</label>
            <input
              id="milk-fat"
              type="number"
              inputMode="decimal"
              min={FAT_MIN}
              max={FAT_MAX}
              step="0.1"
              placeholder="默认 4.0%"
              value={form.milkFatPercent}
              onChange={(e) => update({ milkFatPercent: e.target.value })}
            />
            <span className="hint">
              适用范围 {FAT_MIN}–{FAT_MAX}%，留空默认按 4.0% 标准乳换算
            </span>
          </div>
        </>
      )}

      {errors.length > 0 && (
        <ul className="error-list" role="alert">
          {errors.map((e, idx) => (
            <li key={idx}>{e}</li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button className="primary" onClick={handleNext}>下一步：选择原料</button>
      </div>
    </section>
  );
}
