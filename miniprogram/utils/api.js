// miniprogram/utils/api.js

const app = getApp();

const ENV_ID = 'prod';
const SERVICE_NAME = 'django-olww';
const FALLBACK_BASE_URL = 'https://django-olww-297810-6-1469616598.sh.run.tcloudbase.com';

/**
 * 统一网络请求封装
 * 优先使用 wx.cloud.callContainer（微信原生云托管直连，免域名免备案）
 * 若不在微信云环境或调用失败，自动降级为标准 wx.request 请求
 */
export function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    // 优先尝试微信云托管 callContainer
    if (wx.cloud && typeof wx.cloud.callContainer === 'function') {
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
          console.warn('wx.cloud.callContainer 失败，尝试降级为 wx.request:', cloudErr);
          // 降级为 wx.request
          fallbackHttpRequest(path, method, data, resolve, reject);
        }
      });
    } else {
      fallbackHttpRequest(path, method, data, resolve, reject);
    }
  });
}

function fallbackHttpRequest(path, method, data, resolve, reject) {
  wx.request({
    url: `${FALLBACK_BASE_URL}${path}`,
    method: method,
    data: data,
    header: {
      'content-type': 'application/json'
    },
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data);
      } else {
        const msg = (res.data && res.data.detail && (res.data.detail.message || res.data.detail)) || `请求失败 (${res.statusCode})`;
        reject(new Error(msg));
      }
    },
    fail: (err) => {
      console.error('wx.request 网络请求失败:', err);
      reject(new Error(err.errMsg || '网络连接异常，请稍后重试'));
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
