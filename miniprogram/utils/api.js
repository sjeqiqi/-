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

// 3. AI 通俗解读校准 (单次同步)
export function calibrateRation(calibrateRequest) {
  return request('/api/rations/calibrate', 'POST', calibrateRequest);
}

// 3.1 AI 深度思考真实原生 SSE 流式接口
export function calibrateRationStream(calibrateRequest, { onThinking, onContent, onDone, onError }) {
  let buffer = '';
  const requestTask = wx.request({
    url: `${BASE_URL}/api/rations/calibrate/stream`,
    method: 'POST',
    data: calibrateRequest,
    enableChunked: true,
    header: {
      'content-type': 'application/json'
    },
    success: (res) => {
      if (res.statusCode >= 400 && onError) {
        onError(new Error(`HTTP ${res.statusCode}`));
      }
    },
    fail: (err) => {
      if (onError) onError(err);
    }
  });

  requestTask.onChunkReceived((res) => {
    try {
      const chunkStr = decodeArrayBuffer(res.data);
      buffer += chunkStr;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留未完成的分块
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'thinking' && onThinking) {
              onThinking(parsed.chunk);
            } else if (parsed.type === 'content' && onContent) {
              onContent(parsed.chunk);
            } else if (parsed.type === 'done' && onDone) {
              onDone(parsed.ai_result);
            }
          }
        }
      }
    } catch (e) {
      console.warn('流式解码解析提示:', e);
    }
  });

  return requestTask;
}

function decodeArrayBuffer(buffer) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(buffer);
  }
  const bytes = new Uint8Array(buffer);
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      const c2 = bytes[i++];
      out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
    } else if (c > 223 && c < 240) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let u = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023));
    }
  }
  return out;
}

// 4. 健康检查
export function checkHealth() {
  return request('/api/health', 'GET');
}
