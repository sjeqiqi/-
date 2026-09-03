// pages/feeds/feeds.js
import { fetchFeeds } from '../../utils/api.js';

const app = getApp();

const GROUP_META = [
  { category: 'concentrate', title: '🌾 精料补充料', description: '主要补充能量和蛋白' },
  { category: 'forage', title: '🌿 粗饲料与青贮', description: '构成日粮基础，维持瘤胃健康与反刍' },
  { category: 'mineral', title: '🧂 矿物质与盐', description: '补充食盐、钙磷等矿物元素' }
];

// 代表性主产区行情与营养实测数据库
const REGIONAL_FEED_DATABASE = {
  guanzhong: {
    name: '陕西关中优势产区',
    note: '关中/莎能奶山羊核心主产带，玉米、青贮及关中麦麸产地丰富',
    feeds: {
      corn: { price: 2.35, dm_pct: 86.0, me: 14.0, cp_pct_dm: 8.2, ndf_pct_dm: 9.5, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.85, dm_pct: 88.0, me: 10.2, cp_pct_dm: 15.2, ndf_pct_dm: 40.5, ca: 0.11, p: 0.92 },
      soybean_meal: { price: 3.55, dm_pct: 89.0, me: 14.0, cp_pct_dm: 46.5, ndf_pct_dm: 13.0, ca: 0.32, p: 0.62 },
      rapeseed_meal: { price: 2.70, dm_pct: 89.0, me: 11.0, cp_pct_dm: 36.0, ndf_pct_dm: 30.0, ca: 0.65, p: 1.02 },
      peanut_meal: { price: 2.95, dm_pct: 90.0, me: 13.0, cp_pct_dm: 47.0, ndf_pct_dm: 15.0, ca: 0.22, p: 0.55 },
      alfalfa_hay: { price: 2.10, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.5, ndf_pct_dm: 42.0, ca: 1.30, p: 0.28 },
      corn_stover: { price: 0.45, dm_pct: 90.0, me: 6.5, cp_pct_dm: 5.5, ndf_pct_dm: 68.0, ca: 0.45, p: 0.08 },
      peanut_vine: { price: 0.95, dm_pct: 90.0, me: 8.3, cp_pct_dm: 10.0, ndf_pct_dm: 52.0, ca: 1.40, p: 0.20 },
      sheep_grass: { price: 1.60, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.10, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.42, dm_pct: 32.0, me: 10.6, cp_pct_dm: 7.2, ndf_pct_dm: 46.0, ca: 0.25, p: 0.10 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.40, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 }
    }
  },
  neimenggu: {
    name: '内蒙古奶业优势带',
    note: '高纬度光照充足，羊草、燕麦干草与苜蓿草场低价优势',
    feeds: {
      corn: { price: 2.45, dm_pct: 86.5, me: 13.8, cp_pct_dm: 8.0, ndf_pct_dm: 9.8, ca: 0.02, p: 0.27 },
      wheat_bran: { price: 1.95, dm_pct: 88.0, me: 10.0, cp_pct_dm: 14.8, ndf_pct_dm: 41.5, ca: 0.10, p: 0.90 },
      soybean_meal: { price: 3.70, dm_pct: 89.0, me: 14.0, cp_pct_dm: 46.0, ndf_pct_dm: 13.5, ca: 0.30, p: 0.60 },
      rapeseed_meal: { price: 2.85, dm_pct: 89.0, me: 11.0, cp_pct_dm: 35.5, ndf_pct_dm: 30.5, ca: 0.65, p: 1.00 },
      peanut_meal: { price: 3.15, dm_pct: 90.0, me: 12.8, cp_pct_dm: 46.5, ndf_pct_dm: 15.5, ca: 0.20, p: 0.52 },
      alfalfa_hay: { price: 1.80, dm_pct: 91.0, me: 9.8, cp_pct_dm: 18.2, ndf_pct_dm: 40.0, ca: 1.35, p: 0.30 },
      corn_stover: { price: 0.40, dm_pct: 90.0, me: 6.5, cp_pct_dm: 5.2, ndf_pct_dm: 69.0, ca: 0.42, p: 0.08 },
      peanut_vine: { price: 1.10, dm_pct: 90.0, me: 8.1, cp_pct_dm: 9.5, ndf_pct_dm: 53.0, ca: 1.35, p: 0.18 },
      sheep_grass: { price: 1.25, dm_pct: 92.0, me: 8.8, cp_pct_dm: 8.6, ndf_pct_dm: 58.0, ca: 0.38, p: 0.20 },
      oat_hay: { price: 1.75, dm_pct: 91.0, me: 9.2, cp_pct_dm: 9.5, ndf_pct_dm: 53.0, ca: 0.32, p: 0.26 },
      corn_silage: { price: 0.45, dm_pct: 31.0, me: 10.5, cp_pct_dm: 7.0, ndf_pct_dm: 47.0, ca: 0.24, p: 0.10 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.42, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 }
    }
  },
  shandong: {
    name: '山东黄淮海产区',
    note: '沿海港口蛋白饲料加工集聚，花生秧及副产物成本优势显著',
    feeds: {
      corn: { price: 2.28, dm_pct: 86.5, me: 14.1, cp_pct_dm: 8.2, ndf_pct_dm: 9.2, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.80, dm_pct: 88.5, me: 10.2, cp_pct_dm: 15.3, ndf_pct_dm: 40.0, ca: 0.11, p: 0.94 },
      soybean_meal: { price: 3.48, dm_pct: 89.5, me: 14.2, cp_pct_dm: 47.0, ndf_pct_dm: 12.8, ca: 0.32, p: 0.64 },
      rapeseed_meal: { price: 2.65, dm_pct: 89.0, me: 11.2, cp_pct_dm: 36.2, ndf_pct_dm: 29.5, ca: 0.66, p: 1.05 },
      peanut_meal: { price: 2.80, dm_pct: 90.5, me: 13.2, cp_pct_dm: 47.8, ndf_pct_dm: 14.5, ca: 0.24, p: 0.58 },
      alfalfa_hay: { price: 2.25, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.2, ndf_pct_dm: 42.5, ca: 1.28, p: 0.27 },
      corn_stover: { price: 0.42, dm_pct: 89.5, me: 6.5, cp_pct_dm: 5.6, ndf_pct_dm: 67.5, ca: 0.46, p: 0.09 },
      peanut_vine: { price: 0.78, dm_pct: 89.0, me: 8.4, cp_pct_dm: 10.5, ndf_pct_dm: 50.0, ca: 1.45, p: 0.22 },
      sheep_grass: { price: 1.70, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.15, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.40, dm_pct: 30.5, me: 10.6, cp_pct_dm: 7.2, ndf_pct_dm: 46.5, ca: 0.25, p: 0.11 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.38, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 }
    }
  },
  henan_hebei: {
    name: '河南/河北农区产区',
    note: '黄淮海传统粮仓大区，玉米青贮与小麦麸大宗原料供应充足',
    feeds: {
      corn: { price: 2.30, dm_pct: 86.0, me: 14.0, cp_pct_dm: 8.1, ndf_pct_dm: 9.5, ca: 0.02, p: 0.28 },
      wheat_bran: { price: 1.75, dm_pct: 88.5, me: 10.3, cp_pct_dm: 15.5, ndf_pct_dm: 39.8, ca: 0.11, p: 0.95 },
      soybean_meal: { price: 3.52, dm_pct: 89.0, me: 14.1, cp_pct_dm: 46.5, ndf_pct_dm: 13.2, ca: 0.32, p: 0.63 },
      rapeseed_meal: { price: 2.70, dm_pct: 89.0, me: 11.0, cp_pct_dm: 36.0, ndf_pct_dm: 30.0, ca: 0.65, p: 1.02 },
      peanut_meal: { price: 2.90, dm_pct: 90.0, me: 13.0, cp_pct_dm: 47.0, ndf_pct_dm: 15.0, ca: 0.22, p: 0.55 },
      alfalfa_hay: { price: 2.15, dm_pct: 90.0, me: 9.5, cp_pct_dm: 17.3, ndf_pct_dm: 42.0, ca: 1.30, p: 0.28 },
      corn_stover: { price: 0.40, dm_pct: 90.0, me: 6.6, cp_pct_dm: 5.6, ndf_pct_dm: 67.0, ca: 0.46, p: 0.09 },
      peanut_vine: { price: 0.88, dm_pct: 89.5, me: 8.3, cp_pct_dm: 10.2, ndf_pct_dm: 51.0, ca: 1.42, p: 0.21 },
      sheep_grass: { price: 1.65, dm_pct: 91.0, me: 8.5, cp_pct_dm: 8.0, ndf_pct_dm: 60.0, ca: 0.35, p: 0.18 },
      oat_hay: { price: 2.10, dm_pct: 90.0, me: 9.0, cp_pct_dm: 9.0, ndf_pct_dm: 55.0, ca: 0.30, p: 0.25 },
      corn_silage: { price: 0.38, dm_pct: 30.0, me: 10.8, cp_pct_dm: 7.2, ndf_pct_dm: 46.0, ca: 0.26, p: 0.11 },
      salt: { price: 1.00, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 0.0, p: 0.0 },
      limestone: { price: 0.38, dm_pct: 100.0, me: 0.0, cp_pct_dm: 0.0, ndf_pct_dm: 0.0, ca: 38.0, p: 0.0 }
    }
  }
};

const BASE_FEEDS = [
  { feed_id: "corn", name: "玉米", category: "concentrate", max_usage_pct_dm: 35.0, is_estimate: true },
  { feed_id: "wheat_bran", name: "小麦麸", category: "concentrate", max_usage_pct_dm: 20.0, is_estimate: true },
  { feed_id: "soybean_meal", name: "豆粕", category: "concentrate", max_usage_pct_dm: 20.0, is_estimate: true },
  { feed_id: "rapeseed_meal", name: "菜籽粕", category: "concentrate", max_usage_pct_dm: 10.0, is_estimate: true },
  { feed_id: "peanut_meal", name: "花生粕", category: "concentrate", max_usage_pct_dm: 10.0, is_estimate: true },
  { feed_id: "alfalfa_hay", name: "苜蓿干草", category: "forage", max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "corn_stover", name: "玉米秸秆", category: "forage", max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "peanut_vine", name: "花生秧", category: "forage", max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "sheep_grass", name: "羊草", category: "forage", max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "oat_hay", name: "燕麦干草", category: "forage", max_usage_pct_dm: 70.0, is_estimate: true },
  { feed_id: "corn_silage", name: "全株玉米青贮", category: "forage", max_usage_pct_dm: 60.0, is_estimate: true },
  { feed_id: "salt", name: "食盐", category: "mineral", max_usage_pct_dm: 100.0, is_estimate: false },
  { feed_id: "limestone", name: "饲料级石灰石粉", category: "mineral", max_usage_pct_dm: 2.0, is_estimate: true }
];

const ESSENTIAL_FEED_IDS = ['corn', 'wheat_bran', 'soybean_meal', 'alfalfa_hay', 'corn_silage', 'salt', 'limestone'];

Page({
  data: {
    loading: false,
    mode: 'recommended', // 'recommended' | 'manual'
    regionId: 'guanzhong',
    regionName: '陕西关中优势产区',
    regionNote: '关中/莎能奶山羊核心主产带',
    feedsList: [],
    feedGroups: [],
    selectedCount: 0,
    warnings: [],
    expandedId: null
  },

  onLoad() {
    const pasture = app.globalData.pastureInfo || {};
    const rId = pasture.regionId || 'guanzhong';
    const rName = pasture.regionName || '陕西关中优势产区';

    this.setData({
      regionId: rId,
      regionName: rName,
      regionNote: (REGIONAL_FEED_DATABASE[rId] && REGIONAL_FEED_DATABASE[rId].note) || ''
    });

    this.initRegionalCatalog(rId);
  },

  /**
   * 初始化/构建与产区联动的原料数据
   */
  initRegionalCatalog(regionId) {
    const regionData = REGIONAL_FEED_DATABASE[regionId] || REGIONAL_FEED_DATABASE.guanzhong;
    const initialMode = app.globalData.feedsMode || 'recommended';

    const feedsList = BASE_FEEDS.map(base => {
      const reg = regionData.feeds[base.feed_id] || {};
      return {
        ...base,
        owned: initialMode === 'recommended',
        price: String(reg.price !== undefined ? reg.price : '1.0'),
        dm_pct: reg.dm_pct || 90.0,
        me_mj_per_kg_dm: reg.me || 10.0,
        cp_pct_dm: reg.cp_pct_dm || 10.0,
        ndf_pct_dm: reg.ndf_pct_dm || 40.0,
        ca_pct_dm: reg.ca || 0.1,
        p_pct_dm: reg.p || 0.1,
        default_price: String(reg.price !== undefined ? reg.price : '1.0'),
        override: {}
      };
    });

    this.setData({
      loading: false,
      feedsList: feedsList,
      mode: initialMode
    }, () => {
      this.rebuildGroups();
    });
  },

  /**
   * 一键还原当前产区默认行情与营养指标
   */
  restoreRegionDefaults() {
    const regionId = this.data.regionId;
    const regionData = REGIONAL_FEED_DATABASE[regionId] || REGIONAL_FEED_DATABASE.guanzhong;

    const feedsList = this.data.feedsList.map(item => {
      const reg = regionData.feeds[item.feed_id] || {};
      return {
        ...item,
        price: String(reg.price !== undefined ? reg.price : '1.0'),
        dm_pct: reg.dm_pct || 90.0,
        me_mj_per_kg_dm: reg.me || 10.0,
        cp_pct_dm: reg.cp_pct_dm || 10.0,
        ndf_pct_dm: reg.ndf_pct_dm || 40.0,
        ca_pct_dm: reg.ca || 0.1,
        p_pct_dm: reg.p || 0.1,
        override: {}
      };
    });

    this.setData({ feedsList }, () => {
      this.rebuildGroups();
      wx.showToast({
        title: `已还原【${this.data.regionName}】行情默认值`,
        icon: 'success',
        duration: 2000
      });
    });
  },

  switchMode(e) {
    const newMode = e.currentTarget.dataset.mode;
    if (newMode === this.data.mode) return;
    
    app.globalData.feedsMode = newMode;
    this.setData({ mode: newMode });
  },

  selectAllFeeds() {
    const feedsList = this.data.feedsList.map(item => ({ ...item, owned: true }));
    this.setData({ feedsList }, () => this.rebuildGroups());
    wx.showToast({ title: '已全选 13 种原料', icon: 'none' });
  },

  selectEssentialFeeds() {
    const feedsList = this.data.feedsList.map(item => ({
      ...item,
      owned: ESSENTIAL_FEED_IDS.includes(item.feed_id)
    }));
    this.setData({ feedsList }, () => this.rebuildGroups());
    wx.showToast({ title: '已精选 7 种常用原料', icon: 'none' });
  },

  clearAllFeeds() {
    const feedsList = this.data.feedsList.map(item => ({ ...item, owned: false }));
    this.setData({ feedsList }, () => this.rebuildGroups());
    wx.showToast({ title: '已清空所选原料', icon: 'none' });
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
      // 检查是否有用户输入的覆盖参数或者与系统标准不一样的产区参数
      const overrideObj = {};
      if (f.dm_pct) overrideObj.dm_pct = f.dm_pct;
      if (f.me_mj_per_kg_dm) overrideObj.me_mj_per_kg_dm = f.me_mj_per_kg_dm;
      if (f.cp_pct_dm) overrideObj.cp_pct_dm = f.cp_pct_dm;
      if (f.ndf_pct_dm) overrideObj.ndf_pct_dm = f.ndf_pct_dm;
      if (f.ca_pct_dm) overrideObj.ca_pct_dm = f.ca_pct_dm;
      if (f.p_pct_dm) overrideObj.p_pct_dm = f.p_pct_dm;

      // 用户自定义输入优先覆盖
      Object.assign(overrideObj, f.override);

      return {
        feed_id: f.feed_id,
        owned: f.owned,
        price_rmb_per_kg: parseFloat(f.price) || 0,
        override: Object.keys(overrideObj).length > 0 ? overrideObj : null
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
