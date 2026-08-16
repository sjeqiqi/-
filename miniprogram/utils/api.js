// miniprogram/utils/api.js

const ENV_ID = 'prod-d1gcd8sm9cea90836';
const SERVICE_NAME = 'django-olww';
const BASE_URL = 'https://django-olww-297810-6-1469616598.sh.run.tcloudbase.com';

/**
 * 统一网络请求封装
 * 优先使用微信原生云托管调用（免域名、免备案，真机和体验版完全放行）
 * 若不在微信云环境或开发调试时，自动回退到标准 HTTPS
 */
export function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
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
            // 云调用返回非 200 尝试备用 HTTPS 请求
            fallbackHttpRequest(path, method, data, resolve, reject, res.statusCode);
          }
        },
        fail: (cloudErr) => {
          console.warn('wx.cloud.callContainer 失败，尝试备用 HTTPS 请求:', cloudErr);
          fallbackHttpRequest(path, method, data, resolve, reject);
        }
      });
    } else {
      fallbackHttpRequest(path, method, data, resolve, reject);
    }
  });
}

function fallbackHttpRequest(path, method, data, resolve, reject, cloudStatusCode = null) {
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
      } else {
        const msg = (res.data && res.data.detail && (res.data.detail.message || res.data.detail)) || `请求失败 (${res.statusCode})`;
        reject(new Error(msg));
      }
    },
    fail: (err) => {
      const codeMsg = cloudStatusCode ? ` (${cloudStatusCode})` : '';
      reject(new Error(err.errMsg || `网络连接异常${codeMsg}`));
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
