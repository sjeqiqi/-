import { useCallback, useEffect, useState } from "react";
import type { AnimalInput, CalculateRequest, FeedInput } from "./types";
import { StepAnimal, type AnimalForm, type PastureForm } from "./components/StepAnimal";
import { StepFeeds, type FeedForm, type FeedsMode } from "./components/StepFeeds";
import { StepResult } from "./components/StepResult";

export function isAndroidAppEnv(): boolean {
  if (typeof window === "undefined") return false;
  const loc = window.location;
  if (
    (window as any).isAndroidApp === true ||
    Boolean((window as any).AndroidNative) ||
    loc.hostname === "appassets.androidplatform.net" ||
    loc.protocol === "file:" ||
    /DairyGoatApp/i.test(navigator.userAgent) ||
    loc.search.includes("app=1") ||
    loc.search.includes("isApp=true")
  ) {
    return true;
  }
  return false;
}

export default function App() {
  const [step, setStep] = useState(1);
  const [isApp, setIsApp] = useState<boolean>(() => isAndroidAppEnv());

  useEffect(() => {
    if (!isApp) {
      const check = () => {
        if (isAndroidAppEnv()) {
          setIsApp(true);
        }
      };
      check();
      const timer = setTimeout(check, 300);
      return () => clearTimeout(timer);
    }
  }, [isApp]);

  const [animal, setAnimal] = useState<AnimalForm>({
    class: "lactating",
    bodyWeightKg: "50",
    milkKg: "2.5",
    milkFatPercent: "4",
  });
  const [pasture, setPasture] = useState<PastureForm>({
    calcMode: "pasture",
    regionId: "shaanxi",
    regionName: "陕西关中 (主产区)",
    totalFlockCount: "500",
    lactatingPct: 70,
    lactatingCount: 350,
    growingPct: 20,
    growingCount: 100,
    lambPct: 10,
    lambCount: 50,
    coreTarget: "lactating",
    coreTargetName: "泌乳核心群 (产奶期)",
    coreCount: 350,
  });
  const [feeds, setFeeds] = useState<FeedForm[] | null>(null);
  const [feedsMode, setFeedsMode] = useState<FeedsMode>("recommended");
  const [request, setRequest] = useState<CalculateRequest | null>(null);

  const handleAnimalNext = useCallback((form: AnimalForm, pastureForm?: PastureForm) => {
    setAnimal(form);
    if (pastureForm) {
      setPasture(pastureForm);
    }
    setStep(2);
  }, []);

  const handleFeedsNext = useCallback((forms: FeedForm[], mode: FeedsMode) => {
    setFeeds(forms);
    setFeedsMode(mode);
    const animalInput: AnimalInput = {
      class: forms ? animal.class : "maintenance",
      body_weight_kg: Number(animal.bodyWeightKg),
    };
    if (animal.class === "lactating") {
      animalInput.milk_kg = Number(animal.milkKg);
      animalInput.milk_fat_percent =
        animal.milkFatPercent.trim() === "" ? null : Number(animal.milkFatPercent);
    }
    const feedInputs: FeedInput[] = forms.map((f) => {
      const rawOverride = f.override ?? {};
      const override: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawOverride)) {
        if (v !== undefined && v !== null && v !== "") {
          override[k] = Number(v);
        }
      }
      return {
        feed_id: f.feed_id,
        owned: f.owned,
        price_rmb_per_kg: f.price === "" ? null : Number(f.price),
        override: Object.keys(override).length > 0 ? (override as FeedInput["override"]) : null,
      };
    });
    setRequest({ animal: animalInput, feeds: feedInputs });
    setStep(3);
  }, [animal]);

  return (
    <div className={`app ${isApp ? "in-app-env" : ""}`}>
      <header className="app-header">
        <div className={`app-top-bar ${isApp ? "no-download" : ""}`}>
          <span className="app-top-badge">🌾 奶山羊常用原料智能日粮配比系统</span>
          {!isApp && (
            <a
              href="/奶山羊日粮配比助手_Android_v1.0.apk"
              download="奶山羊日粮配比助手_Android_v1.0.apk"
              className="app-download-btn"
              title="点击下载奶山羊日粮配比助手安卓安装包 (APK)"
            >
              <span className="app-download-icon">📱</span>
              <span>下载安卓版 App</span>
              <span className="app-download-badge">v1.0 · 2.3MB</span>
            </a>
          )}
        </div>

        <h1>奶山羊常用原料日粮配比助手</h1>
        <p className="hero-title">输入羊只情况、原料和价格，自动计算推荐配方</p>
        <p className="subtitle">帮你快速得到每日喂多少、营养是否达标、一天花多少钱</p>

        {step === 1 && (
          <div className="entry-modes" aria-label="配方模式入口">
            <button
              type="button"
              className={`entry-mode recommended-entry ${feedsMode === "recommended" ? "primary selected" : ""}`}
              aria-pressed={feedsMode === "recommended"}
              onClick={() => setFeedsMode("recommended")}
            >
              <span className="entry-badge">推荐 · 第一次使用选这个</span>
              <strong>使用推荐模式开始</strong>
              <small>常用原料已帮你选好，只需核对价格</small>
            </button>
            <button
              type="button"
              className={`entry-mode manual-entry ${feedsMode === "manual" ? "selected" : ""}`}
              aria-pressed={feedsMode === "manual"}
              onClick={() => setFeedsMode("manual")}
            >
              <strong>使用自选模式</strong>
              <small>适合清楚自己要用哪些原料的用户</small>
            </button>
          </div>
        )}

        <ol className="steps" aria-label="使用步骤">
          <li className={step === 1 ? "active" : ""}><span>1</span> 羊只信息</li>
          <li className={step === 2 ? "active" : ""}><span>2</span> 原料选择</li>
          <li className={step === 3 ? "active" : ""}><span>3</span> 计算结果</li>
        </ol>
      </header>

      <main>
        {step === 1 && (
          <StepAnimal
            initial={animal}
            initialPasture={pasture}
            onNext={handleAnimalNext}
          />
        )}
        {step === 2 && (
          <StepFeeds
            initial={feeds}
            initialMode={feedsMode}
            animalClass={animal.class}
            onNext={handleFeedsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && request && (
          <StepResult
            request={request}
            pastureInfo={pasture}
            onBack={() => setStep(2)}
            onEditAnimal={() => setStep(1)}
          />
        )}
      </main>

      <footer className="app-footer">
        {!isApp && (
          <div className="footer-download-bar">
            <span>📲 支持离线手机端使用：</span>
            <a
              href="/奶山羊日粮配比助手_Android_v1.0.apk"
              download="奶山羊日粮配比助手_Android_v1.0.apk"
              className="footer-download-link"
            >
              点击下载奶山羊日粮配比助手安卓手机版 (v1.0.0 APK, 2.3MB)
            </a>
          </div>
        )}
        <div className="footer-disclaimer">
          默认成分数据为估算值；本工具仅覆盖宏量指标，不含微量元素与维生素保证。
        </div>
      </footer>
    </div>
  );
}

