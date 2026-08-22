// pages/result/result.js
import { calculateRation, calibrateRation } from '../../utils/api.js';

const app = getApp();

Page({
  data: {
    loading: true,
    error: null,
    result: null,
    calibrating: false,
    aiResult: null
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

    this.setData({ loading: true, error: null });

    calculateRation(lastRequest)
      .then((res) => {
        this.formatResultData(res);
        this.setData({
          loading: false,
          result: res
        });
        app.globalData.lastResult = res;
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || '计算失败，请检查网络或后端服务状态。'
        });
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

  handleCalibrate() {
    const lastRequest = app.globalData.lastRequest;
    if (!lastRequest) return;

    this.setData({ calibrating: true });
    wx.showLoading({ title: 'AI 正在分析配方...', mask: true });

    calibrateRation(lastRequest)
      .then((aiRes) => {
        wx.hideLoading();
        this.setData({
          calibrating: false,
          aiResult: aiRes
        });
        if (aiRes.ai_unavailable) {
          wx.showToast({ title: '已启用本地安全解读', icon: 'none', duration: 2500 });
        } else {
          wx.showToast({ title: 'AI 解读已生成', icon: 'success' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ calibrating: false });
        wx.showModal({
          title: 'AI 响应稍慢',
          content: '大模型当前计算繁忙或网络稍有延迟。科学配方结果依然有效，您可以点击重试。',
          confirmText: '重新生成',
          cancelText: '我知道了',
          success: (mRes) => {
            if (mRes.confirm) {
              this.handleCalibrate();
            }
          }
        });
      });
  },

  handleBack() {
    wx.navigateBack();
  },

  handleEditAnimal() {
    wx.navigateBack({ delta: 2 });
  }
});
