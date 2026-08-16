// miniprogram/utils/api.js

const ENV_ID = 'prod';
const SERVICE_NAME = 'django-olww';
const BASE_URL = 'https://django-olww-297810-6-1469616598.sh.run.tcloudbase.com';

/**
 * 统一网络请求封装
 * 优先使用标准 HTTPS 请求已部署的云托管服务，并在特定需要时回退至微信云原生调用
 */
export function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    // 优先使用标准 HTTP/HTTPS 请求
    wx.request({
      url: `${BASE_URL}${path}`,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 404 && wx.cloud && typeof wx.cloud.callContainer === 'function') {
          // 若 HTTP 404 尝试云调用
          tryCallContainer(path, method, data, resolve, reject);
        } else {
          const msg = (res.data && res.data.detail && (res.data.detail.message || res.data.detail)) || `请求失败 (${res.statusCode})`;
          reject(new Error(msg));
        }
      },
      fail: (err) => {
        // 若网络失败，尝试微信原生云调用
        if (wx.cloud && typeof wx.cloud.callContainer === 'function') {
          tryCallContainer(path, method, data, resolve, reject);
        } else {
          reject(new Error(err.errMsg || '网络连接异常，请检查网络设置'));
        }
      }
    });
  });
}

function tryCallContainer(path, method, data, resolve, reject) {
  wx.cloud.callContainer({
    config: {
      env: ENV_ID,
    },
    path: path,
    header: {
      'X-WX-SERVICE': SERVICE_NAME,
      'content-type': 'application/json'
    },
    method: method,
    data: data,
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data);
      } else {
        const msg = (res.data && res.data.detail && (res.data.detail.message || res.data.detail)) || `请求失败 (${res.statusCode})`;
        reject(new Error(msg));
      }
    },
    fail: (cloudErr) => {
      reject(new Error(cloudErr.errMsg || '云托管通信失败'));
    }
  });
}

// 1. 获取原料库
export function fetchFeeds() {
  return request('/api/feeds', 'GET');
}

// 2. 计算日粮配方
export function calculateRation(calculateRequest) {
  return request('/api/rations/calculate', 'POST', calculateRequest);
}

// 3. AI 通俗解读校准
export function calibrateRation(calibrateRequest) {
  return request('/api/rations/calibrate', 'POST', calibrateRequest);
}

// 4. 健康检查
export function checkHealth() {
  return request('/api/health', 'GET');
}
