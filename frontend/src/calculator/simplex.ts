// 确定性两阶段单纯形法线性规划求解器（Two-Phase Simplex Algorithm）
// 纯 TypeScript 原生实现，零外部库依赖，执行耗时 < 1ms，保证完全离线运行

export interface LPSolution {
  feasible: boolean;
  cost: number;
  x: number[];
  message?: string;
  iterations?: number;
}

export function solveLP(
  c: number[],
  A_ub: number[][],
  b_ub: number[],
  A_eq: number[][],
  b_eq: number[]
): LPSolution {
  const nVars = c.length;
  const mUb = A_ub.length;
  const mEq = A_eq.length;

  const A_ub_mod: number[][] = [];
  const b_ub_mod: number[] = [];
  const A_ge_mod: number[][] = [];
  const b_ge_mod: number[] = [];

  for (let i = 0; i < mUb; i++) {
    if (b_ub[i] >= 0) {
      A_ub_mod.push(A_ub[i]);
      b_ub_mod.push(b_ub[i]);
    } else {
      A_ge_mod.push(A_ub[i].map((v) => -v));
      b_ge_mod.push(-b_ub[i]);
    }
  }

  const A_eq_mod: number[][] = [];
  const b_eq_mod: number[] = [];
  for (let i = 0; i < mEq; i++) {
    if (b_eq[i] >= 0) {
      A_eq_mod.push(A_eq[i]);
      b_eq_mod.push(b_eq[i]);
    } else {
      A_eq_mod.push(A_eq[i].map((v) => -v));
      b_eq_mod.push(-b_eq[i]);
    }
  }

  const nLe = A_ub_mod.length;
  const nGe = A_ge_mod.length;
  const nEqTotal = A_eq_mod.length;
  const totalRows = nLe + nGe + nEqTotal;

  const nSlack = nLe;
  const nSurplus = nGe;
  const nArt = nGe + nEqTotal;
  const totalCols = nVars + nSlack + nSurplus + nArt;

  const tableau: Float64Array[] = [];
  for (let i = 0; i <= totalRows; i++) {
    tableau.push(new Float64Array(totalCols + 1));
  }

  const basis = new Int32Array(totalRows);

  let r = 0;
  let sIdx = nVars;
  let surIdx = nVars + nSlack;
  let artIdx = nVars + nSlack + nSurplus;

  // 1. <= 约束引入松弛变量 (+1)
  for (let i = 0; i < nLe; i++, r++) {
    for (let j = 0; j < nVars; j++) tableau[r][j] = A_ub_mod[i][j];
    tableau[r][sIdx++] = 1.0;
    tableau[r][totalCols] = b_ub_mod[i];
    basis[r] = sIdx - 1;
  }

  // 2. >= 约束引入剩余变量 (-1) 与人工变量 (+1)
  for (let i = 0; i < nGe; i++, r++) {
    for (let j = 0; j < nVars; j++) tableau[r][j] = A_ge_mod[i][j];
    tableau[r][surIdx++] = -1.0;
    tableau[r][artIdx++] = 1.0;
    tableau[r][totalCols] = b_ge_mod[i];
    basis[r] = artIdx - 1;
  }

  // 3. == 约束引入人工变量 (+1)
  for (let i = 0; i < nEqTotal; i++, r++) {
    for (let j = 0; j < nVars; j++) tableau[r][j] = A_eq_mod[i][j];
    tableau[r][artIdx++] = 1.0;
    tableau[r][totalCols] = b_eq_mod[i];
    basis[r] = artIdx - 1;
  }

  function pivot(pRow: number, pCol: number) {
    const pivotVal = tableau[pRow][pCol];
    for (let j = 0; j <= totalCols; j++) {
      tableau[pRow][j] /= pivotVal;
    }
    for (let i = 0; i <= totalRows; i++) {
      if (i !== pRow) {
        const factor = tableau[i][pCol];
        if (Math.abs(factor) > 1e-12) {
          for (let j = 0; j <= totalCols; j++) {
            tableau[i][j] -= factor * tableau[pRow][j];
          }
        }
      }
    }
    basis[pRow] = pCol;
  }

  // 第一阶段：最小化人工变量之和 W = sum(art_i)
  if (nArt > 0) {
    const artStart = nVars + nSlack + nSurplus;
    for (let j = 0; j <= totalCols; j++) tableau[totalRows][j] = 0;
    for (let i = 0; i < totalRows; i++) {
      if (basis[i] >= artStart) {
        for (let j = 0; j <= totalCols; j++) {
          tableau[totalRows][j] -= tableau[i][j];
        }
      }
    }

    let p1Iter = 0;
    while (p1Iter++ < 1500) {
      let enterCol = -1;
      let minVal = -1e-9;
      for (let j = 0; j < totalCols; j++) {
        if (tableau[totalRows][j] < minVal) {
          minVal = tableau[totalRows][j];
          enterCol = j;
        }
      }
      if (enterCol === -1) break;

      let leaveRow = -1;
      let minRatio = Infinity;
      for (let i = 0; i < totalRows; i++) {
        const a_ij = tableau[i][enterCol];
        if (a_ij > 1e-9) {
          const ratio = tableau[i][totalCols] / a_ij;
          if (ratio < minRatio) {
            minRatio = ratio;
            leaveRow = i;
          }
        }
      }
      if (leaveRow === -1) return { feasible: false, cost: 0, x: [], message: "第一阶段无界" };
      pivot(leaveRow, enterCol);
    }

    if (Math.abs(tableau[totalRows][totalCols]) > 1e-5) {
      return { feasible: false, cost: 0, x: [], message: "当前约束不可行（人工变量未归零）" };
    }

    // 将基底中残留的人工变量（退化解）旋转出基
    for (let i = 0; i < totalRows; i++) {
      if (basis[i] >= artStart) {
        let pCol = -1;
        for (let j = 0; j < artStart; j++) {
          if (Math.abs(tableau[i][j]) > 1e-9) {
            pCol = j;
            break;
          }
        }
        if (pCol !== -1) {
          pivot(i, pCol);
        }
      }
    }
  }

  // 第二阶段：在可行基底上优化目标函数 min c^T x
  for (let j = 0; j <= totalCols; j++) tableau[totalRows][j] = 0;
  for (let j = 0; j < nVars; j++) tableau[totalRows][j] = c[j];

  for (let i = 0; i < totalRows; i++) {
    const bVar = basis[i];
    if (bVar < nVars) {
      const factor = c[bVar];
      if (Math.abs(factor) > 1e-12) {
        for (let j = 0; j <= totalCols; j++) {
          tableau[totalRows][j] -= factor * tableau[i][j];
        }
      }
    }
  }

  let iter = 0;
  const artStart = nVars + nSlack + nSurplus;
  while (iter++ < 2000) {
    let enterCol = -1;
    let minVal = -1e-9;
    for (let j = 0; j < artStart; j++) {
      if (tableau[totalRows][j] < minVal) {
        minVal = tableau[totalRows][j];
        enterCol = j;
      }
    }
    if (enterCol === -1) break; // 最优解达成

    let leaveRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < totalRows; i++) {
      const a_ij = tableau[i][enterCol];
      if (a_ij > 1e-9) {
        const ratio = tableau[i][totalCols] / a_ij;
        if (ratio < minRatio) {
          minRatio = ratio;
          leaveRow = i;
        }
      }
    }
    if (leaveRow === -1) return { feasible: false, cost: 0, x: [], message: "第二阶段无界" };
    pivot(leaveRow, enterCol);
  }

  const x = new Float64Array(nVars);
  for (let i = 0; i < totalRows; i++) {
    if (basis[i] < nVars) {
      x[basis[i]] = Math.max(0, tableau[i][totalCols]);
    }
  }

  return {
    feasible: true,
    cost: -tableau[totalRows][totalCols],
    x: Array.from(x),
    iterations: iter,
  };
}
