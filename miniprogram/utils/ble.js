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
  return String(uuid1).replace(/-/g, '').toLowerCase() === String(uuid2).replace(/-/g, '').toLowerCase();
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
    this.writeCharProps = {};
    this.notifyCharId = null;
    this.connected = false;
    this.connecting = false;
    this.scanning = false;
    
    // 粘包/拆包数据缓存
    this._rxBuffer = '';
    this._scanTimeoutTimer = null;

    // 回调列表
    this.onStateChange = null;     // (state, detail) => {}
    this.onDataReceived = null;    // (parsedJson, rawStr) => {}
    this.onDeviceDiscovered = null;// (device) => {}
    this.onLog = null;             // (type, msg) => {}  'tx' | 'rx' | 'info' | 'error'
    this.onScanTimeout = null;     // () => {}
  }

  log(type, msg) {
    const formattedType = type ? String(type).toUpperCase() : 'INFO';
    console.log(`[BLE-${formattedType}]`, msg);
    if (typeof this.onLog === 'function') {
      this.onLog(formattedType, msg);
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
            reject(new Error('请打开手机系统蓝牙并开启微信蓝牙授权'));
          } else {
            reject(new Error(err.errMsg || '蓝牙初始化不可用'));
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
   * 检查是否为目标称量仪
   */
  _isTargetDevice(dev, filterName) {
    const name = (dev.name || dev.localName || '').toLowerCase();
    const target = (filterName || BLE_CONFIG.DEVICE_NAME).toLowerCase();

    if (name.includes(target) || name.includes('weigh') || name.includes('raspberry') || name.includes('scale')) {
      return true;
    }

    if (dev.advertisServiceUUIDs && Array.isArray(dev.advertisServiceUUIDs)) {
      if (dev.advertisServiceUUIDs.some(u => matchUUID(u, BLE_CONFIG.SERVICE_UUID))) {
        return true;
      }
    }
    return false;
  }

  /**
   * 开始搜索称量仪器 (weigh-machine)
   */
  startScan(filterName = BLE_CONFIG.DEVICE_NAME, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (this._scanTimeoutTimer) clearTimeout(this._scanTimeoutTimer);

      this.init()
        .then(() => {
          this.scanning = true;
          this._updateState('scanning', '正在搜索附近的称量仪器…');

          const handleDiscoveredDevice = (dev) => {
            const name = dev.name || dev.localName || '未知名称设备';
            this.log('info', `发现设备: ${name} (${dev.deviceId}) RSSI: ${dev.RSSI}`);

            if (typeof this.onDeviceDiscovered === 'function') {
              this.onDeviceDiscovered(dev);
            }

            if (this._isTargetDevice(dev, filterName) && !this.connected && !this.connecting) {
              this.log('info', `🎯 匹配到目标称量仪器 [${name}]，正在发起自动连接…`);
              this.connect(dev.deviceId).catch(err => {
                this.log('error', `自动连接失败: ${err.message}`);
              });
            }
          };

          wx.onBluetoothDeviceFound((res) => {
            if (res && res.devices) {
              res.devices.forEach(handleDiscoveredDevice);
            }
          });

          wx.startBluetoothDevicesDiscovery({
            allowDuplicatesKey: false,
            interval: 200,
            success: (res) => {
              this.log('info', '蓝牙低功耗搜索已成功启动');

              setTimeout(() => {
                if (wx.getBluetoothDevices) {
                  wx.getBluetoothDevices({
                    success: (dRes) => {
                      if (dRes && dRes.devices) {
                        dRes.devices.forEach(handleDiscoveredDevice);
                      }
                    }
                  });
                }
              }, 400);

              this._scanTimeoutTimer = setTimeout(() => {
                if (this.scanning && !this.connected && !this.connecting) {
                  this.log('info', '搜索达到超时时间，停止主动扫描');
                  this.stopScan();
                  if (typeof this.onScanTimeout === 'function') {
                    this.onScanTimeout();
                  }
                }
              }, timeoutMs);

              resolve(res);
            },
            fail: (err) => {
              this.scanning = false;
              this._updateState('idle', '搜索启动失败');
              reject(new Error(err.errMsg || '启动搜索失败，请检查定位或蓝牙权限'));
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
    if (this._scanTimeoutTimer) {
      clearTimeout(this._scanTimeoutTimer);
      this._scanTimeoutTimer = null;
    }
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
          // 无任何配对/bonding/加密协商操作，直接纯净发现服务
          this._discoverServicesAndChars().then(resolve).catch(reject);
        },
        fail: (err) => {
          this.connecting = false;
          this.connected = false;
          this._updateState('disconnected', '连接失败');
          this.log('error', `连接设备失败: ${err.errMsg || JSON.stringify(err)}`);
          reject(new Error(err.errMsg || '连接失败，请确认设备距离且未被其他手机连接'));
        }
      });
    });
  }

  /**
   * 发现服务与特征值
   */
  _discoverServicesAndChars() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        wx.getBLEDeviceServices({
          deviceId: this.deviceId,
          success: (res) => {
            this.log('info', `发现服务列表 (${res.services.length}个): ${JSON.stringify(res.services.map(s => s.uuid))}`);
            
            let targetService = res.services.find(s => matchUUID(s.uuid, BLE_CONFIG.SERVICE_UUID));
            if (!targetService && res.services.length > 0) {
              targetService = res.services.find(s => s.isPrimary) || res.services[0];
              this.log('info', `未精确匹配到设定服务UUID，使用设备可用主服务: ${targetService.uuid}`);
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
      }, 400);
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

          let writeChar = res.characteristics.find(c => matchUUID(c.uuid, BLE_CONFIG.WRITE_CHAR_UUID));
          if (!writeChar) {
            writeChar = res.characteristics.find(c => c.properties.write || c.properties.writeNoResponse);
          }

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
          this.writeCharProps = writeChar.properties || {};
          this.notifyCharId = notifyChar.uuid;

          this.log('info', `已绑定特征值: Write=${this.writeCharId}, Notify=${this.notifyCharId}`);

          this._enableNotification()
            .then(() => {
              this.connecting = false;
              this.connected = true;
              this._updateState('connected', '已成功连接称量仪器');
              this.log('info', '称量仪器准备就绪，已开启数据双向通信');
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
    this._processRxBuffer();
  }

  _processRxBuffer() {
    while (true) {
      const startIndex = this._rxBuffer.indexOf('{');
      if (startIndex === -1) {
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
      // 优先尝试单包整包写入（绝大多数 BLE 4.2/5.0 设备支持），失败时自动尝试分片
      this._writeSingleOrChunked(buffer)
        .then(() => resolve())
        .catch(reject);
    });
  }

  /**
   * 整包直接写入与分片回退机制
   */
  _writeSingleOrChunked(buffer) {
    return new Promise((resolve, reject) => {
      const preferNoResp = this.writeCharProps && this.writeCharProps.writeNoResponse && !this.writeCharProps.write;
      const primaryType = preferNoResp ? 'writeNoResponse' : 'write';
      const fallbackType = preferNoResp ? 'write' : 'writeNoResponse';

      const tryDirectWrite = (wType, isFallback = false) => {
        wx.writeBLECharacteristicValue({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.writeCharId,
          value: buffer,
          writeType: wType,
          success: (res) => {
            resolve(res);
          },
          fail: (err) => {
            if (!isFallback) {
              this.log('info', `整包(${wType})写入异常(${err.errMsg || 'GATT ERR'})，尝试 ${fallbackType} 模式…`);
              tryDirectWrite(fallbackType, true);
            } else {
              // 两种模式整包均失败，尝试分片发送
              this.log('info', `整包写入未被接收，启用分片传输…`);
              this._writeInChunks(buffer, 20).then(resolve).catch(reject);
            }
          }
        });
      };

      tryDirectWrite(primaryType, false);
    });
  }

  /**
   * 分片写入数据
   */
  _writeInChunks(buffer, chunkSize = 20) {
    return new Promise((resolve, reject) => {
      const totalBytes = buffer.byteLength;
      let offset = 0;

      const sendNext = () => {
        if (offset >= totalBytes) {
          resolve();
          return;
        }
        const curSize = Math.min(chunkSize, totalBytes - offset);
        const chunkBuf = buffer.slice(offset, offset + curSize);

        wx.writeBLECharacteristicValue({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.writeCharId,
          value: chunkBuf,
          writeType: 'writeNoResponse',
          success: () => {
            offset += curSize;
            setTimeout(sendNext, 30);
          },
          fail: (err) => {
            // 尝试以 write 模式发送此分片
            wx.writeBLECharacteristicValue({
              deviceId: this.deviceId,
              serviceId: this.serviceId,
              characteristicId: this.writeCharId,
              value: chunkBuf,
              writeType: 'write',
              success: () => {
                offset += curSize;
                setTimeout(sendNext, 30);
              },
              fail: (fErr) => reject(new Error(fErr.errMsg || '分片写入失败'))
            });
          }
        });
      };

      sendNext();
    });
  }

  // ==========================================
  // 业务指令封装 (发给树莓派)
  // ==========================================

  /**
   * 1. 启动自动称量
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
   */
  controlGate(action) {
    return this.sendCommand({
      cmd: 'gate',
      action: action
    });
  }

  /**
   * 4. 控制上方滑门
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
    if (this._scanTimeoutTimer) {
      clearTimeout(this._scanTimeoutTimer);
      this._scanTimeoutTimer = null;
    }
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
