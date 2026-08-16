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
    const lastRequest = app.globalData.lastRequest;
    if (!lastRequest) {
      this.setData({
        loading: false,
        error: '未获取到羊只及原料输入数据，请返回重新选择。'
      });
      return;
    }

    this.setData({ loading: true, error: null });

    calculateRation(lastRequest)
      .then((res) => {
        // 格式化数值显示
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
    calibrateRation(lastRequest)
      .then((aiRes) => {
        this.setData({
          calibrating: false,
          aiResult: aiRes
        });
        wx.showToast({ title: 'AI 解读已生成', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ calibrating: false });
        wx.showToast({ title: err.message || 'AI 解读暂不可用', icon: 'none' });
      });
  },

  handleBack() {
    wx.navigateBack();
  },

  handleEditAnimal() {
    wx.navigateBack({ delta: 2 });
  }
});
