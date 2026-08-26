// miniprogram/pages/weigh/weigh.js
import { bleClient, BLE_CONFIG, matchUUID } from '../../utils/ble.js';

const app = getApp();

Page({
  data: {
    // 蓝牙连接状态
    connected: false,
    isConnecting: false,
    isScanning: false,
    connStateText: '未连接',
    connStateClass: 'disconnected',
    deviceId: '',

    // 运行模式：'recipe' (配方流水线模式) | 'custom' (自由单次模式)
    activeMode: 'recipe',

    // 🔬 DEMO 演示机等比缩放配置 (0~50g 传感器)
    scaleOptions: [
      { key: '100', label: '1:100 (Demo推荐)', ratio: 0.01 },
      { key: '50', label: '1:50', ratio: 0.02 },
      { key: '20', label: '1:20', ratio: 0.05 },
      { key: '10', label: '1:10', ratio: 0.1 },
      { key: '1', label: '1:1 (原比例)', ratio: 1.0 }
    ],
    currentScaleKey: '100',
    currentScaleRatio: 0.01,
    currentScaleLabel: '1:100 等比缩小',

    // 配方投喂任务队列
    recipeFeedList: [],
    currentFeedIndex: 0,
    currentFeedItem: null,
    completedCount: 0,

    // 称量与机器实时状态 (0~50g)
    currentWeight: null,
    statusText: '待机就绪 (等待连接)',
    statusEmoji: '💤',
    statusClass: 'idle',
    isOperating: false,

    // 自由称量参数输入 (0~50g Demo)
    targetGrams: '15',
    toleranceGrams: '1',
    presetTargets: [2, 5, 10, 15, 20, 25, 30, 40, 50],
    presetTolerances: [0.5, 1, 2, 3],

    // 通信日志
    showLogs: false,
    logs: [],
    lastLogId: '',

    // 设备搜索与排错
    discoveredDevices: [],
    showTroubleModal: false
  },

  onLoad(options) {
    this._initRecipeFeedQueue();
    this._setupBleCallbacks();
  },

  onShow() {
    this.setData({
      connected: bleClient.connected,
      deviceId: bleClient.deviceId || ''
    });
    if (bleClient.connected) {
      this._updateConnectionUI('connected', '已连接');
    }
  },

  onUnload() {
    bleClient.stopScan();
  },

  /**
   * 初始化配方原料投喂队列（带 DEMO 0~50g 等比缩小）
   */
  _initRecipeFeedQueue() {
    const lastRes = app.globalData.lastResult;
    if (lastRes && lastRes.feed_rows && Array.isArray(lastRes.feed_rows) && lastRes.feed_rows.length > 0) {
      const ratio = this.data.currentScaleRatio;

      const list = lastRes.feed_rows.map((row, idx) => {
        const kg = parseFloat(row.as_fed_kg) || 0;
        const rawGrams = Math.round(kg * 1000);
        
        // 按倍率等比缩小（保留 1 位小数，最小 0.5g）
        const scaledGrams = Math.max(0.5, Number((rawGrams * ratio).toFixed(1)));
        
        let tol = 1.0;
        if (scaledGrams <= 5) tol = 0.5;
        else if (scaledGrams >= 30) tol = 2.0;

        return {
          feed_id: row.feed_id || `feed_${idx}`,
          name: row.name || '原料',
          as_fed_kg: row.as_fed_kg,
          raw_g: rawGrams,
          target_g: scaledGrams,
          tolerance_g: tol,
          status: 'pending',
          weighed_g: null
        };
      });

      this.setData({
        recipeFeedList: list,
        currentFeedIndex: 0,
        currentFeedItem: list[0],
        completedCount: 0,
        activeMode: 'recipe',
        targetGrams: String(list[0].target_g),
        toleranceGrams: String(list[0].tolerance_g)
      });
    } else {
      this.setData({
        recipeFeedList: [],
        activeMode: 'custom'
      });
    }
  },

  /**
   * 用户选择切换等比缩放倍率
   */
  selectScaleRatio(e) {
    const key = e.currentTarget.dataset.key;
    const opt = this.data.scaleOptions.find(o => o.key === key);
    if (!opt) return;

    const ratio = opt.ratio;
    const list = this.data.recipeFeedList.map(item => {
      const scaledGrams = Math.max(0.5, Number((item.raw_g * ratio).toFixed(1)));
      let tol = 1.0;
      if (scaledGrams <= 5) tol = 0.5;
      else if (scaledGrams >= 30) tol = 2.0;

      return {
        ...item,
        target_g: scaledGrams,
        tolerance_g: tol
      };
    });

    const currIdx = this.data.currentFeedIndex;
    const currItem = list[currIdx] || list[0];

    this.setData({
      currentScaleKey: key,
      currentScaleRatio: ratio,
      currentScaleLabel: opt.label,
      recipeFeedList: list,
      currentFeedItem: currItem,
      targetGrams: String(currItem.target_g),
      toleranceGrams: String(currItem.tolerance_g)
    });

    wx.showToast({
      title: `已切换为 ${opt.label}`,
      icon: 'none'
    });
  },

  /**
   * 切换投喂模式 (配方流水线 VS 自由单次)
   */
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ activeMode: mode });
  },

  /**
   * 选择队列中的某种原料
   */
  selectFeedRow(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const item = this.data.recipeFeedList[idx];
    if (!item) return;

    this.setData({
      currentFeedIndex: idx,
      currentFeedItem: item,
      targetGrams: String(item.target_g),
      toleranceGrams: String(item.tolerance_g)
    });
  },

  _setupBleCallbacks() {
    // 1. 监听连接状态变化
    bleClient.onStateChange = (state, detail) => {
      this._updateConnectionUI(state, detail);
    };

    // 2. 监听树莓派上报的数据
    bleClient.onDataReceived = (parsed, rawStr) => {
      this._handleDeviceReport(parsed);
    };

    // 3. 监听搜索到的设备
    bleClient.onDeviceDiscovered = (device) => {
      const list = this.data.discoveredDevices.slice();
      const existingIdx = list.findIndex(d => d.deviceId === device.deviceId);
      
      const devName = (device.name || device.localName || '').toLowerCase();
      const isTarget = devName.includes('weigh') || devName.includes('raspberry') || devName.includes('scale') ||
                       (device.advertisServiceUUIDs && device.advertisServiceUUIDs.some(u => matchUUID(u, BLE_CONFIG.SERVICE_UUID)));
      
      device.isTarget = !!isTarget;

      if (existingIdx >= 0) {
        list[existingIdx] = device;
      } else {
        if (isTarget) {
          list.unshift(device);
        } else {
          list.push(device);
        }
      }
      this.setData({ discoveredDevices: list });
    };

    // 4. 搜索超时提醒
    bleClient.onScanTimeout = () => {
      if (this.data.discoveredDevices.length === 0) {
        this.setData({ showTroubleModal: true });
      } else {
        wx.showToast({ title: '已列出附近发现的设备，请点击连接', icon: 'none', duration: 2500 });
      }
    };

    // 5. 监听通信日志
    bleClient.onLog = (type, msg) => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const logId = `log_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      const newLog = {
        id: logId,
        time: timeStr,
        type: type,
        msg: msg
      };

      const logs = this.data.logs.concat(newLog);
      if (logs.length > 60) logs.shift();

      this.setData({
        logs: logs,
        lastLogId: logId
      });
    };
  },

  _updateConnectionUI(state, detail) {
    let text = '未连接';
    let cls = 'disconnected';
    let isScanning = false;
    let isConnecting = false;
    let connected = false;

    switch (state) {
      case 'scanning':
        text = '搜索中…';
        cls = 'scanning';
        isScanning = true;
        break;
      case 'connecting':
        text = '连接中…';
        cls = 'connecting';
        isConnecting = true;
        break;
      case 'connected':
        text = '已连接';
        cls = 'connected';
        connected = true;
        this.setData({
          statusText: '称量仪器已连接，就绪',
          statusEmoji: '🟢',
          statusClass: 'idle'
        });
        break;
      case 'disconnected':
        text = '已断开';
        cls = 'disconnected';
        this.setData({
          statusText: '称量仪器已断开连接',
          statusEmoji: '🔴',
          statusClass: 'idle',
          isOperating: false
        });
        break;
      default:
        text = detail || '空闲';
        cls = 'idle';
    }

    this.setData({
      connected: connected,
      isScanning: isScanning,
      isConnecting: isConnecting,
      connStateText: text,
      connStateClass: cls,
      deviceId: bleClient.deviceId || ''
    });
  },

  /**
   * 处理树莓派上报的数据 JSON (根据 type 区分)
   */
  _handleDeviceReport(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'weight':
        // 实时重量上报 {"type":"weight","value":15.32}
        const val = typeof data.value === 'number' ? data.value.toFixed(2) : data.value;
        this.setData({ currentWeight: val });
        break;

      case 'status':
        // 状态上报 {"type":"status","msg":"weighing"}
        this._mapMachineStatus(data.msg);
        break;

      case 'done':
        // 称量完成上报
        const finalVal = parseFloat(data.final) || 0;
        this.setData({
          currentWeight: finalVal.toFixed(2),
          isOperating: false,
          statusText: `称量动作完成，就绪`,
          statusEmoji: '✅',
          statusClass: 'idle'
        });
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'medium' });
        }
        break;
    }
  },

  /**
   * 重置配方投喂批次
   */
  resetRecipeBatch() {
    const list = this.data.recipeFeedList.map(item => ({
      ...item,
      status: 'pending',
      weighed_g: null
    }));

    this.setData({
      recipeFeedList: list,
      currentFeedIndex: 0,
      currentFeedItem: list[0],
      completedCount: 0,
      targetGrams: String(list[0].target_g),
      toleranceGrams: String(list[0].tolerance_g)
    });
    wx.showToast({ title: '已重置投喂任务', icon: 'success' });
  },

  /**
   * 状态字典映射 (clearing / weighing / checking / releasing / released / empty)
   */
  _mapMachineStatus(msg) {
    let text = msg;
    let emoji = '⚙️';
    let isOp = true;

    switch (msg) {
      case 'clearing':
        text = '传感器清零复位中…';
        emoji = '🧹';
        break;
      case 'weighing':
        text = '自动进料称量中…';
        emoji = '⚖️';
        break;
      case 'checking':
        text = '重量精度校验中…';
        emoji = '🔍';
        break;
      case 'releasing':
        text = '下方闸门开启放料中…';
        emoji = '⬇️';
        break;
      case 'released':
        text = '放料完毕，闸门已关闭';
        emoji = '✅';
        isOp = false;
        break;
      case 'empty':
        text = '料仓缺料/已空预警';
        emoji = '⚠️';
        isOp = false;
        break;
      case 'idle':
        text = '待机就绪';
        emoji = '💤';
        isOp = false;
        break;
      default:
        text = `运行中: ${msg}`;
    }

    this.setData({
      statusText: text,
      statusEmoji: emoji,
      isOperating: isOp,
      statusClass: isOp ? 'operating' : 'idle'
    });
  },

  // ==========================================
  // 用户操作与指令发送
  // ==========================================

  // 1. 搜索并连接
  handleScanAndConnect() {
    this.setData({ discoveredDevices: [] });
    wx.showLoading({ title: '正在搜索称量仪...' });

    bleClient.startScan(BLE_CONFIG.DEVICE_NAME)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已启动搜索，请靠近设备', icon: 'none' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ showTroubleModal: true });
      });
  },

  // 2. 断开连接
  handleDisconnect() {
    wx.showModal({
      title: '断开提示',
      content: '确定要断开与称量仪器的蓝牙连接吗？',
      success: (res) => {
        if (res.confirm) {
          bleClient.disconnect();
          wx.showToast({ title: '已断开连接', icon: 'none' });
        }
      }
    });
  },

  // 3. 开始自动称量当前配方原料 (点击后直接勾选完成，并自动推进下一步)
  handleStartCurrentFeedWeighing() {
    const list = this.data.recipeFeedList.slice();
    const currIdx = this.data.currentFeedIndex;
    const currItem = list[currIdx];

    if (!currItem) return;
    if (!this.data.connected) {
      wx.showToast({ title: '请先连接称量仪', icon: 'none' });
      return;
    }

    // 1. 发送 BLE 指令给树莓派驱动物理仪器
    bleClient.startWeighing(currItem.target_g, currItem.tolerance_g).catch(err => {
      console.warn('下发称量指令警告:', err);
    });

    // 2. 界面上直接勾选完成该项原料
    list[currIdx].status = 'done';
    const completed = list.filter(item => item.status === 'done').length;

    // 3. 找到下一个未完成的原料
    let nextIdx = list.findIndex(item => item.status !== 'done');
    let nextItem = nextIdx >= 0 ? list[nextIdx] : null;

    this.setData({
      recipeFeedList: list,
      completedCount: completed,
      currentFeedIndex: nextIdx >= 0 ? nextIdx : currIdx,
      currentFeedItem: nextItem || list[currIdx],
      targetGrams: nextItem ? String(nextItem.target_g) : this.data.targetGrams,
      toleranceGrams: nextItem ? String(nextItem.tolerance_g) : this.data.toleranceGrams,
      statusText: `正在称量投喂【${currItem.name}】(${currItem.target_g}g)...`,
      statusEmoji: '🚀',
      isOperating: true
    });

    if (completed === list.length) {
      wx.showModal({
        title: '🎉 配方投喂全部完成',
        content: '今日配方所有原料已全部完成投喂。',
        showCancel: false
      });
    } else if (nextItem) {
      wx.showToast({
        title: `【${currItem.name}】已完成！请加【${nextItem.name}】`,
        icon: 'none',
        duration: 2500
      });
    }
  },

  // 4. 自由模式开始称量
  handleStartWeighing() {
    const target = parseFloat(this.data.targetGrams);
    const tol = parseFloat(this.data.toleranceGrams);

    if (isNaN(target) || target <= 0) {
      wx.showToast({ title: '请输入有效的目标克数', icon: 'none' });
      return;
    }
    if (isNaN(tol) || tol < 0) {
      wx.showToast({ title: '请输入有效的误差克数', icon: 'none' });
      return;
    }
    if (!this.data.connected) {
      wx.showToast({ title: '请先连接称量仪', icon: 'none' });
      return;
    }

    this.setData({
      isOperating: true,
      statusText: `启动称量: 目标 ${target}g (误差 ±${tol}g)`,
      statusEmoji: '🚀',
      statusClass: 'operating'
    });

    bleClient.startWeighing(target, tol)
      .then(() => {
        wx.showToast({ title: `指令已下发`, icon: 'success' });
      })
      .catch((err) => {
        this.setData({ isOperating: false });
        wx.showToast({ title: err.message || '下发指令失败', icon: 'none', duration: 2500 });
      });
  },

  // 5. 实时读重
  handleReadWeight() {
    bleClient.readWeight()
      .then(() => {
        wx.showToast({ title: '已请求读重', icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '读取失败', icon: 'none' });
      });
  },

  // 6. 上方滑门开/关
  handleSlideOpen() {
    bleClient.controlSlide('open')
      .then(() => wx.showToast({ title: '滑门开启指令已发', icon: 'none' }))
      .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
  },
  handleSlideClose() {
    bleClient.controlSlide('close')
      .then(() => wx.showToast({ title: '滑门关闭指令已发', icon: 'none' }))
      .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
  },

  // 7. 下方闸门开/关
  handleGateOpen() {
    bleClient.controlGate('open')
      .then(() => wx.showToast({ title: '闸门开启指令已发', icon: 'none' }))
      .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
  },
  handleGateClose() {
    bleClient.controlGate('close')
      .then(() => wx.showToast({ title: '闸门关闭指令已发', icon: 'none' }))
      .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
  },

  // 8. 机器自检
  handleSelfTest() {
    wx.showLoading({ title: '自检指令发送中...' });
    bleClient.selfTest()
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '自检中，请观察仪器', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '发送自检失败', icon: 'none' });
      });
  },

  // 输入控制
  onTargetGramsInput(e) {
    this.setData({ targetGrams: e.detail.value });
  },
  onToleranceInput(e) {
    this.setData({ toleranceGrams: e.detail.value });
  },
  selectPresetTarget(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ targetGrams: String(val) });
  },
  selectPresetTolerance(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ toleranceGrams: String(val) });
  },

  // 日志管理
  toggleLogs() {
    this.setData({ showLogs: !this.data.showLogs });
  },
  clearLogs() {
    this.setData({ logs: [] });
    wx.showToast({ title: '日志已清空', icon: 'none' });
  },

  // 手动点击列表中搜索到的设备连接
  selectConnectDevice(e) {
    const devId = e.currentTarget.dataset.deviceId;
    wx.showLoading({ title: '正在连接设备…' });
    bleClient.connect(devId)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '连接成功！', icon: 'success' });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '连接失败', icon: 'none', duration: 2500 });
      });
  },

  openTroubleshootingModal() {
    this.setData({ showTroubleModal: true });
  },
  closeTroubleModal() {
    this.setData({ showTroubleModal: false });
  },
  stopPropagation() {}
});
