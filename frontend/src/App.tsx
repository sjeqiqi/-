import { useCallback, useState } from "react";
import type { AnimalInput, CalculateRequest, FeedInput } from "./types";
import { StepAnimal, type AnimalForm } from "./components/StepAnimal";
import { StepFeeds, type FeedForm } from "./components/StepFeeds";
import { StepResult } from "./components/StepResult";

export default function App() {
  const [step, setStep] = useState(1);
  const [animal, setAnimal] = useState<AnimalForm>({
    class: "lactating",
    bodyWeightKg: "50",
    milkKg: "2.5",
    milkFatPercent: "4",
  });
  const [feeds, setFeeds] = useState<FeedForm[] | null>(null);
  const [request, setRequest] = useState<CalculateRequest | null>(null);

  const handleAnimalNext = useCallback((form: AnimalForm) => {
    setAnimal(form);
    setStep(2);
  }, []);

  const handleFeedsNext = useCallback((forms: FeedForm[]) => {
    setFeeds(forms);
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
      const raw = (f.override ?? {}) as Record<string, string | null | undefined>;
      const override: Record<string, number> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (value !== null && value !== undefined && value !== "") {
          override[key] = Number(value);
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
    <div className="app">
      <header className="app-header">
        <h1>奶山羊常用原料日粮配比助手</h1>
        <p className="subtitle">第一版 · 最低成本宏量营养参考方案 · 不替代兽医诊断</p>
        <ol className="steps" aria-label="步骤">
          <li className={step === 1 ? "active" : ""}>1 动物信息</li>
          <li className={step === 2 ? "active" : ""}>2 原料与价格</li>
          <li className={step === 3 ? "active" : ""}>3 配方结果</li>
        </ol>
      </header>

      <main>
        {step === 1 && (
          <StepAnimal
            initial={animal}
            onNext={handleAnimalNext}
          />
        )}
        {step === 2 && (
          <StepFeeds
            initial={feeds}
            animalClass={animal.class}
            onNext={handleFeedsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && request && (
          <StepResult
            request={request}
            onBack={() => setStep(2)}
            onEditAnimal={() => setStep(1)}
          />
        )}
      </main>

      <footer className="app-footer">
        默认成分数据为估算值；本工具仅覆盖宏量指标，不含微量元素与维生素保证。
      </footer>
    </div>
  );
}
