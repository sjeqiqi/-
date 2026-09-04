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
    // 0. 模式选择：'pasture' (规模化牧场模式) | 'single' (单只精准模式)
    calcMode: 'pasture',

    // 1. 主产区选择
    regions: REGIONS,
    selectedRegionIndex: 0,

    // ================= 模式 A：规模化牧场模式参数 =================
    // 羊群总存栏量
    totalFlockCount: '500',
    presetFlocks: ['100', '300', '500', '1000', '2000'],

    // 核心计算群选择：'lactating' (泌乳群) | 'growing' (青年羊) | 'lamb' (羔羊)
    coreTarget: 'lactating',
    coreTargetName: '成年泌乳期生产群',

    // 各阶段羊只数与占比（支持直接修改数字）
    lactatingPct: 70,
    lactatingCount: 350,
    growingPct: 20,
    growingCount: 100,
    lambPct: 10,
    lambCount: 50,

    // 牧场模式核心群生理指标微调
    bodyWeightKg: '50',
    milkKg: '2.5',
    milkFatPercent: '4.0',
    growingWeightKg: '35',
    lambWeightKg: '28',

    // ================= 模式 B：单只精准模式参数 =================
    // 单羊生理阶段：'lactating' (泌乳) | 'maintenance' (维持) | 'growing' (青年育成)
    singleStage: 'lactating',
    singleBodyWeightKg: '50',
    singleMilkKg: '2.5',
    singleMilkFatPercent: '4.0',

    errorMessage: ''
  },

  onLoad() {
    const globalPasture = app.globalData.pastureInfo;
    const globalAnimal = app.globalData.animalForm;

    if (globalPasture) {
      const rIdx = this.data.regions.findIndex(r => r.id === globalPasture.regionId);
      const total = globalPasture.totalFlockCount || 500;
      const struct = globalPasture.herdStructure || {};
      const core = globalPasture.coreTarget || 'lactating';
      const coreName = globalPasture.coreTargetName || '成年泌乳期生产群';
      const mode = globalPasture.calcMode || 'pasture';
      
      this.setData({
        calcMode: mode,
        selectedRegionIndex: rIdx >= 0 ? rIdx : 0,
        totalFlockCount: String(total),
        coreTarget: core,
        coreTargetName: coreName,
        lactatingPct: struct.lactatingPct !== undefined ? struct.lactatingPct : 70,
        lactatingCount: struct.lactatingCount !== undefined ? struct.lactatingCount : 350,
        growingPct: struct.growingPct !== undefined ? struct.growingPct : 20,
        growingCount: struct.growingCount !== undefined ? struct.growingCount : 100,
        lambPct: struct.lambPct !== undefined ? struct.lambPct : 10,
        lambCount: struct.lambCount !== undefined ? struct.lambCount : 50
      });
    }

    if (globalAnimal) {
      this.setData({
        bodyWeightKg: globalAnimal.bodyWeightKg || '50',
        milkKg: globalAnimal.milkKg || '2.5',
        milkFatPercent: globalAnimal.milkFatPercent || '4.0',
        singleBodyWeightKg: globalAnimal.bodyWeightKg || '50',
        singleMilkKg: globalAnimal.milkKg || '2.5',
        singleMilkFatPercent: globalAnimal.milkFatPercent || '4.0',
        singleStage: globalAnimal.class === 'maintenance' ? 'maintenance' : 'lactating'
      });
    }
  },

  // 顶部分段切换：规模化牧场 ⇋ 单只精准
  switchCalcMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      calcMode: mode,
      errorMessage: ''
    });
    wx.showToast({
      title: mode === 'single' ? '已切换至：单只精准模式' : '已切换至：规模化牧场模式',
      icon: 'none'
    });
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

  // -------------------------------------------------------------
  // 模式 B：单只精准模式专属事件
  // -------------------------------------------------------------
  selectSingleStage(e) {
    const stage = e.currentTarget.dataset.stage;
    let w = this.data.singleBodyWeightKg;
    if (stage === 'growing' && (w === '50' || !w)) {
      w = '35';
    } else if (stage === 'lactating' && (w === '35' || !w)) {
      w = '50';
    }

    this.setData({
      singleStage: stage,
      singleBodyWeightKg: w,
      errorMessage: ''
    });
  },

  onSingleWeightInput(e) {
    this.setData({ singleBodyWeightKg: e.detail.value, errorMessage: '' });
  },

  quickSetSingleWeight(e) {
    this.setData({ singleBodyWeightKg: e.currentTarget.dataset.val, errorMessage: '' });
  },

  onSingleMilkInput(e) {
    this.setData({ singleMilkKg: e.detail.value, errorMessage: '' });
  },

  quickSetSingleMilk(e) {
    this.setData({ singleMilkKg: e.currentTarget.dataset.val, errorMessage: '' });
  },

  onSingleFatInput(e) {
    this.setData({ singleMilkFatPercent: e.detail.value, errorMessage: '' });
  },

  // -------------------------------------------------------------
  // 模式 A：规模化牧场模式专属事件
  // -------------------------------------------------------------
  selectCoreTarget(e) {
    const target = e.currentTarget.dataset.target;
    let name = '成年泌乳期生产群';
    if (target === 'growing') name = '青年育成羊';
    if (target === 'lamb') name = '幼年期羔羊';

    this.setData({
      coreTarget: target,
      coreTargetName: name,
      errorMessage: ''
    });

    wx.showToast({
      title: `核心计算群已切换为：${name}`,
      icon: 'none'
    });
  },

  stopPropagation() {
    // 阻止点击输入框时触发切换核心群
  },

  // 直接改数字：输入某阶段的只数
  onHerdCountInput(e) {
    const stage = e.currentTarget.dataset.stage;
    let val = parseInt(e.detail.value);
    if (isNaN(val) || val < 0) val = 0;

    let lCount = parseInt(this.data.lactatingCount) || 0;
    let gCount = parseInt(this.data.growingCount) || 0;
    let lambCount = parseInt(this.data.lambCount) || 0;

    if (stage === 'lactating') lCount = val;
    else if (stage === 'growing') gCount = val;
    else if (stage === 'lamb') lambCount = val;

    const newTotal = lCount + gCount + lambCount;
    let lPct = newTotal > 0 ? Math.round((lCount / newTotal) * 100) : 0;
    let gPct = newTotal > 0 ? Math.round((gCount / newTotal) * 100) : 0;
    let lambPct = newTotal > 0 ? Math.max(0, 100 - lPct - gPct) : 0;

    this.setData({
      totalFlockCount: String(newTotal),
      lactatingCount: lCount,
      growingCount: gCount,
      lambCount: lambCount,
      lactatingPct: lPct,
      growingPct: gPct,
      lambPct: lambPct,
      errorMessage: ''
    });
  },

  // 直接改数字：输入某阶段的占比 %
  onHerdPctInput(e) {
    const stage = e.currentTarget.dataset.stage;
    let val = parseInt(e.detail.value);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 100) val = 100;

    const total = parseInt(this.data.totalFlockCount) || 500;
    let lPct = parseInt(this.data.lactatingPct) || 0;
    let gPct = parseInt(this.data.growingPct) || 0;
    let lambPct = parseInt(this.data.lambPct) || 0;

    if (stage === 'lactating') {
      lPct = val;
      const rem = 100 - lPct;
      gPct = Math.round(rem * (2 / 3));
      lambPct = Math.max(0, rem - gPct);
    } else if (stage === 'growing') {
      gPct = val;
      const rem = 100 - gPct;
      lPct = Math.round(rem * 0.7);
      lambPct = Math.max(0, rem - lPct);
    } else if (stage === 'lamb') {
      lambPct = val;
      const rem = 100 - lambPct;
      lPct = Math.round(rem * 0.7);
      gPct = Math.max(0, rem - lPct);
    }

    const lCount = Math.round(total * (lPct / 100));
    const gCount = Math.round(total * (gPct / 100));
    const lambCount = Math.max(0, total - lCount - gCount);

    this.setData({
      lactatingPct: lPct,
      growingPct: gPct,
      lambPct: lambPct,
      lactatingCount: lCount,
      growingCount: gCount,
      lambCount: lambCount,
      errorMessage: ''
    });
  },

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

  onLactatingSliderChange(e) {
    let lPct = Number(e.detail.value);
    let remaining = 100 - lPct;
    let gPct = Math.round(remaining * (2 / 3));
    let lambPct = Math.max(0, 100 - lPct - gPct);

    this.setData({
      lactatingPct: lPct,
      growingPct: gPct,
      lambPct: lambPct
    }, () => {
      this.recalcHerdCounts();
    });
  },

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

  // 牧场核心群生理指标事件
  quickSetWeight(e) {
    this.setData({ bodyWeightKg: e.currentTarget.dataset.val, errorMessage: '' });
  },

  quickSetMilk(e) {
    this.setData({ milkKg: e.currentTarget.dataset.val, errorMessage: '' });
  },

  quickSetGrowingWeight(e) {
    this.setData({ growingWeightKg: e.currentTarget.dataset.val, errorMessage: '' });
  },

  quickSetLambWeight(e) {
    this.setData({ lambWeightKg: e.currentTarget.dataset.val, errorMessage: '' });
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

  onGrowingWeightInput(e) {
    this.setData({ growingWeightKg: e.detail.value, errorMessage: '' });
  },

  onLambWeightInput(e) {
    this.setData({ lambWeightKg: e.detail.value, errorMessage: '' });
  },

  // 校验逻辑
  validate() {
    if (this.data.calcMode === 'single') {
      const stage = this.data.singleStage;
      const w = parseFloat(this.data.singleBodyWeightKg);
      if (isNaN(w) || w < 25 || w > 90) {
        return '请输入 25 – 90 kg 之间的单羊体重';
      }

      if (stage === 'lactating') {
        const m = parseFloat(this.data.singleMilkKg);
        if (isNaN(m) || m < 0.2 || m > 5.0) {
          return '请输入 0.2 – 5.0 kg/天 之间的日均产奶量';
        }
        if (this.data.singleMilkFatPercent && this.data.singleMilkFatPercent.trim() !== '') {
          const f = parseFloat(this.data.singleMilkFatPercent);
          if (isNaN(f) || f < 2.0 || f > 7.0) {
            return '乳脂率请填写 2.0 – 7.0% 之间的数值，也可留空默认 4.0%';
          }
        }
      }
      return null;
    }

    // 规模化牧场模式校验
    const total = parseInt(this.data.totalFlockCount);
    if (isNaN(total) || total < 10 || total > 50000) {
      return '请输入 10 – 50,000 只之间的牧场总存栏量';
    }

    const core = this.data.coreTarget;
    if (core === 'lactating') {
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
    } else if (core === 'growing') {
      const w = parseFloat(this.data.growingWeightKg);
      if (isNaN(w) || w < 25 || w > 60) {
        return '请输入 25 – 60 kg 之间的青年羊均重';
      }
    } else if (core === 'lamb') {
      const w = parseFloat(this.data.lambWeightKg);
      if (isNaN(w) || w < 25 || w > 45) {
        return '请输入 25 – 45 kg 之间的羔羊均重';
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

    if (this.data.calcMode === 'single') {
      // 单只精准模式处理
      const stage = this.data.singleStage;
      let stageName = '成年泌乳奶山羊';
      let animalClass = 'lactating';
      let milk = this.data.singleMilkKg;
      let fat = this.data.singleMilkFatPercent || '4.0';

      if (stage === 'maintenance') {
        stageName = '成年维持期羊';
        animalClass = 'maintenance';
        milk = null;
        fat = null;
      } else if (stage === 'growing') {
        stageName = '青年育成后备羊';
        animalClass = 'maintenance';
        milk = null;
        fat = null;
      }

      app.globalData.pastureInfo = {
        calcMode: 'single',
        regionId: selRegion.id,
        regionName: selRegion.name,
        totalFlockCount: 1,
        coreTarget: stage,
        coreTargetName: `单只${stageName}`,
        coreCount: 1,
        herdStructure: {
          lactatingPct: stage === 'lactating' ? 100 : 0,
          lactatingCount: stage === 'lactating' ? 1 : 0,
          growingPct: stage === 'growing' ? 100 : 0,
          growingCount: stage === 'growing' ? 1 : 0,
          lambPct: 0,
          lambCount: 0
        }
      };

      app.globalData.animalForm = {
        class: animalClass,
        bodyWeightKg: String(this.data.singleBodyWeightKg),
        milkKg: milk ? String(milk) : null,
        milkFatPercent: fat ? String(fat) : null
      };

    } else {
      // 规模化牧场模式处理
      const totalFlock = parseInt(this.data.totalFlockCount) || 500;
      const core = this.data.coreTarget;

      let coreCount = this.data.lactatingCount;
      let animalClass = 'lactating';
      let bodyWeight = this.data.bodyWeightKg;
      let milk = this.data.milkKg;
      let fat = this.data.milkFatPercent || '4.0';

      if (core === 'growing') {
        coreCount = this.data.growingCount;
        animalClass = 'maintenance';
        bodyWeight = this.data.growingWeightKg || '35';
        milk = null;
        fat = null;
      } else if (core === 'lamb') {
        coreCount = this.data.lambCount;
        animalClass = 'maintenance';
        bodyWeight = this.data.lambWeightKg || '28';
        milk = null;
        fat = null;
      }

      app.globalData.pastureInfo = {
        calcMode: 'pasture',
        regionId: selRegion.id,
        regionName: selRegion.name,
        totalFlockCount: totalFlock,
        coreTarget: core,
        coreTargetName: this.data.coreTargetName,
        coreCount: coreCount,
        herdStructure: {
          lactatingPct: this.data.lactatingPct,
          lactatingCount: this.data.lactatingCount,
          growingPct: this.data.growingPct,
          growingCount: this.data.growingCount,
          lambPct: this.data.lambPct,
          lambCount: this.data.lambCount
        }
      };

      app.globalData.animalForm = {
        class: animalClass,
        bodyWeightKg: String(bodyWeight),
        milkKg: milk ? String(milk) : null,
        milkFatPercent: fat ? String(fat) : null
      };
    }

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
