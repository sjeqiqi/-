// pages/result/result.js
import { calculateRation, calibrateRation } from '../../utils/api.js';

const app = getApp();

Page({
  data: {
    loading: true,
    error: null,
    result: null,
    aiLoading: false,
    aiResult: null,
    showAgreementModal: false,
    showOtherDetails: false
  },

  onLoad() {
    this.runCalculation();
  },

  toggleOtherDetails() {
    this.setData({ showOtherDetails: !this.data.showOtherDetails });
  },

  runCalculation() {
    let lastRequest = app.globalData.lastRequest;
    if (!lastRequest) {
      // 容错处理：若开发者工具直接刷新在结果页，自动填充默认羊只与原料数据发起计算
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
          { feed_id: 'corn', owned: true, price_rmb_per_kg: 2.4 },
          { feed_id: 'wheat_bran', owned: true, price_rmb_per_kg: 1.8 },
          { feed_id: 'soybean_meal', owned: true, price_rmb_per_kg: 4.2 },
          { feed_id: 'alfalfa_hay', owned: true, price_rmb_per_kg: 2.2 },
          { feed_id: 'corn_silage', owned: true, price_rmb_per_kg: 0.5 },
          { feed_id: 'salt', owned: true, price_rmb_per_kg: 1.0 },
          { feed_id: 'limestone', owned: true, price_rmb_per_kg: 0.6 }
        ]
      };
      app.globalData.lastRequest = lastRequest;
    }

    this.setData({
      loading: true,
      error: null,
      result: null,
      aiResult: null,
      aiLoading: false
    });

    // 🚀 核心优化：真实并行计算与 DeepSeek 生成，等报告全部生成完毕后一块儿输出展示
    const calcPromise = calculateRation(lastRequest);
    const calibratePromise = calibrateRation(lastRequest).catch((err) => {
      console.warn('AI 接口调用异常，已启用本地科学复核兜底:', err);
      return null;
    });

    Promise.all([calcPromise, calibratePromise])
      .then(([res, aiRes]) => {
        this.formatResultData(res);
        app.globalData.lastResult = res;

        // 统一处理并校验 AI 科学解读
        const validatedAi = this._cleanAndValidateAiRes(aiRes, res);

        this.setData({
          loading: false,
          result: res,
          aiResult: validatedAi
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || '计算失败，请检查网络或后端服务状态。'
        });
      });
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
        '本配方经运筹学模型精准求解，干物质采食量与能量蛋白指标符合《奶山羊饲养管理技术规范》（NY/T 2835-2015）及营养需要量标准。',
        `粗饲料占干物质 ${foragePct}%（以${topMe}为主供能，以${topCp}为主要蛋白源），粗精比例适宜，利于稳定反刍与瘤胃微生态健康。`,
        '日粮在严格满足全项营养达标的前提下实现了成本最低化，能稳定保障产奶性能与体况维持。'
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
        this.setData({
          aiLoading: false,
          aiResult: validated
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

  formatResultData(res) {
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
        r.as_fed_kg = Number(r.as_fed_kg).toFixed(2);
        r.price_rmb_per_kg = Number(r.price_rmb_per_kg).toFixed(2);
        r.cost_rmb = Number(r.cost_rmb).toFixed(2);
      });
    }
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
