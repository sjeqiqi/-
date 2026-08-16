# 奶山羊日粮配比助手（第一版 MVP）

面向小农户的本地网页工具：输入动物信息（体重、日产奶量、乳脂率）并勾选允许使用的原料，系统只在这些勾选原料内输出满足当前宏量营养约束的**最低成本日粮方案**；未勾选原料不会被自动加入。无登录、无账号、不保存数据；原料库为版本化 JSON 文件。

> 本工具不是兽医诊断工具，不承诺提高产奶量，首版仅覆盖宏量指标，不能替代全价长期日粮。

## 功能概览

- 支持成年泌乳奶山羊与成年非泌乳维持期；体重 25–90 kg、奶量 0.2–5.0 kg/d、乳脂率 2.0%–7.0% 之外的输入会被拒绝并提示复核。
- 两层求解（SciPy/HiGHS）：候选集合严格等于本次勾选的原料。第一层先在勾选集合内求严格可行、取整后复算达标的 10 g 整数最低成本解；第二层在严格路径不可行或取整后不达标时，返回同集合内的“营养缺口最小”近似配比（approximate）。两层都只使用勾选原料，绝不自动加入未勾选原料。
- 营养模型：4% FCM / 3.5% FCM、DMI 预测（±3% 带）、ME（含 5% 安全余量）、CP 分档下限（含 5% 余量）、NDF、Ca、P、Ca:P、食盐固定 0.5% DM、粗饲料比例下限。
- 最终用量按 **10 g/只/天** 取整，取整后重新计算成本与全部营养指标：严格解不达标时进入近似路径；近似配比同样按显示用量复算并如实列出未达标项。
- 近似配比（approximate）永远标记 `qualified=false`，不会伪装成合格配方：仅使用勾选原料、按 10 g 整数给出营养缺口最小的配比并列出未达标约束与建议；只有数值求解器在两层都灾难性失败时才返回旧式 infeasible。
- 每种原料支持价格修改与检测值成分覆盖；默认成分为公开资料估算值并如实标注。
- 可选 DeepSeek 通俗解读：AI 只接收计算后的只读摘要，任何情况下都不能改变配方克数；密钥缺失、超时或返回非法 JSON 时自动回退到本地固定说明。

## 目录结构

```
├─ backend/                 FastAPI 后端
│  ├─ app/
│  │  ├─ main.py            应用入口与路由
│  │  ├─ spec.py            常量与参数
│  │  ├─ nutrition.py       营养需求公式（FCM/DMI/ME/CP/NDF/Ca/P）
│  │  ├─ optimizer.py       严格 LP/整数规划 + 尽力解（approximate）复算
│  │  ├─ service.py         请求预处理与校验
│  │  ├─ models.py          Pydantic 请求/响应模型
│  │  ├─ ai.py              DeepSeek 校准客户端（含回退）
│  │  └─ feeds/v1.json      版本化原料库
│  ├─ tests/                pytest（公式/优化/API/AI 回退）
│  └─ requirements*.txt
├─ frontend/                React + TypeScript + Vite 前端
│  └─ src/                  三步流程：动物信息 → 原料与价格 → 配方结果
└─ PROJECT_PLAN.md          产品与计算模型详细说明
```

## 运行

### 1) 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
$env:PYTHONUTF8 = "1"
.\.venv\Scripts\python -X utf8 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

可选 AI 解读：后端只从进程环境变量 `DEEPSEEK_API_KEY` 读取，当前不会自动解析 `.env` 文件。启动 uvicorn 前请在 PowerShell 中执行 `$env:DEEPSEEK_API_KEY = "sk-..."`（或使用部署平台的环境变量配置）；不要把真实 Key 写入源码、README、测试或提交记录。

### 2) 前端（开发模式）

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173，/api 已代理到 8000
```

### 3) 单服务部署（推荐给农户使用）

```powershell
cd frontend
npm run build      # 产出 frontend/dist
```

之后重新启动后端，访问 http://127.0.0.1:8000/ 即可使用完整应用（后端自动托管构建产物，含 SPA 路由回退）。

## 测试

后端（75 个用例）：

```powershell
cd backend
$env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\python -X utf8 -m pytest tests/ -q -p no:cacheprovider
```

前端（16 个用例）：

```powershell
cd frontend
npm test
```

前端生产构建校验：`npm run build`（内含 `tsc -b` 类型检查 + Vite 打包）。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/feeds` | 版本化原料目录 |
| POST | `/api/rations/calculate` | 确定性配方计算 |
| POST | `/api/rations/calibrate` | 计算 + 可选 DeepSeek 通俗解读 |

## 验收案例

- 50 kg 泌乳羊、2.5 kg/d、4% 乳脂、全选原料：返回可行方案，全部宏量指标均按最终 10 g 用量严格复算并达标（当前默认价格下 DM 约 2.05 kg/d、ME 约 23.61 MJ/d；价格或原料数据变化时结果会相应变化）。
- 仅选玉米等高限原料或需求超出勾选集合能力时：返回 `approximate`（`qualified=false`），只输出勾选原料、按 10 g 整数，并逐项列出未达标约束；不会自动加入未勾选原料。
- 仅勾选食盐/石灰石等矿物质：返回 `approximate` 并标记禁止饲喂，盐/石粉只给 10 g 级诊断小剂量，绝不作为体积填充。

## 边界声明

- 默认成分数据为公开资料估算值，不是实验室检测值；有检测值时请用覆盖功能录入。
- 仅覆盖宏量指标（能量、粗蛋白、NDF、钙、磷），不含微量元素与维生素保证。
- 粗蛋白为宏量代理指标，不代表可代谢蛋白（MP）精确满足。
- 不是兽医诊断或治疗建议。
- 近似配比（approximate）不是合格配方，禁止直接按结果饲喂；必须由营养师或兽医复核未达标项并补充原料后使用。

## 已知说明

- 后端默认端口 8000、前端开发端口 5173；端口占用时请调整。
- AI 模型名 `deepseek-v4-flash`，走官方 OpenAI 兼容接口（base URL `https://api.deepseek.com`），超时 30 秒。
