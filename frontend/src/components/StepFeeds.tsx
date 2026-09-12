import { useEffect, useMemo, useState } from "react";
import { fetchFeeds } from "../api";
import type { AnimalClass, CatalogFeed, FeedOverride } from "../types";
import { REGIONAL_FEED_DATABASE } from "../types";
import type { PastureForm } from "./StepAnimal";

export interface FeedForm {
  feed_id: string;
  owned: boolean;
  price: string;
  override: FeedOverride | null;
}

export type FeedsMode = "recommended" | "manual";

const OVERRIDE_LABELS: { key: keyof FeedOverride; label: string }[] = [
  { key: "dm_pct", label: "干物质（DM %）" },
  { key: "me_mj_per_kg_dm", label: "代谢能（MJ/kg DM）" },
  { key: "cp_pct_dm", label: "粗蛋白（%DM）" },
  { key: "ndf_pct_dm", label: "中性洗涤纤维（NDF %DM）" },
  { key: "ca_pct_dm", label: "钙（%DM）" },
  { key: "p_pct_dm", label: "磷（%DM）" },
];

const FEED_GROUPS: { category: CatalogFeed["category"]; title: string; description: string }[] = [
  { category: "concentrate", title: "精料", description: "主要补充能量和蛋白" },
  { category: "forage", title: "粗饲料", description: "构成日粮基础，帮助维持瘤胃健康" },
  { category: "mineral", title: "矿物质", description: "用于补充食盐、钙磷等" },
];

interface Props {
  initial: FeedForm[] | null;
  initialMode: FeedsMode;
  animalClass: AnimalClass;
  pasture?: PastureForm;
  onNext: (forms: FeedForm[], mode: FeedsMode) => void;
  onBack: () => void;
}

export function StepFeeds({ initial, initialMode, animalClass, pasture, onNext, onBack }: Props) {
  const [catalog, setCatalog] = useState<CatalogFeed[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedsMode>(initialMode);
  const [forms, setForms] = useState<FeedForm[]>(() =>
    initial ??
    [/* 由 catalog 加载后初始化 */],
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoreTip, setRestoreTip] = useState<string | null>(null);

  const regionId = pasture?.regionId || "guanzhong";
  const regionData = REGIONAL_FEED_DATABASE[regionId] || REGIONAL_FEED_DATABASE.guanzhong;
  const regionName = pasture?.regionName || regionData.name;
  const regionNote = regionData.note;

  useEffect(() => {
    fetchFeeds(regionId)
      .then((res) => {
        setCatalog(res.feeds);
        setForms((prev) => {
          if (initial && prev.length > 0) return prev;
          return res.feeds.map((f) => ({
            feed_id: f.feed_id,
            owned: initialMode === "recommended",
            price: String(f.default_price_rmb_per_kg),
            override: null,
          }));
        });
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [regionId]);

  const handleRestoreRegionDefaults = () => {
    const reg = REGIONAL_FEED_DATABASE[regionId] || REGIONAL_FEED_DATABASE.guanzhong;
    setForms((prev) =>
      prev.map((item) => {
        const regFeed = reg.feeds[item.feed_id];
        return {
          ...item,
          price: regFeed ? String(regFeed.price) : item.price,
          override: null,
        };
      }),
    );
    setRestoreTip(`已成功还原为【${reg.name}】产区默认采购行情与实测指标！`);
    setTimeout(() => setRestoreTip(null), 3000);
  };

  const updateForm = (feedId: string, patch: Partial<FeedForm>) => {
    setForms((prev) => prev.map((f) => (f.feed_id === feedId ? { ...f, ...patch } : f)));
  };

  const updateOverride = (feedId: string, key: keyof FeedOverride, value: string) => {
    setForms((prev) =>
      prev.map((f) => {
        if (f.feed_id !== feedId) return f;
        const override = { ...(f.override ?? {}) } as Record<string, string>;
        if (value.trim() === "") delete override[key];
        else override[key] = value;
        return { ...f, override: override as unknown as FeedOverride };
      }),
    );
  };

  const selectedCount = useMemo(() => forms.filter((f) => f.owned).length, [forms]);

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (selectedCount > 0 && selectedCount <= 2) {
      list.push("只选择 1–2 种原料，营养可能配不齐。可以继续计算，结果页会清楚标出缺少什么。");
    }
    const hasForage = forms.some((f) => {
      const meta = catalog.find((c) => c.feed_id === f.feed_id);
      return f.owned && meta?.category === "forage";
    });
    if (!hasForage) {
      list.push("还没有选择粗饲料，日粮结构可能不完整；系统不会替你自动添加。");
    }
    const hasSalt = forms.some((f) => f.owned && f.feed_id === "salt");
    if (!hasSalt) {
      list.push("还没有选择食盐，配方可能无法达标；系统不会替你自动添加。");
    }
    return list;
  }, [catalog, forms, selectedCount]);

  const handleNext = () => {
    if (selectedCount === 0) {
      setError("请至少选择一种原料，再开始计算");
      return;
    }
    if (forms.some((f) => Number(f.price) < 0)) {
      setError("原料价格不能小于 0，请检查后再计算");
      return;
    }
    setError(null);

    // 自动对齐小程序：将产区特色营养实测指标作为原料基础指标（用户自定义化验单参数具有最高覆盖优先级）
    const enrichedForms = forms.map((f) => {
      const cat = catalog.find((c) => c.feed_id === f.feed_id);
      const userOv = f.override || {};
      const regOv: Record<string, string> = {};
      if (cat) {
        if (cat.dm_pct != null) regOv.dm_pct = String(cat.dm_pct);
        if (cat.me_mj_per_kg_dm != null) regOv.me_mj_per_kg_dm = String(cat.me_mj_per_kg_dm);
        if (cat.cp_pct_dm != null) regOv.cp_pct_dm = String(cat.cp_pct_dm);
        if (cat.ndf_pct_dm != null) regOv.ndf_pct_dm = String(cat.ndf_pct_dm);
        if (cat.ca_pct_dm != null) regOv.ca_pct_dm = String(cat.ca_pct_dm);
        if (cat.p_pct_dm != null) regOv.p_pct_dm = String(cat.p_pct_dm);
      }
      for (const [k, v] of Object.entries(userOv)) {
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          regOv[k] = String(v);
        }
      }
      return {
        ...f,
        override: Object.keys(regOv).length > 0 ? (regOv as unknown as FeedOverride) : null,
      };
    });

    onNext(enrichedForms, mode);
  };

  if (loadError) {
    return (
      <section className="card">
        <h2>第二步：原料与价格</h2>
        <p className="error-text" role="alert">原料暂时没有加载出来，请检查网络或稍后再试。</p>
        <p className="hint">问题详情：{loadError}</p>
        <div className="actions">
          <button onClick={onBack}>上一步</button>
        </div>
      </section>
    );
  }

  if (catalog.length === 0) {
    return (
      <section className="card">
        <h2>第二步：原料与价格</h2>
        <p>正在加载原料库…</p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="原料与价格">
      <h2>第二步：选择原料并填写价格</h2>
      <p className="section-lead">先选你能用的原料，再把价格改成当地实际价格。</p>

      {/* 产区采购行情与营养数据库联动指示条 (全面对齐微信小程序) */}
      <div
        className="region-indicator-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: "10px",
          padding: "12px 16px",
          marginBottom: "16px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>📍</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong style={{ color: "#166534", fontSize: "15px" }}>{regionName}</strong>
              <span
                style={{
                  background: "#16a34a",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "2px 8px",
                  borderRadius: "10px",
                }}
              >
                行情已联动
              </span>
            </div>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#475569" }}>
              {regionNote}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-restore-region"
          onClick={handleRestoreRegionDefaults}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            background: "#ffffff",
            border: "1px solid #86efac",
            color: "#166534",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          ↺ 还原产区默认
        </button>
      </div>

      {restoreTip && (
        <div
          style={{
            background: "#ecfdf5",
            color: "#065f46",
            padding: "8px 14px",
            borderRadius: "6px",
            marginBottom: "14px",
            fontSize: "13px",
            border: "1px solid #a7f3d0",
          }}
        >
          ✓ {restoreTip}
        </div>
      )}

      <div className="mode-toggle" role="radiogroup" aria-label="原料选择模式">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "recommended"}
          className={mode === "recommended" ? "active" : ""}
          onClick={() => setMode("recommended")}
        >
          推荐模式
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "manual"}
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          自选模式
        </button>
      </div>

      {mode === "recommended" ? (
        <div className="mode-panel recommended-panel">
          <p className="mode-title">推荐原料池（适合不熟悉配方的用户）</p>
          <p className="hint">
            系统已预选一组常用候选原料。勾选表示允许系统使用，不代表最终配方一定会使用；
            具体原料和克数会根据羊只信息、价格和检测值自动计算。
            {animalClass === "maintenance" ? " 当前为维持期羊。" : ""}
          </p>
        </div>
      ) : (
        <div className="mode-panel manual-panel">
          <p className="mode-title">自选模式</p>
          <p className="hint">
            完全尊重你的勾选集合：未勾选原料不会自动加入，也不会被后台恢复。
            原料过少可能无法满足全部营养约束，系统会给出近似结果并列出缺口。
            {animalClass === "maintenance" ? " 当前为维持期羊。" : ""}
          </p>
        </div>
      )}

      <p className="hint selected-count">
        已勾选 {selectedCount} 种候选原料；勾选 ≠ 最终一定使用。
      </p>

      {warnings.length > 0 && (
        <div className="warnings-note" role="status">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="feed-groups">
        {FEED_GROUPS.map((group) => {
          const groupForms = forms.filter((form) =>
            catalog.find((item) => item.feed_id === form.feed_id)?.category === group.category,
          );
          if (groupForms.length === 0) return null;
          return (
            <section className="feed-group" key={group.category} aria-labelledby={`feed-group-${group.category}`}>
              <div className="feed-group-heading">
                <h3 id={`feed-group-${group.category}`}>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <div className="feed-card-grid">
                {groupForms.map((form) => {
                  const meta = catalog.find((item) => item.feed_id === form.feed_id);
                  if (!meta) return null;
                  return (
                    <FeedCard
                      key={form.feed_id}
                      meta={meta}
                      form={form}
                      expanded={expanded === form.feed_id}
                      onToggleExpand={() => setExpanded(expanded === form.feed_id ? null : form.feed_id)}
                      onOwned={(value) => updateForm(form.feed_id, { owned: value })}
                      onPrice={(value) => updateForm(form.feed_id, { price: value })}
                      onOverride={(key, value) => updateOverride(form.feed_id, key, value)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="actions">
        <button onClick={onBack}>上一步</button>
        <button className="primary" onClick={handleNext}>下一步：计算配方</button>
      </div>
    </section>
  );
}

function FeedCard(props: {
  meta: CatalogFeed;
  form: FeedForm;
  expanded: boolean;
  onToggleExpand: () => void;
  onOwned: (v: boolean) => void;
  onPrice: (v: string) => void;
  onOverride: (key: keyof FeedOverride, value: string) => void;
}) {
  const { meta, form, expanded } = props;
  return (
    <article className={`feed-card ${form.owned ? "selected" : ""}`}>
      <div className="feed-card-header">
        <label className="feed-check">
          <input
            type="checkbox"
            aria-label={`${meta.name} 用于配方`}
            checked={form.owned}
            onChange={(e) => props.onOwned(e.target.checked)}
          />
          <span>
            <strong>{meta.name}</strong>
            {meta.is_estimate && <span className="tag">成分估算值</span>}
          </span>
        </label>
        <span className="feed-selected-state">{form.owned ? "已选择" : "未选择"}</span>
      </div>
      <div className="feed-card-fields">
        <label>
          <span>当地价格（元/kg）</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-label={`${meta.name} 价格`}
            value={form.price}
            onChange={(e) => props.onPrice(e.target.value)}
          />
        </label>
        <div className="feed-limit">
          <span>建议最高占比</span>
          <strong>{meta.max_usage_pct_dm}% 干物质</strong>
        </div>
      </div>
      <button type="button" className="link feed-details-toggle" onClick={props.onToggleExpand}>
        {expanded ? "收起营养检测值" : "有检测报告？填写营养值"}
      </button>
      {expanded && (
        <div className="override-grid">
          {OVERRIDE_LABELS.map(({ key, label }) => (
            <div key={key} className="field">
              <label htmlFor={`override-${meta.feed_id}-${key}`}>
                {label}
                <span className="hint">系统默认 {meta[key as "dm_pct"]}</span>
              </label>
              <input
                id={`override-${meta.feed_id}-${key}`}
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder={`默认 ${meta[key as "dm_pct"]}`}
                value={(form.override?.[key] as string | undefined) ?? ""}
                onChange={(e) => props.onOverride(key, e.target.value)}
              />
            </div>
          ))}
          <p className="hint">没有检测报告可以留空，系统会使用默认估算值。</p>
        </div>
      )}
    </article>
  );
}
