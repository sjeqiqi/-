import { useEffect, useMemo, useState } from "react";
import { fetchFeeds } from "../api";
import type { AnimalClass, CatalogFeed, FeedOverride } from "../types";

export interface FeedForm {
  feed_id: string;
  owned: boolean;
  price: string;
  override: FeedOverride | null;
}

const OVERRIDE_LABELS: { key: keyof FeedOverride; label: string }[] = [
  { key: "dm_pct", label: "DM %" },
  { key: "me_mj_per_kg_dm", label: "ME MJ/kgDM" },
  { key: "cp_pct_dm", label: "CP %DM" },
  { key: "ndf_pct_dm", label: "NDF %DM" },
  { key: "ca_pct_dm", label: "Ca %DM" },
  { key: "p_pct_dm", label: "P %DM" },
];

interface Props {
  initial: FeedForm[] | null;
  animalClass: AnimalClass;
  onNext: (forms: FeedForm[]) => void;
  onBack: () => void;
}

export function StepFeeds({ initial, animalClass, onNext, onBack }: Props) {
  const [catalog, setCatalog] = useState<CatalogFeed[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forms, setForms] = useState<FeedForm[]>(() =>
    initial ??
    [/* 由 catalog 加载后初始化 */],
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchFeeds()
      .then((res) => {
        setCatalog(res.feeds);
        setForms((prev) => {
          if (prev.length > 0) return prev;
          return res.feeds.map((f) => ({
            feed_id: f.feed_id,
            owned: false,
            price: String(f.default_price_rmb_per_kg),
            override: null,
          }));
        });
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

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

  const handleNext = () => {
    if (selectedCount === 0) {
      setError("请至少勾选一种允许用于本次配方的原料");
      return;
    }
    if (forms.some((f) => Number(f.price) < 0)) {
      setError("原料价格不能为负");
      return;
    }
    setError(null);
    onNext(forms);
  };

  if (loadError) {
    return (
      <section className="card">
        <h2>第二步：原料与价格</h2>
        <p className="error-text" role="alert">原料数据加载失败：{loadError}</p>
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
      <h2>第二步：原料与价格</h2>
      <p className="hint">
        算法只使用勾选的原料；未勾选原料不会自动加入。若勾选集合无法满足营养约束，系统会说明原因并请你返回调整。
        {animalClass === "maintenance" ? " 当前为维持期羊。" : ""}
      </p>

      <table className="feed-table">
        <thead>
          <tr>
            <th>用于配方</th>
            <th>原料</th>
            <th>类别</th>
            <th>价格（元/kg 原物质）</th>
            <th>默认上限（%DM）</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {forms.map((f) => {
            const meta = catalog.find((c) => c.feed_id === f.feed_id);
            if (!meta) return null;
            return (
              <FeedRowView
                key={f.feed_id}
                meta={meta}
                form={f}
                expanded={expanded === f.feed_id}
                onToggleExpand={() => setExpanded(expanded === f.feed_id ? null : f.feed_id)}
                onOwned={(v) => updateForm(f.feed_id, { owned: v })}
                onPrice={(v) => updateForm(f.feed_id, { price: v })}
                onOverride={(key, value) => updateOverride(f.feed_id, key, value)}
              />
            );
          })}
        </tbody>
      </table>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="actions">
        <button onClick={onBack}>上一步</button>
        <button className="primary" onClick={handleNext}>下一步：计算配方</button>
      </div>
    </section>
  );
}

function FeedRowView(props: {
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
    <>
      <tr>
        <td>
          <input
            type="checkbox"
            aria-label={`${meta.name} 用于配方`}
            checked={form.owned}
            onChange={(e) => props.onOwned(e.target.checked)}
          />
        </td>
        <td>
          {meta.name}
          {meta.is_estimate && <span className="tag">估算</span>}
        </td>
        <td>{meta.category === "concentrate" ? "精料" : meta.category === "forage" ? "粗饲料" : "矿物质/其他"}</td>
        <td>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-label={`${meta.name} 价格`}
            value={form.price}
            onChange={(e) => props.onPrice(e.target.value)}
          />
        </td>
        <td>{meta.max_usage_pct_dm}%</td>
        <td>
          <button type="button" className="link" onClick={props.onToggleExpand}>
            {expanded ? "收起检测值覆盖" : "检测值覆盖…"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="override-row">
          <td colSpan={6}>
            <div className="override-grid">
              {OVERRIDE_LABELS.map(({ key, label }) => (
                <div key={key} className="field">
                  <label htmlFor={`override-${meta.feed_id}-${key}`}>
                    {label}
                    <span className="hint">默认 {meta[key as "dm_pct"]}</span>
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
              <p className="hint">除 DM 外均为干物质基础；留空表示使用默认估算值。</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
