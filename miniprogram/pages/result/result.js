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

  toggleOtherDetails() {
    this.setData({ showOtherDetails: !this.data.showOtherDetails });
  },

  onLoad() {
    this.runCalculation();
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

    this.setData({ loading: true, error: null, aiResult: null });

    calculateRation(lastRequest)
      .then((res) => {
        this.formatResultData(res);
        this.setData({
          loading: false,
          result: res
        });
        app.globalData.lastResult = res;

        // 🚀 核心优化：计算完成后，自动静默触发 AI 通俗解读生成（无需用户手动点击）
        if (res.status === 'feasible') {
          this.autoTriggerCalibrate(lastRequest);
        }
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || '计算失败，请检查网络或后端服务状态。'
        });
      });
  },

  autoTriggerCalibrate(lastRequest) {
    this.setData({ aiLoading: true });
    calibrateRation(lastRequest)
      .then((aiRes) => {
        this.setData({
          aiLoading: false,
          aiResult: aiRes
        });
      })
      .catch((err) => {
        console.warn('AI 自动解读生成遇到短暂延迟:', err);
        this.setData({ aiLoading: false });
      });
  },

  handleManualCalibrate() {
    const lastRequest = app.globalData.lastRequest;
    if (!lastRequest) return;

    this.setData({ aiLoading: true });
    wx.showToast({ title: '正在重新生成...', icon: 'loading', duration: 1500 });

    calibrateRation(lastRequest)
      .then((aiRes) => {
        this.setData({
          aiLoading: false,
          aiResult: aiRes
        });
        wx.showToast({ title: 'AI 解读已更新', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ aiLoading: false });
        wx.showToast({ title: '大模型繁忙，请稍后重试', icon: 'none' });
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
  }
});
