// app.js
App({
  globalData: {
    // 微信云托管配置（环境真实ID：prod-d1gcd8sm9cea90836）
    envId: 'prod-d1gcd8sm9cea90836',
    serviceName: 'django-olww',
    // 备用公网 URL（用于本地开发工具开启域名放行时直接请求）
    baseUrl: 'https://django-olww-297810-6-1469616598.sh.run.tcloudbase.com',

    // 全局暂存数据
    animalForm: {
      class: 'lactating',
      bodyWeightKg: '50',
      milkKg: '2.5',
      milkFatPercent: '4.0'
    },
    feedForms: null,
    feedsMode: 'recommended',
    lastResult: null,
    lastRequest: null
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      try {
        wx.cloud.init({
          env: 'prod-d1gcd8sm9cea90836',
          traceUser: true
        });
        console.log('微信云托管初始化成功，环境ID：prod-d1gcd8sm9cea90836');
      } catch (err) {
        console.warn('wx.cloud.init 提示：', err);
      }
    }
  }
});
