# 奶山羊日粮配比助手 · 原版小程序UI网页端（Web/H5）部署交接技术文档

> **文档性质**：生产级部署与实施交付规范  
> **适用对象**：外包技术员、全栈工程师、云运维人员、前端/后端开发人员  
> **文档版本**：v1.0.0 (Release)  
> **工程目录**：`d:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/`

---

## 一、 任务背景与核心结论

### 1. 业务目标
将原有微信小程序（Miniprogram）的“奶山羊常用原料日粮配比助手”完整移植并在 Web 网页端（支持电脑端浏览器与手机端 H5）上线部署，使用户无需安装微信或小程序即可直接通过浏览器 URL 访问并使用全部功能。

### 2. 技术员必看核心结论（省时关键）
- **无需手动重写或转换 WXML/WXSS**：
  微信小程序的 WXML/WXSS 属于私有标签，无法直接由 Web 服务器解析运行。但本项目**已在 `frontend/` 目录中完成了 100% 像素级复刻的现代 Web/H5 生产级前端工程**（基于 React 18 + TypeScript + Vite）。
- **界面、视觉与交互 1:1 精准对齐**：
  包括牧场规模化/单只模式、优势主产区价格行情联动、推荐/自选原料库、深绿/大地棕主色调卡片设计、DeepSeek-Flash 四阶段思考链推演终端、配方结果看板、营养达标雷达复核表以及用户服务协议弹窗等。
- **开箱即用的预构建单文件（SingleFile HTML）**：
  在 `frontend/dist/index.html` 中已预先编译出**单一自包含 HTML 文件**（约 230 KB），JS、CSS、SVG 图标等资源全部内联封装，**零外部相对路径断链风险**，可直接部署在任意 Web 服务器或静态空间上。
- **零后端依赖的高可用架构**：
  日粮运筹优化算法（两阶段单纯形法 + 10g 离散自愈）已 100% 浏览器本地化；DeepSeek AI 审核具备官方直连与国家标准降级保障。**哪怕不部署任何后端服务器，前端网页也能 100% 独立离线稳定运行！**

---

## 二、 代码目录与交付资产速览

```text
奶山羊日粮配比助手_源码_2026-08-07/
├── frontend/                          ★【本次部署核心工作目录】
│   ├── dist/
│   │   └── index.html                 ★ 生产级打包产物（单文件全内联HTML，约230KB）
│   ├── public/
│   │   ├── favicon.ico                ★ 网站 Favicon 图标 (32x32)
│   │   └── icon.png                   ★ 应用高清绿底食槽天平图标 (192x192)
│   ├── src/                           ★ 前端完整源码 (React + TypeScript + Vite)
│   │   ├── components/
│   │   │   ├── StepAnimal.tsx         # 第一步：牧场信息与产区选择
│   │   │   ├── StepFeeds.tsx          # 第二步：原料清单与价格设置
│   │   │   └── StepResult.tsx         # 第三步：DeepSeek推演与配方看板
│   │   ├── calculator/                # 浏览器端纯本地运筹规划与10g自愈计算引擎
│   │   ├── api.ts                     # API 客户端 (本地引擎 + DeepSeek直连 + 云端降级)
│   │   ├── styles.css                 # 1:1 像素复刻小程序的完整样式表
│   │   └── App.tsx                    # 顶层状态与步骤流转
│   ├── Dockerfile                     ★ 生产多阶段 Docker 容器构建文件（已就绪）
│   ├── docker-compose.yml             ★ 一键部署编排文件（已就绪）
│   ├── nginx.conf                     ★ 调优好的生产 Nginx 配置文件（已就绪）
│   ├── package.json                   # 依赖配置
│   └── vite.config.ts                 # 单文件构建配置
│
├── backend/                           【可选后端（FastAPI）】
│   ├── app/
│   │   ├── main.py                    # FastAPI 入口
│   │   ├── optimizer.py               # Python 端日粮线性规划引擎
│   │   └── ai.py                      # Python 端 DeepSeek/AI 调度服务
│   └── requirements.txt
│
└── miniprogram/                       【原版微信小程序源码，仅作历史对比参考】
    ├── pages/ (index, feeds, result, weigh)
    └── app.json
```

---

## 三、 推荐部署方案（任选其一即可）

### 方案 1：宝塔面板 / 纯静态托管部署（最快，≤ 1 分钟）
> 适合拥有云服务器（CentOS / Ubuntu / Debian）并已安装宝塔面板（BT-Panel）的环境。

1. **新建站点**：
   - 登录宝塔面板 -> 点击【网站】->【添加站点】。
   - 填写您的绑定域名（例如 `goat.yourdomain.com`，未备案可填 `IP:端口`），根目录保持默认。
   - PHP 版本选择【纯静态】（Pure Static），点击【提交】。
2. **上传产物文件**：
   - 点击站点目录进入根路径，清空默认生成的 `index.html` 和 `404.html`。
   - 将 `frontend/dist/index.html` 上传到站点根目录。
   - 将 `frontend/public/` 下的 `favicon.ico` 与 `icon.png` 复制上传到站点根目录。
3. **配置 SSL 证书（强烈推荐）**：
   - 在站点设置中打开【SSL】，申请免费的 Let's Encrypt 证书并勾选【强制 HTTPS】。
   - *注：开启 HTTPS 可确保在微信内置浏览器或手机扫码访问时不会弹出安全或外链告警。*
4. **验证访问**：
   - 手机或电脑浏览器打开 `https://goat.yourdomain.com` 即可直接使用！

---

### 方案 2：原生 Nginx 生产环境部署（推荐企业级方案）
> 适合使用 Linux 原生云主机（无需宝塔）的技术员。

#### 1. 上传文件
在服务器创建 Web 目录（例如 `/var/www/goat-ration`）：
```bash
mkdir -p /var/www/goat-ration
```
将项目 `frontend/dist/index.html` 以及 `frontend/public/*` 复制或 SCP 到服务器 `/var/www/goat-ration/` 下。

#### 2. 配置 Nginx 虚拟主机
在 `/etc/nginx/conf.d/goat_ration.conf`（或 `/etc/nginx/sites-available/`）中添加如下配置：

```nginx
server {
    listen 80;
    server_name goat.yourdomain.com; # 替换为实际域名或服务器IP

    # 生产建议重定向至 HTTPS
    # return 301 https://$host$request_uri;

    root /var/www/goat-ration;
    index index.html;

    # 开启 Gzip 极速压缩
    gzip on;
    gzip_min_length 1k;
    gzip_buffers 4 16k;
    gzip_http_version 1.1;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_vary on;

    # SPA 路由兜底
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源强缓存
    location ~* \.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # 【可选配置】如果技术员在同一台服务器自建并运行了 Python FastAPI 后端(8000端口)
    # 取消下方注释即可实现反向代理，解决前端与后端跨域问题：
    # location /api/ {
    #     proxy_pass http://127.0.0.1:8000/api/;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto $scheme;
    # }
}
```

#### 3. 测试与平滑重启
```bash
nginx -t
systemctl reload nginx
```

---

### 方案 3：Docker / Docker Compose 一键容器化部署
> 适合熟悉容器化部署的技术员，项目已内置开箱即用的 `Dockerfile` 与 `docker-compose.yml`。

1. **进入前端源码目录**：
   ```bash
   cd frontend
   ```
2. **执行一键构建并启动**：
   ```bash
   docker-compose up -d --build
   ```
3. **服务状态检查**：
   ```bash
   docker ps | grep goat-ration-web
   ```
   容器默认映射到宿主机的 `8080` 端口（可在 `docker-compose.yml` 中自由调整）。  
   直接在浏览器访问 `http://<服务器IP>:8080` 即可运行。

---

### 方案 4：公有云对象存储 / 静态网站托管（零服务器免运维）
> 适合免购买云服务器，直接使用云厂商 CDN 与静态加速。

- **支持平台**：
  - 腾讯云 Webify / COS 静态网站托管 / EdgeOne
  - 阿里云 OSS 静态网站托管
  - 华为云 OBS 静态网站托管
  - Vercel / Cloudflare Pages / Netlify / GitHub Pages
- **部署方式**：
  将 `frontend/dist/index.html` 设置为静态网站的默认首页（`index.html`），`404.html` 同样指向 `index.html`，绑定自定义域名并配置 SSL 证书即可享受全球高防 CDN 加速。

---

## 四、 本地二次开发与重新构建说明

如果技术员在交付过程中需要对前端界面文案或功能做局部调整：

### 1. 本地环境准备
- **Node.js**：版本 `>= 18.0.0`
- **npm** 或 **pnpm**

### 2. 依赖安装与启动热重载
```bash
cd frontend
npm install
npm run dev
```
本地浏览器打开 `http://localhost:5173/` 即可实时查看改动。

### 3. 运行自动化测试套件
本项目包含完整的 Vitest 自动化单元与集成测试，覆盖所有界面交互、本地求解引擎与回退机制：
```bash
npm run test
```
*预期输出：`20 passed (20)` 全部通过。*

### 4. 生产编译打包
```bash
npm run build
```
执行完成后，将在 `frontend/dist/` 下生成最新的单文件 `index.html`。

---

## 五、 核心业务逻辑与 API 通信说明

为保障系统在各种弱网、无服务器环境下的极端可靠性，前端设计了**双擎容灾架构**，技术员无需为后端服务器维护承担过重压力：

### 1. 日粮运筹规划（100% 浏览器纯本地计算）
- 位于 `frontend/src/calculator/index.ts`。
- 基于开源成熟运筹库 `javascript-lp-solver` 深度定制，内嵌：
  - 美国 NRC（2007）小反刍营养需要模型；
  - 关中、胶东、华北、塞北等优势产区饲料库与采购行情基准；
  - 两阶段单纯形法求解极小化成本目标函数；
  - **独创 10g 离散化自愈算法**，杜绝小数克数导致的实际饲喂困难。
- **结论**：只要浏览器加载了页面，配方计算 100% 秒级即时产出，**完全不依赖任何后端网络请求**！

### 2. DeepSeek AI 思考推演与营养师审核
- 位于 `frontend/src/api.ts` 的 `calibrateRation()`。
- **三级高可用梯级保障**：
  1. **第一梯级**：尝试请求当前站点的反代或云托管后端接口 `/api/rations/calibrate`；
  2. **第二梯级（默认主力）**：直接以 HTTPS 直连 DeepSeek 官方大模型 API（`https://api.deepseek.com/chat/completions`），系统内置已配置好的 DeepSeek API Key，调用官方新主力推理模型 `deepseek-flash`；
  3. **第三梯级（防断网兜底）**：若无外网或大模型限流，自动无缝切换为基于中国国家行业标准《奶山羊饲养管理技术规范》（NY/T 2835-2015）的专家结构化解读，保证界面绝不报错崩溃。
- **思考推演延时（与小程序完全一致）**：
  点击测算后，系统会自动展开黑客科技风的深度思考推演终端，流式打字推演 4 个阶段（耗时约 3.5 ~ 3.8s），右上角支持随时点击“⏩ 跳过思考”直接呈现结果。

---

## 六、 部署验收 Checklist（技术员测试用例清单）

部署完毕后，请技术员按照下表逐项进行上线验收：

| 序号 | 测试项 | 预期表现 | 状态 |
| :--- | :--- | :--- | :---: |
| 1 | **基础访问与加载** | 浏览器打开无白屏，页面顶部标题显示“奶山羊常用原料日粮配比助手”，显示新版绿底天平图标。 | [ ] |
| 2 | **手机端视口适配** | 在手机端（微信内置浏览器 / Safari / Chrome）打开，页面全屏自适应，无水平横向滚动条，按钮触摸灵敏。 | [ ] |
| 3 | **模式与产区切换** | 切换【🏢 规模化牧场模式】与【🐐 单只精准模式】，切换产区卡片（如陕西关中、山东半岛），数据联动无卡顿。 | [ ] |
| 4 | **原料价格调整** | 点击“下一步：原料与价格”，能正常展示常用原料清单，点击价格能修改，支持增加/删除自选原料。 | [ ] |
| 5 | **运筹计算与思考推演** | 点击“开始测算配方”，进入第3步：<br>① 出现暗黑科技风思考终端，展示 4 阶段推演文字；<br>② 右上角点击“⏩ 跳过思考”能立即完成；<br>③ 思考结束后平滑展开配方看板。 | [ ] |
| 6 | **数据正确性核验** | 结果看板中：<br>① 投喂量精确到 `10 g`；<br>② 食盐量为 `10 g/d`（取整误差容差 ±5 g）；<br>③ 干物质、粗蛋白、中性洗涤纤维各项达标状态卡片均正常显示绿标。 | [ ] |
| 7 | **辅助弹窗功能** | 点击“用户服务协议”能弹出协议弹窗并正常关闭；点击“复制配方结果”能提示已成功复制到剪贴板。 | [ ] |

---

## 七、 常见问题排查（FAQ）

1. **Q：为什么直接双击 `dist/index.html` 本地打开也能运行？**  
   A：因为本项目构建时采用了 `vite-plugin-singlefile` 插件，将所有脚本、样式、图标资源内联为单一自包含文件，并且基准路径设置为 `./`。这证明该网页可以部署在任何静态路径下，无需担心静态资源路径 404 问题。
2. **Q：如果我想修改绑定的 DeepSeek API Key 怎么做？**  
   A：在 `frontend/src/api.ts` 的 `BUILTIN_DEEPSEEK_KEY` 处修改，或者在构建时通过环境变量 `VITE_DEEPSEEK_API_KEY` 传入；若技术员部署了自建后端，也可由后端统一托管密钥。
3. **Q：微信里面扫码打开提示非安全链接怎么办？**  
   A：请务必为部署的域名配置合法的 SSL 证书（开启 HTTPS），且建议使用已在工信部备案的正规域名。
