// pages/index/index.js
const app = getApp();

Page({
  data: {
    classList: [
      { label: '成年泌乳奶山羊', value: 'lactating' },
      { label: '成年非泌乳维持期', value: 'maintenance' }
    ],
    classIndex: 0,
    bodyWeightKg: '50',
    milkKg: '2.5',
    milkFatPercent: '4.0',
    errorMessage: ''
  },

  onLoad() {
    const globalForm = app.globalData.animalForm;
    if (globalForm) {
      const idx = this.data.classList.findIndex(item => item.value === globalForm.class);
      this.setData({
        classIndex: idx >= 0 ? idx : 0,
        bodyWeightKg: globalForm.bodyWeightKg || '50',
        milkKg: globalForm.milkKg || '2.5',
        milkFatPercent: globalForm.milkFatPercent || '4.0'
      });
    }
  },

  onClassChange(e) {
    this.setData({
      classIndex: Number(e.detail.value),
      errorMessage: ''
    });
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
    const w = parseFloat(this.data.bodyWeightKg);
    if (isNaN(w) || w < 25 || w > 90) {
      return '请输入 25 – 90 kg 之间的有效体重';
    }

    const selectedClass = this.data.classList[this.data.classIndex].value;
    if (selectedClass === 'lactating') {
      const m = parseFloat(this.data.milkKg);
      if (isNaN(m) || m < 0.2 || m > 5.0) {
        return '请输入 0.2 – 5.0 kg/天 之间的日产奶量';
      }

      if (this.data.milkFatPercent && this.data.milkFatPercent.trim() !== '') {
        const f = parseFloat(this.data.milkFatPercent);
        if (isNaN(f) || f < 2.0 || f > 7.0) {
          return '乳脂率请填写 2.0 – 7.0% 之间的数值，也可留空默认 4.0%';
        }
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

    // 保存到全局
    const selectedClass = this.data.classList[this.data.classIndex].value;
    app.globalData.animalForm = {
      class: selectedClass,
      bodyWeightKg: this.data.bodyWeightKg,
      milkKg: selectedClass === 'lactating' ? this.data.milkKg : null,
      milkFatPercent: selectedClass === 'lactating' ? (this.data.milkFatPercent || '4.0') : null
    };

    wx.navigateTo({
      url: '/pages/feeds/feeds'
    });
  }
});
