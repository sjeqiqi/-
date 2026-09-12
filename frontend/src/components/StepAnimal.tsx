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

  const initialTotal = Math.max(1, parseInt(initialPasture?.totalFlockCount || "500", 10) || 500);
  const [lactatingCount, setLactatingCount] = useState<number>(
    initialPasture?.lactatingCount ?? Math.round((initialTotal * (initialPasture?.lactatingPct ?? 70)) / 100),
  );
  const [growingCount, setGrowingCount] = useState<number>(
    initialPasture?.growingCount ?? Math.round((initialTotal * (initialPasture?.growingPct ?? 20)) / 100),
  );
  const [lambCount, setLambCount] = useState<number>(
    initialPasture?.lambCount ??
      Math.max(
        0,
        initialTotal -
          (initialPasture?.lactatingCount ?? Math.round((initialTotal * (initialPasture?.lactatingPct ?? 70)) / 100)) -
          (initialPasture?.growingCount ?? Math.round((initialTotal * (initialPasture?.growingPct ?? 20)) / 100)),
      ),
  );

  const [coreTarget, setCoreTarget] = useState<"lactating" | "growing" | "lamb">(
    initialPasture?.coreTarget || "lactating",
  );

  const [form, setForm] = useState<AnimalForm>(initial);
  const [errors, setErrors] = useState<string[]>([]);

  // 1. 直接改某群体只数（只数输入）：自动计算新总数与各群体占比
  const handleCountChange = (stage: "lactating" | "growing" | "lamb", rawVal: string) => {
    let val = parseInt(rawVal, 10);
    if (isNaN(val) || val < 0) val = 0;

    const lCount = stage === "lactating" ? val : lactatingCount;
    const gCount = stage === "growing" ? val : growingCount;
    const bCount = stage === "lamb" ? val : lambCount;

    const newTotal = lCount + gCount + bCount;
    const lPct = newTotal > 0 ? Math.round((lCount / newTotal) * 100) : 0;
    const gPct = newTotal > 0 ? Math.round((gCount / newTotal) * 100) : 0;
    const bPct = newTotal > 0 ? Math.max(0, 100 - lPct - gPct) : 0;

    setTotalFlockCount(String(newTotal));
    setLactatingCount(lCount);
    setGrowingCount(gCount);
    setLambCount(bCount);
    setLactatingPct(lPct);
    setGrowingPct(gPct);
    setLambPct(bPct);
  };

  // 2. 直接改某群体占比（百分比输入）：自动平滑联动其余群体，占比总和恒为 100%
  const handlePctChange = (stage: "lactating" | "growing" | "lamb", rawVal: string) => {
    let val = parseInt(rawVal, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 100) val = 100;

    const total = Math.max(0, parseInt(totalFlockCount, 10) || 500);
    let lPct = lactatingPct;
    let gPct = growingPct;
    let bPct = lambPct;

    if (stage === "lactating") {
      lPct = val;
      const rem = 100 - lPct;
      gPct = Math.round(rem * (2 / 3));
      bPct = Math.max(0, rem - gPct);
    } else if (stage === "growing") {
      gPct = val;
      const rem = 100 - gPct;
      lPct = Math.round(rem * 0.7);
      bPct = Math.max(0, rem - lPct);
    } else if (stage === "lamb") {
      bPct = val;
      const rem = 100 - bPct;
      lPct = Math.round(rem * 0.7);
      gPct = Math.max(0, rem - lPct);
    }

    const lCount = Math.round(total * (lPct / 100));
    const gCount = Math.round(total * (gPct / 100));
    const bCount = Math.max(0, total - lCount - gCount);

    setLactatingPct(lPct);
    setGrowingPct(gPct);
    setLambPct(bPct);
    setLactatingCount(lCount);
    setGrowingCount(gCount);
    setLambCount(bCount);
  };

  // 3. 修改全场总存栏量：根据当前各群体占比重新计算只数
  const handleTotalChange = (valStr: string) => {
    setTotalFlockCount(valStr);
    const total = Math.max(0, parseInt(valStr, 10) || 0);
    const lCount = Math.round(total * (lactatingPct / 100));
    const gCount = Math.round(total * (growingPct / 100));
    const bCount = Math.max(0, total - lCount - gCount);
    setLactatingCount(lCount);
    setGrowingCount(gCount);
    setLambCount(bCount);
  };

  const selectCoreTarget = (val: "lactating" | "growing" | "lamb") => {
    setCoreTarget(val);
    if (val === "lactating") update({ class: "lactating" });
    else update({ class: "maintenance" });
  };

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
              min="1"
              max="50000"
              value={totalFlockCount}
              onChange={(e) => handleTotalChange(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              {["100", "300", "500", "1000", "2000"].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleTotalChange(cnt)}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ margin: 0 }}><strong>📊 羊群结构分布与只数</strong></label>
              <span style={{ fontSize: "11px", color: "#64748b" }}>只数与占比均可自由直接修改</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "4px" }}>
              {/* 1. 成年泌乳群 */}
              <div
                style={{
                  background: "#ffffff",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  border: coreTarget === "lactating" ? "2px solid #16a34a" : "1px solid #e2e8f0",
                  textAlign: "center",
                  boxShadow: coreTarget === "lactating" ? "0 2px 8px rgba(22,163,74,0.12)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1e293b", marginBottom: "4px" }}>
                    成年泌乳群
                  </div>
                  {coreTarget === "lactating" ? (
                    <span style={{ fontSize: "10px", background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                      ✓ 核心群
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="设成年泌乳群为核心群"
                      onClick={() => selectCoreTarget("lactating")}
                      style={{ fontSize: "10px", background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1", padding: "1px 6px", borderRadius: "10px", cursor: "pointer" }}
                    >
                      设为核心
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", margin: "8px 0" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={lactatingCount}
                    onChange={(e) => handleCountChange("lactating", e.target.value)}
                    style={{
                      width: "60px",
                      padding: "4px 2px",
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: "16px",
                      color: "#166534",
                      border: "1px solid #86efac",
                      borderRadius: "6px",
                      background: "#f0fdf4",
                    }}
                    title="点击直接修改成年泌乳群只数"
                  />
                  <span style={{ fontSize: "13px", color: "#166534", fontWeight: "bold" }}>只</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    value={lactatingPct}
                    onChange={(e) => handlePctChange("lactating", e.target.value)}
                    style={{ width: "42px", padding: "2px 0", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px" }}
                  />
                  <span>%</span>
                </div>
              </div>

              {/* 2. 青年育成羊 */}
              <div
                style={{
                  background: "#ffffff",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  border: coreTarget === "growing" ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  textAlign: "center",
                  boxShadow: coreTarget === "growing" ? "0 2px 8px rgba(2,132,199,0.12)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1e293b", marginBottom: "4px" }}>
                    青年育成羊
                  </div>
                  {coreTarget === "growing" ? (
                    <span style={{ fontSize: "10px", background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                      ✓ 核心群
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="设青年育成羊为核心群"
                      onClick={() => selectCoreTarget("growing")}
                      style={{ fontSize: "10px", background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1", padding: "1px 6px", borderRadius: "10px", cursor: "pointer" }}
                    >
                      设为核心
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", margin: "8px 0" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={growingCount}
                    onChange={(e) => handleCountChange("growing", e.target.value)}
                    style={{
                      width: "60px",
                      padding: "4px 2px",
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: "16px",
                      color: "#0284c7",
                      border: "1px solid #7dd3fc",
                      borderRadius: "6px",
                      background: "#f0f9ff",
                    }}
                    title="点击直接修改青年育成羊只数"
                  />
                  <span style={{ fontSize: "13px", color: "#0284c7", fontWeight: "bold" }}>只</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    value={growingPct}
                    onChange={(e) => handlePctChange("growing", e.target.value)}
                    style={{ width: "42px", padding: "2px 0", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px" }}
                  />
                  <span>%</span>
                </div>
              </div>

              {/* 3. 断奶羔羊 */}
              <div
                style={{
                  background: "#ffffff",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  border: coreTarget === "lamb" ? "2px solid #d97706" : "1px solid #e2e8f0",
                  textAlign: "center",
                  boxShadow: coreTarget === "lamb" ? "0 2px 8px rgba(217,119,6,0.12)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1e293b", marginBottom: "4px" }}>
                    断奶羔羊
                  </div>
                  {coreTarget === "lamb" ? (
                    <span style={{ fontSize: "10px", background: "#fef3c7", color: "#b45309", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                      ✓ 核心群
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="设断奶羔羊为核心群"
                      onClick={() => selectCoreTarget("lamb")}
                      style={{ fontSize: "10px", background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1", padding: "1px 6px", borderRadius: "10px", cursor: "pointer" }}
                    >
                      设为核心
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", margin: "8px 0" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={lambCount}
                    onChange={(e) => handleCountChange("lamb", e.target.value)}
                    style={{
                      width: "60px",
                      padding: "4px 2px",
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: "16px",
                      color: "#d97706",
                      border: "1px solid #fde68a",
                      borderRadius: "6px",
                      background: "#fffbeb",
                    }}
                    title="点击直接修改断奶羔羊只数"
                  />
                  <span style={{ fontSize: "13px", color: "#d97706", fontWeight: "bold" }}>只</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", fontSize: "11px", color: "#64748b" }}>
                  <span>占比</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    value={lambPct}
                    onChange={(e) => handlePctChange("lamb", e.target.value)}
                    style={{ width: "42px", padding: "2px 0", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px" }}
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
