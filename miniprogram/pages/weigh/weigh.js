// miniprogram/pages/weigh/weigh.js
import { bleClient, BLE_CONFIG } from '../../utils/ble.js';

Page({
  data: {
    // 蓝牙状态
    connected: false,
    isConnecting: false,
    isScanning: false,
    connStateText: '未连接',
    connStateClass: 'disconnected',
    deviceId: '',

    // 称量与机器实时状态
    currentWeight: null,
    statusText: '待机就绪 (等待连接)',
    statusEmoji: '💤',
    statusClass: 'idle',
    isOperating: false,
    isWeighingRunning: false,

    // 称量参数输入
    targetGrams: '15',
    toleranceGrams: '2',
    presetTargets: [5, 10, 15, 20, 50, 100, 200, 500],
    presetTolerances: [1, 2, 3, 5],

    // 完成结果
    lastDoneResult: null,

    // 通信日志
    showLogs: false,
    logs: [],
    lastLogId: '',

    // 多设备搜索弹窗
    showDeviceModal: false,
    discoveredDevices: []
  },

  onLoad(options) {
    // 若从配方结果页跳转带入目标克数
    if (options && options.target) {
      const g = parseFloat(options.target);
      if (!isNaN(g) && g > 0) {
        this.setData({ targetGrams: String(Math.round(g)) });
      }
    }

    this._setupBleCallbacks();
  },

  onShow() {
    // 页面显示时同步连接状态
    this.setData({
      connected: bleClient.connected,
      deviceId: bleClient.deviceId || ''
    });
    if (bleClient.connected) {
      this._updateConnectionUI('connected', '已连接');
    }
  },

  onUnload() {
    // 页面卸载时停止搜索
    bleClient.stopScan();
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
      const list = this.data.discoveredDevices;
      if (!list.find(d => d.deviceId === device.deviceId)) {
        list.push(device);
        this.setData({ discoveredDevices: list });
      }
    };

    // 4. 监听通信日志
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
      if (logs.length > 60) logs.shift(); // 保持最新 60 条

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
          isOperating: false,
          isWeighingRunning: false
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
        // 称量完成上报 {"type":"done","result":"pass","target":15,"final":15.2}
        const finalVal = parseFloat(data.final) || 0;
        const targetVal = parseFloat(data.target) || 0;
        const diff = Number((finalVal - targetVal).toFixed(2));

        this.setData({
          lastDoneResult: {
            result: data.result || 'pass',
            target: targetVal,
            final: finalVal,
            diff: diff
          },
          currentWeight: finalVal.toFixed(2),
          isWeighingRunning: false,
          isOperating: false,
          statusText: data.result === 'pass' ? '称量完成（合格）' : (data.result === 'empty' ? '料仓已空，未达目标' : '称量完成（超差）'),
          statusEmoji: data.result === 'pass' ? '🎉' : '⚠️',
          statusClass: data.result === 'pass' ? 'pass' : 'fail'
        });

        // 震动提示
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'medium' });
        }
        break;
    }
  },

  /**
   * 状态字典映射 (clearing / weighing / checking / releasing / released / empty)
   */
  _mapMachineStatus(msg) {
    let text = msg;
    let emoji = '⚙️';
    let isOp = true;
    let isRunning = this.data.isWeighingRunning;

    switch (msg) {
      case 'clearing':
        text = '传感器清零复位中…';
        emoji = '🧹';
        break;
      case 'weighing':
        text = '自动进料称量中…';
        emoji = '⚖️';
        isRunning = true;
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
        isRunning = false;
        break;
      case 'empty':
        text = '料仓缺料/已空预警';
        emoji = '⚠️';
        isOp = false;
        isRunning = false;
        break;
      case 'idle':
        text = '待机就绪';
        emoji = '💤';
        isOp = false;
        isRunning = false;
        break;
      default:
        text = `运行中: ${msg}`;
    }

    this.setData({
      statusText: text,
      statusEmoji: emoji,
      isOperating: isOp,
      isWeighingRunning: isRunning,
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
        wx.showToast({ title: '搜索中,请靠近设备', icon: 'none' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showModal({
          title: '蓝牙连接提示',
          content: err.message || '请确保手机蓝牙已打开，且已授权微信使用蓝牙定位权限。',
          showCancel: false
        });
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

  // 3. 开始自动称量
  handleStartWeighing() {
    if (!this.data.connected) {
      wx.showToast({ title: '请先连接称量仪', icon: 'none' });
      return;
    }

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

    this.setData({
      isWeighingRunning: true,
      isOperating: true,
      lastDoneResult: null,
      statusText: `启动称量: 目标 ${target}g (误差 ±${tol}g)`,
      statusEmoji: '🚀',
      statusClass: 'operating'
    });

    bleClient.startWeighing(target, tol)
      .then(() => {
        wx.showToast({ title: '称量指令已下发', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ isWeighingRunning: false, isOperating: false });
        wx.showToast({ title: err.message || '下发指令失败', icon: 'none' });
      });
  },

  // 4. 实时读重
  handleReadWeight() {
    bleClient.readWeight()
      .then(() => {
        wx.showToast({ title: '已请求读重', icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '读取失败', icon: 'none' });
      });
  },

  // 5. 上方滑门开/关
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

  // 6. 下方闸门开/关
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

  // 7. 机器自检
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

  // 设备弹窗选择
  selectConnectDevice(e) {
    const devId = e.currentTarget.dataset.deviceId;
    this.setData({ showDeviceModal: false });
    bleClient.connect(devId).catch(err => {
      wx.showToast({ title: err.message || '连接失败', icon: 'none' });
    });
  },
  closeDeviceModal() {
    this.setData({ showDeviceModal: false });
  },
  stopPropagation() {}
});
