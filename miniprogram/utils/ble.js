// miniprogram/utils/ble.js
/**
 * 自动称量仪器（树莓派 BLE 外设）蓝牙通信模块
 * 
 * 连接配置：
 * - 设备名：weigh-machine
 * - 服务 UUID：12345678-1234-5678-1234-56789abcdef0
 * - 指令特征值 (WRITE)：12345678-1234-5678-1234-56789abcdef1
 * - 数据特征值 (NOTIFY)：12345678-1234-5678-1234-56789abcdef2
 */

export const BLE_CONFIG = {
  DEVICE_NAME: 'weigh-machine',
  SERVICE_UUID: '12345678-1234-5678-1234-56789abcdef0',
  WRITE_CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1',
  NOTIFY_CHAR_UUID: '12345678-1234-5678-1234-56789abcdef2',
};

/**
 * 比较 UUID（忽略大小写与中划线差异）
 */
export function matchUUID(uuid1, uuid2) {
  if (!uuid1 || !uuid2) return false;
  return uuid1.replace(/-/g, '').toLowerCase() === uuid2.replace(/-/g, '').toLowerCase();
}

/**
 * 纯 JS 跨平台 UTF-8 字符串转 ArrayBuffer
 */
export function stringToBuffer(str) {
  const utf8 = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) {
      utf8.push(charcode);
    } else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6),
                0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
    } else {
      // 代理对
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(0xf0 | (charcode >> 18),
                0x80 | ((charcode >> 12) & 0x3f),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
    }
  }
  const buffer = new ArrayBuffer(utf8.length);
  const dataView = new Uint8Array(buffer);
  for (let i = 0; i < utf8.length; i++) {
    dataView[i] = utf8[i];
  }
  return buffer;
}

/**
 * 纯 JS 跨平台 ArrayBuffer 转 UTF-8 字符串
 */
export function bufferToString(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c >> 7 === 0) {
      out += String.fromCharCode(c);
    } else if (c >> 5 === 0x06) {
      const c2 = bytes[i++];
      out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
    } else if (c >> 4 === 0x0e) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    } else if (c >> 3 === 0x1e) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let u = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
    }
  }
  return out;
}

/**
 * 蓝牙状态与连接管理类
 */
export class BleWeighClient {
  constructor() {
    this.deviceId = null;
    this.serviceId = null;
    this.writeCharId = null;
    this.notifyCharId = null;
    this.connected = false;
    this.connecting = false;
    this.scanning = false;
    
    // 粘包/拆包数据缓存
    this._rxBuffer = '';

    // 回调列表
    this.onStateChange = null;     // (state, detail) => {}
    this.onDataReceived = null;    // (parsedJson, rawStr) => {}
    this.onDeviceDiscovered = null;// (device) => {}
    this.onLog = null;             // (type, msg) => {}  'tx' | 'rx' | 'info' | 'error'
  }

  log(type, msg) {
    console.log(`[BLE-${type.toUpperCase()}]`, msg);
    if (typeof this.onLog === 'function') {
      this.onLog(type, msg);
    }
  }

  /**
   * 初始化手机蓝牙适配器
   */
  init() {
    return new Promise((resolve, reject) => {
      wx.openBluetoothAdapter({
        success: (res) => {
          this.log('info', '蓝牙适配器初始化成功');
          this._listenAdapterState();
          resolve(res);
        },
        fail: (err) => {
          this.log('error', `初始化蓝牙失败: ${err.errMsg || JSON.stringify(err)}`);
          if (err.errCode === 10001) {
            reject(new Error('请打开手机系统蓝牙并授权微信使用蓝牙'));
          } else {
            reject(new Error(err.errMsg || '蓝牙不可用'));
          }
        }
      });
    });
  }

  _listenAdapterState() {
    wx.onBluetoothAdapterStateChange((res) => {
      if (!res.available) {
        this.log('error', '手机蓝牙已关闭');
        this._handleDisconnect('蓝牙被关闭');
      }
    });
  }

  /**
   * 开始搜索称量仪器 (weigh-machine)
   */
  startScan(filterName = BLE_CONFIG.DEVICE_NAME) {
    return new Promise((resolve, reject) => {
      this.init()
        .then(() => {
          this.scanning = true;
          this._updateState('scanning', '正在搜索称量仪器…');

          // 监听搜索到的设备
          wx.onBluetoothDeviceFound((res) => {
            res.devices.forEach((dev) => {
              const name = dev.name || dev.localName || '';
              if (name) {
                this.log('info', `发现设备: ${name} (${dev.deviceId}) RSSI: ${dev.RSSI}`);
              }
              if (typeof this.onDeviceDiscovered === 'function') {
                this.onDeviceDiscovered(dev);
              }
              // 自动匹配设备名
              if (filterName && name.toLowerCase().includes(filterName.toLowerCase())) {
                this.log('info', `匹配到目标称量仪: ${name}，准备连接`);
                this.connect(dev.deviceId).catch(err => {
                  this.log('error', `自动连接失败: ${err.message}`);
                });
              }
            });
          });

          // 启动搜索
          wx.startBluetoothDevicesDiscovery({
            allowDuplicatesKey: false,
            interval: 300,
            success: (res) => {
              this.log('info', '蓝牙搜索已启动');
              resolve(res);
            },
            fail: (err) => {
              this.scanning = false;
              this._updateState('idle', '搜索启动失败');
              reject(new Error(err.errMsg || '启动搜索失败'));
            }
          });
        })
        .catch(reject);
    });
  }

  /**
   * 停止搜索
   */
  stopScan() {
    return new Promise((resolve) => {
      this.scanning = false;
      wx.stopBluetoothDevicesDiscovery({
        complete: () => {
          this.log('info', '蓝牙搜索已停止');
          resolve();
        }
      });
    });
  }

  /**
   * 连接指定设备并发现服务与特征值
   */
  connect(deviceId) {
    if (this.connecting) return Promise.reject(new Error('正在连接中，请稍候'));
    this.connecting = true;
    this.deviceId = deviceId;
    this._updateState('connecting', '正在建立蓝牙连接…');

    return new Promise((resolve, reject) => {
      this.stopScan();

      wx.createBLEConnection({
        deviceId: this.deviceId,
        timeout: 15000,
        success: (res) => {
          this.log('info', `已建立物理连接: ${this.deviceId}`);
          this._listenConnectionState();

          // 尝试设置 MTU（Android 支持）
          if (wx.setBLEMTU) {
            wx.setBLEMTU({
              deviceId: this.deviceId,
              mtu: 512,
              complete: () => {
                this._discoverServicesAndChars().then(resolve).catch(reject);
              }
            });
          } else {
            this._discoverServicesAndChars().then(resolve).catch(reject);
          }
        },
        fail: (err) => {
          this.connecting = false;
          this.connected = false;
          this._updateState('disconnected', '连接失败');
          this.log('error', `连接设备失败: ${err.errMsg}`);
          reject(new Error(err.errMsg || '连接失败'));
        }
      });
    });
  }

  /**
   * 发现服务与特征值
   */
  _discoverServicesAndChars() {
    return new Promise((resolve, reject) => {
      // 延时 300ms 保证连接稳定后再查服务
      setTimeout(() => {
        wx.getBLEDeviceServices({
          deviceId: this.deviceId,
          success: (res) => {
            this.log('info', `发现服务列表 (${res.services.length}个): ${JSON.stringify(res.services.map(s => s.uuid))}`);
            
            // 匹配目标服务 UUID，若未找到则默认取首个主服务或全特征值扫描
            let targetService = res.services.find(s => matchUUID(s.uuid, BLE_CONFIG.SERVICE_UUID));
            if (!targetService && res.services.length > 0) {
              targetService = res.services.find(s => s.isPrimary) || res.services[0];
              this.log('info', `未精确匹配到设定服务UUID，使用可用服务: ${targetService.uuid}`);
            }

            if (!targetService) {
              return reject(new Error('未在设备上找到可用蓝牙服务'));
            }

            this.serviceId = targetService.uuid;
            this._getCharacteristics(this.serviceId)
              .then(resolve)
              .catch(reject);
          },
          fail: (err) => {
            this.log('error', `获取服务列表失败: ${err.errMsg}`);
            reject(new Error(err.errMsg || '获取服务列表失败'));
          }
        });
      }, 300);
    });
  }

  /**
   * 发现特征值并开启 Notify 订阅
   */
  _getCharacteristics(serviceId) {
    return new Promise((resolve, reject) => {
      wx.getBLEDeviceCharacteristics({
        deviceId: this.deviceId,
        serviceId: serviceId,
        success: (res) => {
          this.log('info', `特征值列表 (${res.characteristics.length}个): ${JSON.stringify(res.characteristics.map(c => ({ uuid: c.uuid, props: c.properties })))}`);

          // 匹配写入特征值 (WRITE / writeWithoutResponse)
          let writeChar = res.characteristics.find(c => matchUUID(c.uuid, BLE_CONFIG.WRITE_CHAR_UUID));
          if (!writeChar) {
            writeChar = res.characteristics.find(c => c.properties.write || c.properties.writeNoResponse);
          }

          // 匹配通知特征值 (NOTIFY / indicate)
          let notifyChar = res.characteristics.find(c => matchUUID(c.uuid, BLE_CONFIG.NOTIFY_CHAR_UUID));
          if (!notifyChar) {
            notifyChar = res.characteristics.find(c => c.properties.notify || c.properties.indicate);
          }

          if (!writeChar) {
            return reject(new Error('未找到可写入指令的特征值'));
          }
          if (!notifyChar) {
            return reject(new Error('未找到可接收通知数据的特征值'));
          }

          this.writeCharId = writeChar.uuid;
          this.notifyCharId = notifyChar.uuid;

          this.log('info', `绑定特征值: Write=${this.writeCharId}, Notify=${this.notifyCharId}`);

          // 开启特征值订阅
          this._enableNotification()
            .then(() => {
              this.connecting = false;
              this.connected = true;
              this._updateState('connected', '已成功连接称量仪器');
              this.log('info', '称量仪器准备就绪，已开启数据监听');
              resolve();
            })
            .catch(reject);
        },
        fail: (err) => {
          this.log('error', `获取特征值失败: ${err.errMsg}`);
          reject(new Error(err.errMsg || '获取特征值失败'));
        }
      });
    });
  }

  /**
   * 启用 Notify 监听
   */
  _enableNotification() {
    return new Promise((resolve, reject) => {
      wx.notifyBLECharacteristicValueChange({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.notifyCharId,
        state: true,
        success: (res) => {
          this.log('info', `Notify 订阅成功: ${this.notifyCharId}`);
          
          // 监听接收数据
          wx.onBLECharacteristicValueChange((charRes) => {
            if (matchUUID(charRes.characteristicId, this.notifyCharId)) {
              this._handleIncomingData(charRes.value);
            }
          });

          resolve(res);
        },
        fail: (err) => {
          this.log('error', `Notify 订阅失败: ${err.errMsg}`);
          reject(new Error(err.errMsg || '开启数据订阅失败'));
        }
      });
    });
  }

  /**
   * 处理树莓派上报的 BLE 数据 (解析 JSON 文本并解包)
   */
  _handleIncomingData(buffer) {
    const chunk = bufferToString(buffer);
    this._rxBuffer += chunk;
    
    // 尝试从缓冲区提取完整的 JSON 对象（处理换行或多包传输）
    this._processRxBuffer();
  }

  _processRxBuffer() {
    // 循环提取完整的 { ... } JSON 结构
    while (true) {
      const startIndex = this._rxBuffer.indexOf('{');
      if (startIndex === -1) {
        // 无 JSON 起始符，清除非必要噪音
        if (this._rxBuffer.length > 500) this._rxBuffer = '';
        break;
      }

      let depth = 0;
      let endIndex = -1;
      let inString = false;
      let escape = false;

      for (let i = startIndex; i < this._rxBuffer.length; i++) {
        const char = this._rxBuffer[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }

      if (endIndex !== -1) {
        const jsonStr = this._rxBuffer.substring(startIndex, endIndex + 1);
        this._rxBuffer = this._rxBuffer.substring(endIndex + 1);

        try {
          const parsed = JSON.parse(jsonStr);
          this.log('rx', jsonStr);
          if (typeof this.onDataReceived === 'function') {
            this.onDataReceived(parsed, jsonStr);
          }
        } catch (e) {
          this.log('error', `JSON 解析异常: ${jsonStr}`);
        }
      } else {
        // 尚未接收完整 JSON，等待下一个数据包
        break;
      }
    }
  }

  /**
   * 向树莓派指令特征值写入 JSON 指令
   */
  sendCommand(jsonObj) {
    if (!this.connected || !this.deviceId || !this.writeCharId) {
      return Promise.reject(new Error('称量仪尚未连接'));
    }

    const jsonStr = JSON.stringify(jsonObj);
    this.log('tx', jsonStr);
    const buffer = stringToBuffer(jsonStr);

    return new Promise((resolve, reject) => {
      // 检查包大小，若 <= 20 字节直接单包发送，否则分片发送
      this._writeBufferInChunks(buffer)
        .then(() => resolve())
        .catch(reject);
    });
  }

  /**
   * 分包写入数据（确保在低版本 BLE 协议下不超 20 字节 MTU 限制）
   */
  _writeBufferInChunks(buffer, chunkSize = 20) {
    return new Promise((resolve, reject) => {
      const totalBytes = buffer.byteLength;
      if (totalBytes <= chunkSize) {
        wx.writeBLECharacteristicValue({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.writeCharId,
          value: buffer,
          success: resolve,
          fail: (err) => reject(new Error(err.errMsg || '写入指令失败'))
        });
        return;
      }

      let offset = 0;
      const sendNextChunk = () => {
        if (offset >= totalBytes) {
          resolve();
          return;
        }
        const currentChunkSize = Math.min(chunkSize, totalBytes - offset);
        const subBuffer = buffer.slice(offset, offset + currentChunkSize);
        
        wx.writeBLECharacteristicValue({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.writeCharId,
          value: subBuffer,
          success: () => {
            offset += currentChunkSize;
            setTimeout(sendNextChunk, 20); // 间隔 20ms 避免拥塞
          },
          fail: (err) => reject(new Error(err.errMsg || '写入指令分包失败'))
        });
      };

      sendNextChunk();
    });
  }

  // ==========================================
  // 业务指令封装 (发给树莓派)
  // ==========================================

  /**
   * 1. 启动自动称量
   * @param {number} targetGrams - 目标克数 (例如 15)
   * @param {number} toleranceGrams - 允许误差 (例如 2)
   */
  startWeighing(targetGrams, toleranceGrams = 2) {
    return this.sendCommand({
      cmd: 'weigh',
      target: parseFloat(targetGrams),
      tolerance: parseFloat(toleranceGrams)
    });
  }

  /**
   * 2. 读取一次实时重量
   */
  readWeight() {
    return this.sendCommand({
      cmd: 'weight'
    });
  }

  /**
   * 3. 控制下方闸门
   * @param {'open' | 'close'} action
   */
  controlGate(action) {
    return this.sendCommand({
      cmd: 'gate',
      action: action
    });
  }

  /**
   * 4. 控制上方滑门
   * @param {'open' | 'close'} action
   */
  controlSlide(action) {
    return this.sendCommand({
      cmd: 'slide',
      action: action
    });
  }

  /**
   * 5. 设备自检
   */
  selfTest() {
    return this.sendCommand({
      cmd: 'selftest'
    });
  }

  /**
   * 断开蓝牙连接
   */
  disconnect() {
    if (this.deviceId) {
      wx.closeBLEConnection({
        deviceId: this.deviceId,
        complete: () => {
          this._handleDisconnect('用户主动断开');
        }
      });
    }
  }

  _listenConnectionState() {
    wx.onBLEConnectionStateChange((res) => {
      if (res.deviceId === this.deviceId && !res.connected) {
        this.log('error', '设备已断开连接');
        this._handleDisconnect('蓝牙链路断开');
      }
    });
  }

  _handleDisconnect(reason = '') {
    this.connected = false;
    this.connecting = false;
    this.scanning = false;
    this._rxBuffer = '';
    this._updateState('disconnected', reason || '已断开');
  }

  _updateState(state, detail = '') {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(state, detail);
    }
  }
}

// 导出单例实例
export const bleClient = new BleWeighClient();
