// pages/feeds/feeds.js
import { fetchFeeds } from '../../utils/api.js';

const app = getApp();

const GROUP_META = [
  { category: 'concentrate', title: '精料', description: '主要补充能量和蛋白' },
  { category: 'forage', title: '粗饲料', description: '构成日粮基础，帮助维持瘤胃健康与反刍' },
  { category: 'mineral', title: '矿物质', description: '补充食盐、钙磷等微量元素' }
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
        const rawFeeds = res.feeds || [];
        const initialMode = app.globalData.feedsMode || 'recommended';
        
        // 组装每个原料的表单数据
        const feedsList = rawFeeds.map((item) => ({
          ...item,
          owned: initialMode === 'recommended', // 推荐模式下默认全部勾选入池
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
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showModal({
          title: '原料库加载失败',
          content: err.message || '网络请求超时，请检查云托管服务',
          showCancel: false
        });
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
