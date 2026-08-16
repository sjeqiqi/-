import { useState } from "react";
import type { AnimalClass } from "../types";

export interface AnimalForm {
  class: AnimalClass;
  bodyWeightKg: string;
  milkKg: string;
  milkFatPercent: string;
}

const WEIGHT_MIN = 25;
const WEIGHT_MAX = 90;
const MILK_MIN = 0.2;
const MILK_MAX = 5.0;
const FAT_MIN = 2.0;
const FAT_MAX = 7.0;

interface Props {
  initial: AnimalForm;
  onNext: (form: AnimalForm) => void;
}

export function StepAnimal({ initial, onNext }: Props) {
  const [form, setForm] = useState<AnimalForm>(initial);
  const [errors, setErrors] = useState<string[]>([]);

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
          errs.push(`乳脂率请填写 ${FAT_MIN}–${FAT_MAX}% 之间的数值，也可以留空使用 4%`);
        }
      }
    }
    return errs;
  };

  const handleNext = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length === 0) onNext(form);
  };

  return (
    <section className="card animal-card" aria-label="羊只信息">
      <h2>第一步：填写羊只信息</h2>
      <p className="section-lead">按一只羊的实际情况填写，系统会据此计算每天需要的营养。</p>

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
              value={form.milkFatPercent}
              onChange={(e) => update({ milkFatPercent: e.target.value })}
            />
            <span className="hint">不填默认 4%；适用范围 {FAT_MIN}–{FAT_MAX}%</span>
          </div>
        </>
      )}

      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button className="primary" onClick={handleNext}>下一步：选择原料</button>
      </div>
    </section>
  );
}
