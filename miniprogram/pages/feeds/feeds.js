// pages/feeds/feeds.js
import { fetchFeeds } from '../../utils/api.js';

const app = getApp();

const GROUP_META = [
  { category: 'concentrate', title: '精料', description: '主要补充能量和蛋白' },
  { category: 'forage', title: '粗饲料', description: '构成日粮基础，帮助维持瘤胃健康与反刍' },
  { category: 'mineral', title: '矿物质', description: '补充食盐、钙磷等微量元素' }
];

const DEFAULT_CATALOG = [
  { feed_id: "corn", name: "玉米", category: "concentrate", dm_pct: 86.0, me_mj_per_kg_dm: 14.0, cp_pct_dm: 8.0, ndf_pct_dm: 9.5, ca_pct_dm: 0.02, p_pct_dm: 0.28, default_price_rmb_per_kg: 2.4, max_usage_pct_dm: 35.0, is_estimate: true },
  { feed_id: "wheat_bran", name: "小麦麸", category: "concentrate", dm_pct: 88.0, me_mj_per_kg_dm: 10.0, cp_pct_dm: 15.0, ndf_pct_dm: 41.0, ca_pct_dm: 0.1, p_pct_dm: 0.92, default_price_rmb_per_kg: 2.2, max_usage_pct_dm: 20.0, is_estimate: true },
  { feed_id: "soybean_meal", name: "豆粕", category: "concentrate", dm_pct: 89.0, me_mj_per_kg_dm: 14.0, cp_pct_dm: 46.0, ndf_pct_dm: 13.5, ca_pct_dm: 0.32, p_pct_dm: 0.62, default_price_rmb_per_kg: 3.6, max_usage_pct_dm: 20.0, is_estimate: true },
  { feed_id: "rapeseed_meal", name: "菜籽粕", category: "concentrate", dm_pct: 89.0, me_mj_per_kg_dm: 11.0, cp_pct_dm: 36.0, ndf_pct_dm: 30.0, ca_pct_dm: 0.65, p_pct_dm: 1.02, default_price_rmb_per_kg: 2.8, max_usage_pct_dm: 10.0, is_estimate: true },
  { feed_id: "peanut_meal", name: "花生粕", category: "concentrate", dm_pct: 90.0, me_mj_per_kg_dm: 13.0, cp_pct_dm: 47.0, ndf_pct_dm: 15.0, ca_pct_dm: 0.22, p_pct_dm: 0.55, default_price_rmb_per_kg: 3.0, max_usage_pct_dm: 10.0, is_estimate: true },
  { feed_id: "alfalfa_hay", name: "苜蓿干草", category: "forage", dm_pct: 90.0, me_mj_per_kg_dm: 9.5, cp_pct_dm: 17.0, ndf_pct_dm: 42.0, ca_pct_dm: 1.3, p_pct_dm: 0.28, default_price_rmb_per_kg: 2.0, max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "corn_stover", name: "玉米秸秆", category: "forage", dm_pct: 90.0, me_mj_per_kg_dm: 6.5, cp_pct_dm: 5.5, ndf_pct_dm: 68.0, ca_pct_dm: 0.45, p_pct_dm: 0.08, default_price_rmb_per_kg: 0.5, max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "peanut_vine", name: "花生秧", category: "forage", dm_pct: 90.0, me_mj_per_kg_dm: 8.3, cp_pct_dm: 10.0, ndf_pct_dm: 52.0, ca_pct_dm: 1.4, p_pct_dm: 0.2, default_price_rmb_per_kg: 0.9, max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "sheep_grass", name: "羊草", category: "forage", dm_pct: 91.0, me_mj_per_kg_dm: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca_pct_dm: 0.35, p_pct_dm: 0.18, default_price_rmb_per_kg: 1.5, max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "oat_hay", name: "燕麦干草", category: "forage", dm_pct: 90.0, me_mj_per_kg_dm: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca_pct_dm: 0.3, p_pct_dm: 0.25, default_price_rmb_per_kg: 2.0, max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "corn_silage", name: "全株玉米青贮", category: "forage", dm_pct: 30.0, me_mj_per_kg_dm: 10.6, cp_pct_dm: 7.0, ndf_pct_dm: 48.0, ca_pct_dm: 0.25, p_pct_dm: 0.1, default_price_rmb_per_kg: 0.45, max_usage_pct_dm: 60.0, is_estimate: true },
  { feed_id: "salt", name: "食盐", category: "mineral", dm_pct: 100.0, me_mj_per_kg_dm: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca_pct_dm: 0.0, p_pct_dm: 0.0, default_price_rmb_per_kg: 1.0, max_usage_pct_dm: 100.0, is_estimate: false },
  { feed_id: "limestone", name: "饲料级石灰石粉", category: "mineral", dm_pct: 100.0, me_mj_per_kg_dm: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca_pct_dm: 38.0, p_pct_dm: 0.0, default_price_rmb_per_kg: 0.4, max_usage_pct_dm: 2.0, is_estimate: true }
];

Page({
  data: {
    loading: true,
    mode: 'recommended', // 'recommended' | 'manual'
    catalog: [],
    feedsList: [],
    feedGroups: [],
    selectedCount: 0,
    warnings: [],
    expandedId: null
  },

  onLoad() {
    this.loadFeedCatalog();
  },

  loadFeedCatalog() {
    this.setData({ loading: true });
    fetchFeeds()
      .then((res) => {
        const rawFeeds = (res && res.feeds && res.feeds.length > 0) ? res.feeds : DEFAULT_CATALOG;
        this.renderCatalog(rawFeeds);
      })
      .catch((err) => {
        console.warn('拉取云端原料库受限，自动启用本地标准13种原料库:', err);
        this.renderCatalog(DEFAULT_CATALOG);
      });
  },

  renderCatalog(rawFeeds) {
    const initialMode = app.globalData.feedsMode || 'recommended';
    const feedsList = rawFeeds.map((item) => ({
      ...item,
      owned: initialMode === 'recommended',
      price: String(item.default_price_rmb_per_kg || '0'),
      override: {}
    }));

    this.setData({
      loading: false,
      catalog: rawFeeds,
      feedsList: feedsList,
      mode: initialMode
    }, () => {
      this.rebuildGroups();
    });
  },

  switchMode(e) {
    const newMode = e.currentTarget.dataset.mode;
    if (newMode === this.data.mode) return;
    
    app.globalData.feedsMode = newMode;
    this.setData({ mode: newMode });
  },

  toggleOwned(e) {
    const feedId = e.currentTarget.dataset.id;
    const feedsList = this.data.feedsList.map(item => {
      if (item.feed_id === feedId) {
        return { ...item, owned: !item.owned };
      }
      return item;
    });

    this.setData({ feedsList }, () => {
      this.rebuildGroups();
    });
  },

  onPriceInput(e) {
    const feedId = e.currentTarget.dataset.id;
    const val = e.detail.value;
    const feedsList = this.data.feedsList.map(item => {
      if (item.feed_id === feedId) {
        return { ...item, price: val };
      }
      return item;
    });
    this.setData({ feedsList });
  },

  toggleExpand(e) {
    const feedId = e.currentTarget.dataset.id;
    this.setData({
      expandedId: this.data.expandedId === feedId ? null : feedId
    });
  },

  onOverrideInput(e) {
    const feedId = e.currentTarget.dataset.id;
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;

    const feedsList = this.data.feedsList.map(item => {
      if (item.feed_id === feedId) {
        const override = { ...item.override };
        if (val.trim() === '') {
          delete override[field];
        } else {
          override[field] = parseFloat(val);
        }
        return { ...item, override };
      }
      return item;
    });
    this.setData({ feedsList });
  },

  rebuildGroups() {
    const feedsList = this.data.feedsList;
    const selectedCount = feedsList.filter(f => f.owned).length;

    // 智能预警检测
    const warnings = [];
    if (selectedCount > 0 && selectedCount <= 2) {
      warnings.push('只选择了 1–2 种原料，营养可能配不齐。计算后结果页会标出缺少哪些指标。');
    }
    const hasForage = feedsList.some(f => f.owned && f.category === 'forage');
    if (!hasForage) {
      warnings.push('尚未选择粗饲料，日粮结构不完整；系统绝不会替您擅自添加。');
    }
    const hasSalt = feedsList.some(f => f.owned && f.feed_id === 'salt');
    if (!hasSalt) {
      warnings.push('尚未勾选食盐，配方可能因钠离子不足而无法达标。');
    }

    // 按分类归类
    const feedGroups = GROUP_META.map(meta => ({
      ...meta,
      feeds: feedsList.filter(f => f.category === meta.category)
    }));

    this.setData({
      feedGroups,
      selectedCount,
      warnings
    });
  },

  handleBack() {
    wx.navigateBack();
  },

  handleCalculate() {
    const selected = this.data.feedsList.filter(f => f.owned);
    if (selected.length === 0) {
      wx.showToast({ title: '请至少勾选一种原料', icon: 'none' });
      return;
    }

    for (const f of selected) {
      const p = parseFloat(f.price);
      if (isNaN(p) || p < 0) {
        wx.showToast({ title: `${f.name} 的价格不能小于 0`, icon: 'none' });
        return;
      }
    }

    // 组装 CalculateRequest
    const animalForm = app.globalData.animalForm;
    const animalPayload = {
      class: animalForm.class,
      body_weight_kg: parseFloat(animalForm.bodyWeightKg),
      milk_kg: animalForm.milkKg ? parseFloat(animalForm.milkKg) : null,
      milk_fat_percent: animalForm.milkFatPercent ? parseFloat(animalForm.milkFatPercent) : null
    };

    const feedsPayload = this.data.feedsList.map(f => {
      const hasOverride = Object.keys(f.override).length > 0;
      return {
        feed_id: f.feed_id,
        owned: f.owned,
        price_rmb_per_kg: parseFloat(f.price) || 0,
        override: hasOverride ? f.override : null
      };
    });

    const requestPayload = {
      animal: animalPayload,
      feeds: feedsPayload
    };

    app.globalData.lastRequest = requestPayload;

    wx.navigateTo({
      url: '/pages/result/result'
    });
  }
});
