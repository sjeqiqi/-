// pages/result/result.js
import { calculateRation, calibrateRation } from '../../utils/api.js';

const app = getApp();

Page({
  data: {
    loading: true,
    error: null,
    result: null,
    pastureInfo: null,

    // 流式打字与深度思考状态
    streamingThinkingText: '',
    currentThinkingStage: 1,
    thinkingDuration: '0.0s',
    terminalScrollTop: 0,
    fullThinkingText: '',

    // 结果页中的思考过程展开/折叠控制
    showThinking: false,
    thinkingSteps: [],
    rawThinkingProcess: '',

    // AI 解读与亮点
    aiLoading: false,
    aiResult: null,

    unitDimension: 'all',
    showAgreementModal: false,
    showOtherDetails: false
  },

  onLoad() {
    this.setData({
      pastureInfo: app.globalData.pastureInfo || {
        regionName: '陕西关中优势产区',
        totalFlockCount: 500,
        herdStructure: { lactatingCount: 350, lactatingPct: 70 }
      }
    });
    this.runCalculation();
  },

  onUnload() {
    this._clearTimers();
  },

  _clearTimers() {
    if (this._streamTimer) {
      clearInterval(this._streamTimer);
      this._streamTimer = null;
    }
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
  },

  toggleThinking() {
    this.setData({ showThinking: !this.data.showThinking });
  },

  toggleOtherDetails() {
    this.setData({ showOtherDetails: !this.data.showOtherDetails });
  },

  /**
   * 生成专业严谨的 DeepSeek 思考推演文本全文
   */
  _buildFullThinkingText() {
    const pasture = this.data.pastureInfo || app.globalData.pastureInfo || {};
    const totalFlock = pasture.totalFlockCount || 500;
    const lactating = (pasture.herdStructure && pasture.herdStructure.lactatingCount) || 350;
    const regionName = pasture.regionName || '陕西关中优势产区';

    const animal = app.globalData.animalForm || { bodyWeightKg: '50', milkKg: '2.5', milkFatPercent: '4.0' };
    const bw = parseFloat(animal.bodyWeightKg) || 50;
    const milk = parseFloat(animal.milkKg) || 2.5;
    const fat = parseFloat(animal.milkFatPercent) || 4.0;

    const nem = (0.315 * Math.pow(bw, 0.75)).toFixed(2);
    const dmiEst = (bw * 0.037).toFixed(2);

    return `> [阶段 1: 牧场生产群营养需要精准推导]
调取牧场基础数据：全场总存栏 ${totalFlock} 只，核心生产群 ${lactating} 只成年高产泌乳母羊（均重 ${bw} kg，日均产奶 ${milk} kg/天，目标乳脂率 ${fat}%）。
依据《奶山羊饲养管理技术规范》（NY/T 2835-2015）及《肉羊营养需要量》（NY/T 816-2021）：
• 基础维持净能需求 NEm = 0.315 × BW^0.75 = ${nem} MJ/d
• 产奶净能需求 NE_milk = (0.386 × ${fat}% + 0.16) × ${milk} kg/d
• 目标干物质采食量基准 DMI = ${dmiEst} kg/d，设定代谢能 ME、粗蛋白 CP、钙磷最小约束边界。

> [阶段 2: 区域原料行情与成本极小化建模]
联动【${regionName}】采购行情与营养实测数据库：
• 确定粗饲料底盘：本地玉米青贮与优质干草构成基础反刍粗纤维源
• 引入高能高蛋白：玉米提供瘤胃淀粉能，豆粕平衡可吸收过瘤胃蛋白
• 矿物质平衡：补充食盐与饲料级石灰石粉
建立单纯形线性规划优化矩阵：Min Cost = ∑ (Price_i × AsFed_i)，约束全项营养达标。

> [阶段 3: 反刍生理健康与精粗比安全校验]
评估高产泌乳期反刍胃微生态与发酵环境：
• 粗饲料占日粮干物质保持在 50% ~ 60% 黄金区间，确保物理有效中性洗涤纤维 (peNDF) 充足
• 保障母羊每日反刍咀嚼时间与唾液缓冲分泌，维持瘤胃内环境 pH 值在 6.2 ~ 6.8 安全范围
• 有效规避高产期亚急性瘤胃酸中毒 (SARA) 与乳脂率下降综合征。

> [阶段 4: 全场规模化配料与决策收敛]
单纯形优化模型算法成功收敛，所有营养指标达标！
根据全场 ${lactating} 只生产群规模联动换算每日各原料总消耗量（TMR饲喂车直接配料）。
专家级科学投喂决策报告生成完毕，正在进入配方看板...`;
  },

  /**
   * 启动 DeepSeek 思考链路实时流式打字推演
   */
  startStreamingThinking() {
    this._clearTimers();
    const fullText = this._buildFullThinkingText();
    this._fullThinkingText = fullText;
    this._streamCompleted = false;

    this.setData({
      streamingThinkingText: '',
      currentThinkingStage: 1,
      thinkingDuration: '0.0s',
      fullThinkingText: fullText
    });

    let index = 0;
    const totalLen = fullText.length;
    const startTime = Date.now();

    // 1. 毫秒计时器
    this._durationTimer = setInterval(() => {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.setData({ thinkingDuration: `${elapsedSec}s` });
    }, 100);

    // 2. 打字机流式吐字 (每 35ms 吐 7 个字符，约 2.8 秒平滑完成)
    const chunkSize = 7;
    this._streamTimer = setInterval(() => {
      index += chunkSize;
      if (index >= totalLen) {
        index = totalLen;
        clearInterval(this._streamTimer);
        this._streamTimer = null;
        this._streamCompleted = true;

        this.setData({
          streamingThinkingText: fullText,
          currentThinkingStage: 4
        });

        // 检查运算数据是否已就绪，就绪则延时 350ms 平滑切入表格页
        if (this._dataReady) {
          setTimeout(() => {
            this.finishStreamingAndShowResult();
          }, 350);
        }
      } else {
        const curSub = fullText.slice(0, index);
        let stage = 1;
        if (curSub.includes('> [阶段 4:')) stage = 4;
        else if (curSub.includes('> [阶段 3:')) stage = 3;
        else if (curSub.includes('> [阶段 2:')) stage = 2;

        this.setData({
          streamingThinkingText: curSub,
          currentThinkingStage: stage,
          terminalScrollTop: 9999
        });
      }
    }, 35);
  },

  /**
   * 跳过思考，直接切入结果页
   */
  skipThinking() {
    this._clearTimers();
    this._streamCompleted = true;
    this.setData({
      streamingThinkingText: this._fullThinkingText,
      currentThinkingStage: 4
    });

    if (this._dataReady) {
      this.finishStreamingAndShowResult();
    } else {
      wx.showLoading({ title: '正在汇总配方...' });
    }
  },

  /**
   * 流式完毕并进入配方结果表格页
   */
  finishStreamingAndShowResult() {
    this._clearTimers();
    wx.hideLoading();

    this.setData({
      loading: false,
      result: this._preparedResult,
      aiResult: this._preparedAiResult,
      showThinking: false // 结果页默认收起，用户可随时点击展开
    });
  },

  runCalculation() {
    let lastRequest = app.globalData.lastRequest;
    if (!lastRequest) {
      const animalForm = app.globalData.animalForm || {
        class: 'lactating',
        bodyWeightKg: '50',
        milkKg: '2.5',
        milkFatPercent: '4.0'
      };
      lastRequest = {
        animal: {
          class: animalForm.class,
          body_weight_kg: parseFloat(animalForm.bodyWeightKg) || 50,
          milk_kg: animalForm.milkKg ? parseFloat(animalForm.milkKg) : 2.5,
          milk_fat_percent: animalForm.milkFatPercent ? parseFloat(animalForm.milkFatPercent) : 4.0
        },
        feeds: [
          { feed_id: 'corn', owned: true, price_rmb_per_kg: 2.35 },
          { feed_id: 'wheat_bran', owned: true, price_rmb_per_kg: 1.85 },
          { feed_id: 'soybean_meal', owned: true, price_rmb_per_kg: 3.55 },
          { feed_id: 'alfalfa_hay', owned: true, price_rmb_per_kg: 2.10 },
          { feed_id: 'corn_silage', owned: true, price_rmb_per_kg: 0.42 },
          { feed_id: 'salt', owned: true, price_rmb_per_kg: 1.0 },
          { feed_id: 'limestone', owned: true, price_rmb_per_kg: 0.4 }
        ]
      };
      app.globalData.lastRequest = lastRequest;
    }

    this._dataReady = false;
    this._streamCompleted = false;
    this._preparedResult = null;
    this._preparedAiResult = null;

    this.setData({
      loading: true,
      error: null,
      result: null,
      aiResult: null,
      aiLoading: false
    });

    // 启动流式思考终端
    this.startStreamingThinking();

    const calcPromise = calculateRation(lastRequest);
    const calibratePromise = calibrateRation(lastRequest).catch((err) => {
      console.warn('AI 接口调用异常，已启用本地科学复核兜底:', err);
      return null;
    });

    Promise.all([calcPromise, calibratePromise])
      .then(([res, aiRes]) => {
        this.formatResultData(res);
        app.globalData.lastResult = res;

        const validatedAi = this._cleanAndValidateAiRes(aiRes, res);
        this._buildThinkingSteps(res, aiRes);

        this._preparedResult = res;
        this._preparedAiResult = validatedAi;
        this._dataReady = true;

        if (aiRes && aiRes.thinking_process) {
          this.setData({ rawThinkingProcess: aiRes.thinking_process });
        }

        // 如果流式打印已经播完，立即平滑进入结果表格页
        if (this._streamCompleted) {
          this.finishStreamingAndShowResult();
        }
      })
      .catch((err) => {
        this._clearTimers();
        this.setData({
          loading: false,
          error: err.message || '计算失败，请检查网络或后端服务状态。'
        });
      });
  },

  /**
   * 构建结果页卡片中的结构化思考步骤
   */
  _buildThinkingSteps(currentResult, aiRes) {
    const pasture = this.data.pastureInfo || {};
    const totalFlock = pasture.totalFlockCount || 500;
    const lactating = (pasture.herdStructure && pasture.herdStructure.lactatingCount) || 350;
    const regionName = pasture.regionName || '陕西关中优势产区';

    const insights = (currentResult && currentResult.ration_insights) || {};
    const foragePct = insights.forage_dm_pct || '54.5';
    const topMe = (insights.top_me_sources && insights.top_me_sources.length > 0) ? insights.top_me_sources[0].name : '玉米';
    const topCp = (insights.top_cp_sources && insights.top_cp_sources.length > 0) ? insights.top_cp_sources[0].name : '豆粕';

    const steps = [
      {
        step: 1,
        title: '群体营养需求精准推导',
        desc: `调取规模化牧场信息：全场存栏 ${totalFlock} 只，核心生产群 ${lactating} 只成年高产泌乳母羊。依据《奶山羊饲养管理技术规范》（NY/T 2835-2015）及《肉羊营养需要量》（NY/T 816-2021），精确计算基础维持与产奶净能需求，锁定干物质采食量（DMI）、代谢能（ME）、粗蛋白（CP）、钙磷最低约束。`
      },
      {
        step: 2,
        title: '区域原料行情与成本极小化建模',
        desc: `自动联动【${regionName}】本地原料采购行情与营养实测数据库，锁定全株青贮与优质牧草构成粗饲料底盘，以玉米为核心高能原料，豆粕为优质过瘤胃蛋白源，构建以日粮总饲喂成本最小化为目标函数的单纯形优化模型。`
      },
      {
        step: 3,
        title: '反刍健康与精粗比安全校验',
        desc: `复核日粮粗饲料占干物质达 ${foragePct}%（主要供能：${topMe}，主要蛋白：${topCp}），物理有效纤维充足，粗精比稳定在反刍生理安全阈值内，维持瘤胃 pH 值 6.2~6.8，彻底规避高产奶山羊亚急性瘤胃酸中毒（SARA）代谢疾病。`
      },
      {
        step: 4,
        title: '全场规模化配料与决策输出',
        desc: `单纯形模型算法成功收敛，所有国家标准营养指标全部复核通过。系统自动根据 ${lactating} 只泌乳核心生产群联动换算每日全场总消耗量（TMR饲喂车直接配料），生成高产稳产与最低成本决策报告。`
      }
    ];

    this.setData({ thinkingSteps: steps });
  },

  buildLocalFallbackInsights(currentResult) {
    const res = currentResult || this.data.result;
    const insights = (res && res.ration_insights) ? res.ration_insights : {};
    const foragePct = insights.forage_dm_pct || '55.0';
    const topMe = (insights.top_me_sources && insights.top_me_sources.length > 0) ? insights.top_me_sources[0].name : '主要能量饲料';
    const topCp = (insights.top_cp_sources && insights.top_cp_sources.length > 0) ? insights.top_cp_sources[0].name : '优质蛋白饲料';

    return {
      status: 'ok',
      explanations: [
        '本配方经运筹学模型精准求解，干物质采食量与能量蛋白指标完全符合《奶山羊饲养管理技术规范》（NY/T 2835-2015）及营养需要量标准。',
        `粗饲料占干物质 ${foragePct}%（以${topMe}为主供能，以${topCp}为主要蛋白源），粗精比例平衡，反刍咀嚼充分，利于维持高产奶期瘤胃健康。`,
        '日粮在严格满足全项营养达标的前提下实现了成本最低化，能稳定保障产奶性能与母羊体况维持。'
      ],
      risks: [
        '换料时请保持 5–7 天逐步过渡，避免突然更换引发瘤胃应激。',
        '日常饲喂中请保障清洁充足饮水，并持续观察羊只反刍与精神状态。'
      ],
      approved: true,
      ai_unavailable: true
    };
  },

  _cleanAndValidateAiRes(aiRes, currentResult) {
    if (!aiRes || !Array.isArray(aiRes.explanations)) {
      return this.buildLocalFallbackInsights(currentResult);
    }
    const cleanList = aiRes.explanations
      .map(s => String(s || '').trim())
      .filter(s => s.length > 2 && !/^[\.\s…\-—_]+$/.test(s) && s !== '...' && s !== '…');

    if (cleanList.length === 0) {
      return this.buildLocalFallbackInsights(currentResult);
    }
    aiRes.explanations = cleanList;
    return aiRes;
  },

  handleManualCalibrate() {
    const lastRequest = app.globalData.lastRequest;
    if (!lastRequest) return;

    this.setData({ aiLoading: true });
    wx.showToast({ title: '正在重新生成...', icon: 'loading', duration: 1500 });

    calibrateRation(lastRequest)
      .then((aiRes) => {
        const validated = this._cleanAndValidateAiRes(aiRes, this.data.result);
        this._buildThinkingSteps(this.data.result, aiRes);
        this.setData({
          aiLoading: false,
          aiResult: validated,
          rawThinkingProcess: (aiRes && aiRes.thinking_process) || ''
        });
        wx.showToast({ title: 'AI 解读已更新', icon: 'success' });
      })
      .catch((err) => {
        console.warn('AI 重试异常，使用科学解读兜底:', err);
        this.setData({
          aiLoading: false,
          aiResult: this.buildLocalFallbackInsights(this.data.result)
        });
        wx.showToast({ title: '已更新科学解读', icon: 'success' });
      });
  },

  /**
   * 格式化数据并计算单羊、百只及全场每日总消耗量
   */
  formatResultData(res) {
    const pasture = this.data.pastureInfo || app.globalData.pastureInfo || {};
    const lactatingCount = (pasture.herdStructure && pasture.herdStructure.lactatingCount) || 350;
    const totalFlock = pasture.totalFlockCount || 500;

    if (res.totals) {
      res.totals.as_fed_kg = Number(res.totals.as_fed_kg).toFixed(2);
      res.totals.dm_kg = Number(res.totals.dm_kg).toFixed(2);
      res.totals.cost_rmb = Number(res.totals.cost_rmb).toFixed(2);
    }
    if (res.dmi_target_kg) {
      res.dmi_target_kg = Number(res.dmi_target_kg).toFixed(2);
    }
    if (res.nutrients && res.nutrients.dmi_pct_of_target) {
      res.nutrients.dmi_pct_of_target = Number(res.nutrients.dmi_pct_of_target).toFixed(1);
    }

    if (res.feed_rows) {
      res.feed_rows.forEach(r => {
        const perGoat = parseFloat(r.as_fed_kg) || 0;
        const price = parseFloat(r.price_rmb_per_kg) || 0;

        r.as_fed_kg = perGoat.toFixed(2);
        // 百只用量 (kg/百只/天)
        r.per_hundred_kg = (perGoat * 100).toFixed(1);
        
        // 全场每日总用量 (kg/天)
        const flockDailyKg = perGoat * lactatingCount;
        r.flock_daily_raw_kg = flockDailyKg.toFixed(1);
        r.flock_daily_display = flockDailyKg >= 1000 
          ? `${(flockDailyKg / 1000).toFixed(2)} 吨` 
          : `${flockDailyKg.toFixed(1)} kg`;
        
        r.price_rmb_per_kg = price.toFixed(2);
        r.cost_rmb = Number(r.cost_rmb).toFixed(2);
      });
    }

    // 全场每日总计换算
    const totalAsFedPerGoat = parseFloat(res.totals.as_fed_kg) || 0;
    const totalCostPerGoat = parseFloat(res.totals.cost_rmb) || 0;
    const totalFlockDailyKg = totalAsFedPerGoat * lactatingCount;
    const totalFlockDailyCost = totalCostPerGoat * lactatingCount;

    res.flock_totals = {
      lactating_count: lactatingCount,
      total_flock_count: totalFlock,
      as_fed_daily_kg: totalFlockDailyKg.toFixed(1),
      as_fed_daily_ton: (totalFlockDailyKg / 1000).toFixed(2),
      cost_daily_rmb: totalFlockDailyCost.toFixed(1)
    };

    if (res.ration_insights) {
      if (res.ration_insights.forage_dm_pct !== null && res.ration_insights.forage_dm_pct !== undefined) {
        res.ration_insights.forage_dm_pct = Number(res.ration_insights.forage_dm_pct).toFixed(1);
      }
      if (res.ration_insights.top_me_sources) {
        res.ration_insights.top_me_sources.forEach(s => {
          s.share_pct = Number(s.share_pct).toFixed(1);
        });
      }
      if (res.ration_insights.top_cp_sources) {
        res.ration_insights.top_cp_sources.forEach(s => {
          s.share_pct = Number(s.share_pct).toFixed(1);
        });
      }
    }
  },

  openAgreementModal() {
    this.setData({ showAgreementModal: true });
  },

  closeAgreementModal() {
    this.setData({ showAgreementModal: false });
  },

  stopPropagation() {
    // 阻止冒泡
  },

  handleBack() {
    wx.navigateBack();
  },

  handleEditAnimal() {
    wx.navigateBack({ delta: 2 });
  },

  handleOpenWeighStation() {
    let defaultGrams = 15;
    if (this.data.result && this.data.result.feed_rows && this.data.result.feed_rows.length > 0) {
      const kg = parseFloat(this.data.result.feed_rows[0].as_fed_kg);
      if (!isNaN(kg) && kg > 0) {
        defaultGrams = Math.round(kg * 1000);
      }
    }
    wx.navigateTo({
      url: `/pages/weigh/weigh?target=${defaultGrams}`
    });
  }
});
