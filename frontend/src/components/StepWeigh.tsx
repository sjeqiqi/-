import { useState, useEffect, useRef } from "react";
import type { FeedRow, ScaleOption, WeighFeedItem } from "../types";

interface Props {
  feedRows: FeedRow[];
  onBack: () => void;
}

const SCALE_OPTIONS: ScaleOption[] = [
  { key: "100", label: "1:100 (Demo推荐)", ratio: 0.01 },
  { key: "50", label: "1:50", ratio: 0.02 },
  { key: "20", label: "1:20", ratio: 0.05 },
  { key: "10", label: "1:10", ratio: 0.1 },
  { key: "1", label: "1:1 (原比例)", ratio: 1.0 },
];

export function StepWeigh({ feedRows, onBack }: Props) {
  const [activeMode, setActiveMode] = useState<"recipe" | "custom">("recipe");
  const [scaleRatio, setScaleRatio] = useState<number>(0.01);
  const [scaleKey, setScaleKey] = useState<string>("100");

  const [connected, setConnected] = useState<boolean>(true);
  const [statusText, setStatusText] = useState<string>("待机就绪 (等待下料)");
  const [statusEmoji, setStatusEmoji] = useState<string>("💤");
  const [statusClass, setStatusClass] = useState<string>("idle");

  const [currentWeight, setCurrentWeight] = useState<number>(0.0);
  const [weighItems, setWeighItems] = useState<WeighFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const [customTarget, setCustomTarget] = useState<string>("15");
  const [customTolerance, setCustomTolerance] = useState<string>("1.0");

  const [logs, setLogs] = useState<string[]>([]);
  const simTimerRef = useRef<any>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 40)]);
  };

  useEffect(() => {
    if (feedRows && feedRows.length > 0) {
      const items: WeighFeedItem[] = feedRows.map((row) => {
        const rawG = Math.round(row.as_fed_kg * 1000);
        const scaledG = rawG > 0 ? Math.max(0.5, Number((rawG * scaleRatio).toFixed(1))) : 0;
        let tol = 1.0;
        if (scaledG <= 5) tol = 0.5;
        else if (scaledG >= 30) tol = 2.0;

        return {
          feed_id: row.feed_id,
          name: row.name,
          as_fed_kg: row.as_fed_kg,
          raw_g: rawG,
          target_g: scaledG,
          tolerance_g: tol,
          status: "pending",
          weighed_g: null,
        };
      });
      setWeighItems(items);
      setCurrentIndex(0);
      addLog(`已加载配方原料流水线，共 ${items.length} 种原料，缩放比例 1:${scaleKey}`);
    }
  }, [feedRows, scaleRatio, scaleKey]);

  const currentItem: WeighFeedItem | undefined =
    activeMode === "recipe" ? weighItems[currentIndex] : undefined;

  const targetG =
    activeMode === "recipe"
      ? currentItem?.target_g || 15
      : parseFloat(customTarget) || 15;
  const toleranceG =
    activeMode === "recipe"
      ? currentItem?.tolerance_g || 1.0
      : parseFloat(customTolerance) || 1.0;

  const handleScaleChange = (opt: ScaleOption) => {
    setScaleKey(opt.key);
    setScaleRatio(opt.ratio);
    addLog(`切换称重缩放比例为 ${opt.label}`);
  };

  const handleTare = () => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    setCurrentWeight(0.0);
    setStatusText("去皮清零完成 (0.0g)");
    setStatusEmoji("⚖️");
    setStatusClass("idle");
    addLog("执行传感器去皮 (TARE) 操作，零点校准完成");
  };

  const handleSimulateWeigh = () => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    handleTare();

    setStatusText("正在自动伺服下料中…");
    setStatusEmoji("⏳");
    setStatusClass("weighing");
    addLog(`开始执行原料【${currentItem?.name || "目标物料"}】自动下料，目标: ${targetG}g ±${toleranceG}g`);

    let current = 0.0;
    const step = Math.max(0.2, targetG / 25);

    simTimerRef.current = setInterval(() => {
      current += step + (Math.random() * 0.4 - 0.2);
      if (current >= targetG - toleranceG * 0.3) {
        current = Number((targetG + (Math.random() * 0.4 - 0.2)).toFixed(1));
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
        setCurrentWeight(current);
        setStatusText(`称量下料完成！实称 ${current}g (在公差范围内)`);
        setStatusEmoji("✓");
        setStatusClass("done");
        addLog(`【${currentItem?.name || "目标物料"}】称量合格：实称 ${current}g，目标 ${targetG}g (误差 ${(current - targetG).toFixed(2)}g)`);

        if (activeMode === "recipe" && currentItem) {
          setWeighItems((prev) => {
            const next = [...prev];
            next[currentIndex] = {
              ...next[currentIndex],
              status: "completed",
              weighed_g: current,
            };
            return next;
          });
        }
      } else {
        setCurrentWeight(Number(current.toFixed(1)));
      }
    }, 100);
  };

  const handleNextItem = () => {
    if (currentIndex < weighItems.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      handleTare();
      addLog(`切换至下一原料项：【${weighItems[nextIdx].name}】`);
    } else {
      setStatusText("恭喜！日粮配方全部原料下料配比完成！");
      setStatusEmoji("🎉");
      addLog("全流程日粮配比下料全部完成，TMR搅拌机准备就绪");
    }
  };

  const completedCount = weighItems.filter((i) => i.status === "completed").length;

  return (
    <section className="card weigh-card" aria-label="智能称重投喂">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2>第四步：智能饲喂与称重联动控制</h2>
        <button type="button" onClick={onBack} style={{ fontSize: "13px", padding: "4px 10px" }}>
          ‹ 返回配方
        </button>
      </div>
      <p className="section-lead">
        支持树莓派 HX711 称重传感器硬件通信与 DEMO 演示机等比缩小投喂流水线。
      </p>

      <div
        style={{
          background: "#0f172a",
          color: "#f8fafc",
          padding: "14px",
          borderRadius: "10px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <strong style={{ fontSize: "16px" }}>{connected ? "weigh-machine" : "离线模拟器"}</strong>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "10px",
                background: connected ? "#059669" : "#475569",
                color: "#ffffff",
              }}
            >
              {connected ? "● 智能联动就绪" : "○ 未连接外设"}
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            树莓派 BLE 智能称重外设联动 (0~50g DEMO 演示机)
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setConnected(!connected);
            addLog(connected ? "已断开外设连接" : "已重新连接树莓派称重外设");
          }}
          style={{
            background: connected ? "#334155" : "#16a34a",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            padding: "6px 12px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {connected ? "断开" : "连接设备"}
        </button>
      </div>

      <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <strong style={{ fontSize: "13px", color: "#334155" }}>🔬 DEMO 演示机等比缩放配置 (0~50g 量程)</strong>
          <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: "bold" }}>当前 1:{scaleKey}</span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleScaleChange(opt)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                border: scaleKey === opt.key ? "2px solid #16a34a" : "1px solid #cbd5e1",
                background: scaleKey === opt.key ? "#dcfce7" : "#ffffff",
                color: scaleKey === opt.key ? "#166534" : "#475569",
                fontWeight: scaleKey === opt.key ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          type="button"
          onClick={() => setActiveMode("recipe")}
          style={{
            flex: 1,
            padding: "8px",
            borderRadius: "6px",
            border: activeMode === "recipe" ? "2px solid #16a34a" : "1px solid #cbd5e1",
            background: activeMode === "recipe" ? "#f0fdf4" : "#ffffff",
            color: activeMode === "recipe" ? "#166534" : "#475569",
            fontWeight: activeMode === "recipe" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          📋 配方流水线模式 ({completedCount}/{weighItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMode("custom")}
          style={{
            flex: 1,
            padding: "8px",
            borderRadius: "6px",
            border: activeMode === "custom" ? "2px solid #16a34a" : "1px solid #cbd5e1",
            background: activeMode === "custom" ? "#f0fdf4" : "#ffffff",
            color: activeMode === "custom" ? "#166534" : "#475569",
            fontWeight: activeMode === "custom" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          🎯 自由单次称量模式
        </button>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "2px solid #e2e8f0",
          borderRadius: "12px",
          padding: "20px",
          textAlign: "center",
          marginBottom: "16px",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ fontSize: "14px", color: "#64748b" }}>
          当前称量物料：
          <strong style={{ color: "#0f172a", fontSize: "16px" }}>
            {activeMode === "recipe" ? currentItem?.name || "暂无原料" : "自由物料"}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "16px", margin: "10px 0" }}>
          <span style={{ fontSize: "13px", color: "#334155" }}>
            目标重量：<strong>{targetG}g</strong>
          </span>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            允许公差：<strong>±{toleranceG}g</strong>
          </span>
        </div>

        <div
          style={{
            fontSize: "56px",
            fontWeight: "900",
            fontFamily: "monospace",
            color: statusClass === "done" ? "#16a34a" : statusClass === "weighing" ? "#0284c7" : "#1e293b",
            margin: "12px 0",
          }}
        >
          {currentWeight.toFixed(1)}
          <span style={{ fontSize: "22px", fontWeight: "normal", color: "#64748b", marginLeft: "4px" }}>g</span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            background: statusClass === "done" ? "#dcfce7" : statusClass === "weighing" ? "#e0f2fe" : "#f1f5f9",
            color: statusClass === "done" ? "#166534" : statusClass === "weighing" ? "#0369a1" : "#475569",
            marginBottom: "18px",
          }}
        >
          <span>{statusEmoji}</span>
          <span>{statusText}</span>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleTare}
            style={{
              padding: "10px 18px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            去皮清零 (TARE)
          </button>
          <button
            type="button"
            onClick={handleSimulateWeigh}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "none",
              background: "#16a34a",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ⚡ 自动模拟下料 (Demo)
          </button>
          {activeMode === "recipe" && (
            <button
              type="button"
              onClick={handleNextItem}
              disabled={currentIndex >= weighItems.length - 1 && statusClass === "done"}
              style={{
                padding: "10px 18px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#f1f5f9",
                color: "#1e293b",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              下一项原料 ❯
            </button>
          )}
        </div>
      </div>

      {activeMode === "recipe" && (
        <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
          <strong style={{ fontSize: "14px", color: "#334155", display: "block", marginBottom: "8px" }}>
            📦 日粮配方下料流水线 ({weighItems.length} 种原料)
          </strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {weighItems.map((item, idx) => (
              <div
                key={item.feed_id}
                onClick={() => {
                  setCurrentIndex(idx);
                  handleTare();
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: currentIndex === idx ? "#ffffff" : "#f1f5f9",
                  border: currentIndex === idx ? "2px solid #16a34a" : "1px solid #e2e8f0",
                  cursor: "pointer",
                }}
              >
                <div>
                  <strong style={{ color: currentIndex === idx ? "#166534" : "#1e293b", fontSize: "14px" }}>
                    {idx + 1}. {item.name}
                  </strong>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    原配方: {item.as_fed_kg} kg/天 (100% 原物重: {item.raw_g}g)
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#0f172a" }}>
                    目标: {item.target_g}g
                  </div>
                  <div style={{ fontSize: "11px", color: item.status === "completed" ? "#16a34a" : "#64748b" }}>
                    {item.status === "completed" ? `✓ 实称 ${item.weighed_g}g` : currentIndex === idx ? "⏳ 正在称量" : "待下料"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMode === "custom" && (
        <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
          <strong style={{ fontSize: "14px", color: "#334155", display: "block", marginBottom: "8px" }}>
            🎯 设定单次称量目标
          </strong>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "#64748b" }}>目标重量 (g)</label>
              <input
                type="number"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "#64748b" }}>允许公差 (±g)</label>
              <input
                type="number"
                value={customTolerance}
                onChange={(e) => setCustomTolerance(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
            {["2", "5", "10", "15", "20", "25", "30", "50"].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setCustomTarget(g)}
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  border: customTarget === g ? "1px solid #16a34a" : "1px solid #cbd5e1",
                  background: customTarget === g ? "#dcfce7" : "#ffffff",
                  color: customTarget === g ? "#166534" : "#475569",
                  cursor: "pointer",
                }}
              >
                {g}g
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#0f172a", color: "#94a3b8", padding: "12px", borderRadius: "8px", fontSize: "12px", maxHeight: "160px", overflowY: "auto" }}>
        <div style={{ color: "#38bdf8", fontWeight: "bold", marginBottom: "4px" }}>
          📟 硬件通信与称量日志
        </div>
        {logs.map((l, i) => (
          <div key={i} style={{ lineHeight: "1.5", fontFamily: "monospace" }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ marginTop: "18px", display: "flex", gap: "10px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px",
            border: "none",
            background: "#16a34a",
            color: "#ffffff",
            fontWeight: "bold",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          返回日粮配比看板
        </button>
      </div>
    </section>
  );
}
