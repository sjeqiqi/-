// pages/index/index.js
const app = getApp();

const REGIONS = [
  {
    id: 'guanzhong',
    name: '陕西关中优势产区',
    desc: '全国奶山羊全产业链核心基地（关中羊/莎能羊高产带）',
    badge: '国家核心区'
  },
  {
    id: 'neimenggu',
    name: '内蒙古奶业优势带',
    desc: '草场与优质牧草资源带（羊草、苜蓿等粗饲料优势）',
    badge: '牧草优质带'
  },
  {
    id: 'shandong',
    name: '山东黄淮海产区',
    desc: '集约化养殖与农副产物集散地（花生秧、玉米副产物优势）',
    badge: '集约示范区'
  },
  {
    id: 'henan_hebei',
    name: '河南/河北农区产区',
    desc: '大宗农作物秸秆与全株青贮成本优势带',
    badge: '大宗农区'
  }
];

Page({
  data: {
    // 1. 主产区选择
    regions: REGIONS,
    selectedRegionIndex: 0,

    // 2. 羊群总存栏量
    totalFlockCount: '500',
    presetFlocks: ['100', '300', '500', '1000', '2000'],

    // 3. 群体结构分布与占比 (维持期先隐藏，系统重点聚焦泌乳期核心生产群)
    lactatingPct: 70, // 核心生产群
    growingPct: 20,   // 青年育成羊
    lambPct: 10,      // 幼年期羔羊
    lactatingCount: 350,
    growingCount: 100,
    lambCount: 50,

    // 4. 核心泌乳羊生理指标微调 (预设科学默认值，支持微调)
    bodyWeightKg: '50',
    milkKg: '2.5',
    milkFatPercent: '4.0',

    errorMessage: ''
  },

  onLoad() {
    const globalPasture = app.globalData.pastureInfo;
    const globalAnimal = app.globalData.animalForm;

    if (globalPasture) {
      const rIdx = this.data.regions.findIndex(r => r.id === globalPasture.regionId);
      const total = globalPasture.totalFlockCount || 500;
      const struct = globalPasture.herdStructure || {};
      
      this.setData({
        selectedRegionIndex: rIdx >= 0 ? rIdx : 0,
        totalFlockCount: String(total),
        lactatingPct: struct.lactatingPct !== undefined ? struct.lactatingPct : 70,
        growingPct: struct.growingPct !== undefined ? struct.growingPct : 20,
        lambPct: struct.lambPct !== undefined ? struct.lambPct : 10
      }, () => {
        this.recalcHerdCounts();
      });
    } else {
      this.recalcHerdCounts();
    }

    if (globalAnimal) {
      this.setData({
        bodyWeightKg: globalAnimal.bodyWeightKg || '50',
        milkKg: globalAnimal.milkKg || '2.5',
        milkFatPercent: globalAnimal.milkFatPercent || '4.0'
      });
    }
  },

  // 选择主产区
  onRegionChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      selectedRegionIndex: idx,
      errorMessage: ''
    });
    wx.showToast({
      title: `已选择：${this.data.regions[idx].name}`,
      icon: 'none'
    });
  },

  selectRegionCard(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({
      selectedRegionIndex: idx,
      errorMessage: ''
    });
  },

  // 羊群总存栏输入与快捷芯片
  onTotalFlockInput(e) {
    this.setData({
      totalFlockCount: e.detail.value,
      errorMessage: ''
    }, () => {
      this.recalcHerdCounts();
    });
  },

  quickSetTotalFlock(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({
      totalFlockCount: val,
      errorMessage: ''
    }, () => {
      this.recalcHerdCounts();
    });
  },

  // 群体结构百分比滑块变动
  onLactatingSliderChange(e) {
    let lPct = Number(e.detail.value);
    // 剩余百分比按 2:1 动态分配给青年羊和幼年羔羊
    let remaining = 100 - lPct;
    let gPct = Math.round(remaining * (2 / 3));
    let lambPct = 100 - lPct - gPct;

    this.setData({
      lactatingPct: lPct,
      growingPct: gPct,
      lambPct: lambPct
    }, () => {
      this.recalcHerdCounts();
    });
  },

  // 根据总存栏量与百分比自动重新计算各阶段只数
  recalcHerdCounts() {
    const total = parseInt(this.data.totalFlockCount) || 0;
    const lCount = Math.round(total * (this.data.lactatingPct / 100));
    const gCount = Math.round(total * (this.data.growingPct / 100));
    const lambCount = Math.max(0, total - lCount - gCount);

    this.setData({
      lactatingCount: lCount,
      growingCount: gCount,
      lambCount: lambCount
    });
  },

  // 核心生产群单羊生理指标微调
  quickSetWeight(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ bodyWeightKg: val, errorMessage: '' });
  },

  quickSetMilk(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ milkKg: val, errorMessage: '' });
  },

  onWeightInput(e) {
    this.setData({ bodyWeightKg: e.detail.value, errorMessage: '' });
  },

  onMilkInput(e) {
    this.setData({ milkKg: e.detail.value, errorMessage: '' });
  },

  onFatInput(e) {
    this.setData({ milkFatPercent: e.detail.value, errorMessage: '' });
  },

  validate() {
    const total = parseInt(this.data.totalFlockCount);
    if (isNaN(total) || total < 10 || total > 50000) {
      return '请输入 10 – 50,000 只之间的牧场总存栏量';
    }

    const w = parseFloat(this.data.bodyWeightKg);
    if (isNaN(w) || w < 25 || w > 90) {
      return '请输入 25 – 90 kg 之间的核心泌乳羊均重';
    }

    const m = parseFloat(this.data.milkKg);
    if (isNaN(m) || m < 0.2 || m > 5.0) {
      return '请输入 0.2 – 5.0 kg/天 之间的日均产奶量';
    }

    if (this.data.milkFatPercent && this.data.milkFatPercent.trim() !== '') {
      const f = parseFloat(this.data.milkFatPercent);
      if (isNaN(f) || f < 2.0 || f > 7.0) {
        return '乳脂率请填写 2.0 – 7.0% 之间的数值，也可留空默认 4.0%';
      }
    }

    return null;
  },

  handleNext() {
    const err = this.validate();
    if (err) {
      this.setData({ errorMessage: err });
      wx.showToast({ title: err, icon: 'none' });
      return;
    }

    const selRegion = this.data.regions[this.data.selectedRegionIndex];
    const totalFlock = parseInt(this.data.totalFlockCount) || 500;

    // 1. 牧场规模化基础信息保存全局
    app.globalData.pastureInfo = {
      regionId: selRegion.id,
      regionName: selRegion.name,
      totalFlockCount: totalFlock,
      herdStructure: {
        lactatingPct: this.data.lactatingPct,
        lactatingCount: this.data.lactatingCount,
        growingPct: this.data.growingPct,
        growingCount: this.data.growingCount,
        lambPct: this.data.lambPct,
        lambCount: this.data.lambCount
      }
    };

    // 2. 核心生产群日粮计算指标保存全局
    app.globalData.animalForm = {
      class: 'lactating', // 聚焦核心生产群
      bodyWeightKg: this.data.bodyWeightKg,
      milkKg: this.data.milkKg,
      milkFatPercent: this.data.milkFatPercent || '4.0'
    };

    wx.navigateTo({
      url: '/pages/feeds/feeds'
    });
  },

  goToWeighPage() {
    wx.navigateTo({
      url: '/pages/weigh/weigh'
    });
  }
});
