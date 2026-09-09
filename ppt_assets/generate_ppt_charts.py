# -*- coding: utf-8 -*-
"""
生成路演 PPT 专用的高清白底图表物料
1. 图 1: 动物生理动平衡多维非线性拟合曲面（NY/T 2835-2015）
2. 图 2: 运筹学单纯形法凸多面体几何寻优示意图
3. 图 3: 10g 物理超晶格离散自愈微调机制图
4. 图 4: 全链路白盒数据穿透流与 50kg 奶山羊实测看板
"""
import os
import shutil
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# 设置高品质白底渲染风格与中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.facecolor'] = '#FFFFFF'
plt.rcParams['axes.facecolor'] = '#FFFFFF'
plt.rcParams['savefig.facecolor'] = '#FFFFFF'

OUTPUT_DIR = r"D:\chuangxinchaungye\奶山羊日粮配比助手_源码_2026-08-07\ppt_assets"
ARTIFACT_DIR = r"C:\Users\qiqi\.gemini\antigravity\brain\f7433e5a-f6ee-466d-9fe6-930a2e3883d7\ppt_assets"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

# ==============================================================================
# 图 1: 动物生理动平衡多维非线性拟合曲面
# ==============================================================================
def generate_figure1():
    fig, axes = plt.subplots(1, 3, figsize=(18, 5.8), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')

    # 1.1 DMI 采食量容积预测
    ax1 = axes[0]
    milk = np.linspace(0.2, 4.5, 100)
    fcm35 = 0.432 * milk + 16.23 * (milk * 0.04)
    
    bw_list = [40, 50, 60]
    colors = ['#0284c7', '#059669', '#d97706']
    
    for bw, col in zip(bw_list, colors):
        dmi_target = 0.062 * (bw ** 0.75) + 0.305 * fcm35
        dmi_min = dmi_target * 0.97
        dmi_max = dmi_target * 1.03
        ax1.plot(milk, dmi_target, color=col, lw=2.2, label=f'体重 {bw}kg 基准线')
        if bw == 50:
            ax1.fill_between(milk, dmi_min, dmi_max, color=col, alpha=0.15, label='50kg 羊只 ±3% 容差带')

    # 标出 50kg, 2.5kg 奶采样点
    fcm35_sample = 0.432 * 2.5 + 16.23 * (2.5 * 0.04)
    dmi_sample = 0.062 * (50 ** 0.75) + 0.305 * fcm35_sample
    ax1.plot(2.5, dmi_sample, marker='o', markersize=8, color='#dc2626', zorder=5)
    ax1.annotate(f'标杆羊只 (50kg, 2.5kg奶)\nDMI = {dmi_sample:.2f} kg/d',
                 xy=(2.5, dmi_sample), xytext=(1.2, dmi_sample + 0.35),
                 arrowprops=dict(arrowstyle='->', color='#dc2626', lw=1.5),
                 fontsize=10, fontweight='bold', color='#991b1b',
                 bbox=dict(boxstyle='round,pad=0.4', facecolor='#fef2f2', edgecolor='#fca5a5'))

    ax1.set_title('(A) 胃容积干物质采食量 (DMI) 动态安全带', fontsize=13, fontweight='bold', pad=12, color='#0f172a')
    ax1.set_xlabel('日产奶量 (kg/d, 乳脂率4%)', fontsize=11, color='#334155')
    ax1.set_ylabel('干物质采食量 DMI (kg DM/d)', fontsize=11, color='#334155')
    ax1.grid(True, linestyle='--', alpha=0.5, color='#cbd5e1')
    ax1.legend(loc='upper left', fontsize=9, framealpha=0.9)
    ax1.set_ylim(1.0, 3.2)

    # 1.2 代谢能 ME 需求增长
    ax2 = axes[1]
    fcm4 = milk * (0.40 + 0.15 * 4.0)
    for bw, col in zip(bw_list, colors):
        me_m = 0.5013 * (bw ** 0.75)
        me_l = 5.224 * fcm4
        me_total = (me_m + me_l) * 1.05
        ax2.plot(milk, me_total, color=col, lw=2.2, label=f'体重 {bw}kg (含5%安全余量)')

    me_sample = (0.5013 * (50 ** 0.75) + 5.224 * 2.5) * 1.05
    ax2.plot(2.5, me_sample, marker='o', markersize=8, color='#dc2626', zorder=5)
    ax2.annotate(f'ME下限 = {me_sample:.2f} MJ/d\n(维持 9.43 + 泌乳 13.06)',
                 xy=(2.5, me_sample), xytext=(1.0, me_sample + 4.5),
                 arrowprops=dict(arrowstyle='->', color='#dc2626', lw=1.5),
                 fontsize=10, fontweight='bold', color='#991b1b',
                 bbox=dict(boxstyle='round,pad=0.4', facecolor='#fef2f2', edgecolor='#fca5a5'))

    ax2.set_title('(B) 反刍代谢能 (ME) 动平衡硬约束', fontsize=13, fontweight='bold', pad=12, color='#0f172a')
    ax2.set_xlabel('日产奶量 (kg/d, 乳脂率4%)', fontsize=11, color='#334155')
    ax2.set_ylabel('代谢能需求 ME (MJ/d)', fontsize=11, color='#334155')
    ax2.grid(True, linestyle='--', alpha=0.5, color='#cbd5e1')
    ax2.legend(loc='upper left', fontsize=9, framealpha=0.9)

    # 1.3 粗蛋白 CP 梯级分档线
    ax3 = axes[2]
    milk_steps = [0.0, 1.0, 2.5, 3.5, 4.5]
    cp_base = [12.0, 14.0, 16.0, 18.0]
    cp_with_margin = [min(20.0, c * 1.05) for c in cp_base]

    for i in range(len(cp_base)):
        x_start = milk_steps[i]
        x_end = milk_steps[i+1]
        ax3.hlines(cp_with_margin[i], x_start, x_end, colors='#059669', lw=3, label='CP计算下限(含5%余量)' if i==0 else "")
        ax3.hlines(cp_base[i], x_start, x_end, colors='#64748b', lw=1.8, linestyle=':', label='NY/T 2835基准线' if i==0 else "")
        if i < len(cp_base) - 1:
            ax3.vlines(x_end, cp_with_margin[i], cp_with_margin[i+1], colors='#059669', lw=2, linestyle='--')

    ax3.axhline(20.0, color='#dc2626', lw=2, linestyle='-.', label='安全上限 20%DM (防氨中毒)')

    ax3.plot(2.5, 14.7, marker='o', markersize=8, color='#dc2626', zorder=5)
    ax3.annotate('50kg, 2.5kg奶基准\nCP ≥ 14.7% DM',
                 xy=(2.5, 14.7), xytext=(1.1, 17.5),
                 arrowprops=dict(arrowstyle='->', color='#dc2626', lw=1.5),
                 fontsize=10, fontweight='bold', color='#991b1b',
                 bbox=dict(boxstyle='round,pad=0.4', facecolor='#fef2f2', edgecolor='#fca5a5'))

    ax3.set_title('(C) 粗蛋白质 (CP) FCM4 梯级爬升分档', fontsize=13, fontweight='bold', pad=12, color='#0f172a')
    ax3.set_xlabel('4% 标准校正乳 FCM4 (kg/d)', fontsize=11, color='#334155')
    ax3.set_ylabel('粗蛋白需求 (% DM)', fontsize=11, color='#334155')
    ax3.set_ylim(10.0, 22.0)
    ax3.grid(True, linestyle='--', alpha=0.5, color='#cbd5e1')
    ax3.legend(loc='lower right', fontsize=9, framealpha=0.9)

    plt.suptitle('图 1：动物生理动平衡多维非线性拟合曲面（基于国家行业标准 NY/T 2835-2015）',
                 fontsize=15, fontweight='bold', y=1.02, color='#0f172a')
    plt.tight_layout()
    
    out_path = os.path.join(OUTPUT_DIR, "ppt_figure1_physiological_regression.png")
    plt.savefig(out_path, dpi=300, bbox_inches='tight')
    shutil.copy(out_path, os.path.join(ARTIFACT_DIR, "ppt_figure1_physiological_regression.png"))
    plt.close()
    print("Generated:", out_path)

# ==============================================================================
# 图 2: 运筹学单纯形法凸多面体几何寻优示意图
# ==============================================================================
def generate_figure2():
    fig, ax = plt.subplots(figsize=(10.5, 7.5), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#FFFFFF')

    # 定义多边形可行域
    x_coords = np.array([0.55, 0.92, 0.92, 0.72, 0.55])
    y_coords = np.array([1.45, 1.19, 1.12, 1.39, 1.45])
    
    polygon = patches.Polygon(np.column_stack([x_coords, y_coords]),
                              closed=True, facecolor='#dcfce7', edgecolor='#16a34a',
                              lw=2.5, linestyle='-', alpha=0.85, zorder=2,
                              label='反刍生理安全营养可行域 (凸多面体投影)')
    ax.add_patch(polygon)

    # 绘制各条营养约束边界线
    x_line = np.linspace(0.4, 1.1, 100)
    
    # 1. 粗精比下限 (y = x 即粗料50%)
    ax.plot(x_line, x_line, color='#ea580c', lw=2, linestyle='--', label='粗饲料比例下限线 (Forage ≥ 50% DM)')
    # 2. DMI 上限 (x + y = 2.11)
    ax.plot(x_line, 2.11 - x_line, color='#2563eb', lw=2, linestyle='-', label='DMI 胃容积上限 (x + y ≤ 2.11 kg)')
    # 3. DMI 下限 (x + y = 1.99)
    ax.plot(x_line, 1.99 - x_line, color='#3b82f6', lw=1.8, linestyle=':', label='DMI 饱腹感下限 (x + y ≥ 1.99 kg)')
    # 4. 精饲料安全上限 (x = 0.92)
    ax.axvline(0.92, color='#7c3aed', lw=2, linestyle='-.', label='精料安全上限 (x ≤ 0.92 kg, 防酸中毒)')

    # 成本等值线
    c_levels = [4.8, 4.4, 4.05, 3.75]
    for i, c_val in enumerate(c_levels):
        y_cost = (c_val - 3.2 * x_line) / 1.2
        style = '--' if i > 0 else '-'
        alpha_val = 0.8 if i == 2 else 0.45
        ax.plot(x_line, y_cost, color='#64748b', lw=1.5, linestyle=style, alpha=alpha_val)
        if i == 1:
            ax.annotate('成本等值线 Cost = ∑(Price_i/DM_i)·x_i', xy=(0.48, 2.1), fontsize=9.5,
                        rotation=-48, color='#475569')

    # 成本下降箭头
    ax.annotate('', xy=(0.60, 1.05), xytext=(0.85, 1.50),
                arrowprops=dict(facecolor='#dc2626', edgecolor='#dc2626', width=2.5, headwidth=9))
    ax.text(0.76, 1.30, '成本极小化搜索方向\n(Min Cost 梯度下降)', color='#b91c1c',
            fontweight='bold', fontsize=10, rotation=-45)

    # 标出最优解顶点
    best_x, best_y = 0.72, 1.39
    ax.plot(best_x, best_y, marker='*', markersize=18, color='#dc2626', zorder=6)
    ax.annotate('单纯形法收敛最优顶点 (Optimal Vertex)\n• 精料用量: 0.72 kg DM (玉米+豆粕)\n• 粗料用量: 1.39 kg DM (青贮+苜蓿)\n• 粗精比: 65.9% : 34.1% (完全达标)\n• 日粮采购成本最低: 3.97 元/只/天',
                xy=(best_x, best_y), xytext=(best_x + 0.08, best_y + 0.15),
                arrowprops=dict(arrowstyle='->', color='#dc2626', lw=2),
                fontsize=10.5, fontweight='bold', color='#991b1b',
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#fef2f2', edgecolor='#f87171', lw=1.5))

    ax.set_title('图 2：运筹学单纯形法凸多面体几何寻优示意图', fontsize=14, fontweight='bold', pad=14, color='#0f172a')
    ax.set_xlabel('精饲料日采食量 (kg DM/d)', fontsize=11.5, color='#334155')
    ax.set_ylabel('粗饲料日采食量 (kg DM/d)', fontsize=11.5, color='#334155')
    ax.set_xlim(0.4, 1.15)
    ax.set_ylim(0.9, 1.7)
    ax.grid(True, linestyle='--', alpha=0.5, color='#e2e8f0')
    ax.legend(loc='lower left', fontsize=9.5, framealpha=0.95)

    out_path = os.path.join(OUTPUT_DIR, "ppt_figure2_simplex_polyhedron_optimization.png")
    plt.savefig(out_path, dpi=300, bbox_inches='tight')
    shutil.copy(out_path, os.path.join(ARTIFACT_DIR, "ppt_figure2_simplex_polyhedron_optimization.png"))
    plt.close()
    print("Generated:", out_path)

# ==============================================================================
# 图 3: 10g 物理超晶格离散自愈微调机制图
# ==============================================================================
def generate_figure3():
    fig, (ax_grid, ax_flow) = plt.subplots(1, 2, figsize=(16, 6.5), dpi=300, gridspec_kw={'width_ratios': [1.1, 1.2]})
    fig.patch.set_facecolor('#FFFFFF')

    # 左侧: 2D 整数超晶格网格示意
    ax_grid.set_facecolor('#FFFFFF')
    for x in np.arange(0.55, 0.65, 0.01):
        ax_grid.axvline(x, color='#e2e8f0', lw=1, zorder=1)
    for y in np.arange(2.15, 2.25, 0.01):
        ax_grid.axhline(y, color='#e2e8f0', lw=1, zorder=1)

    boundary_x = np.linspace(0.55, 0.65, 100)
    boundary_y = 2.78 - 0.95 * boundary_x
    ax_grid.plot(boundary_x, boundary_y, color='#dc2626', lw=2, linestyle='--', label='敏感安全约束线 (如 DMI 胃容积上限)')
    ax_grid.fill_between(boundary_x, 2.15, boundary_y, color='#dcfce7', alpha=0.4, label='安全达标区')

    cont_x, cont_y = 0.584, 2.208
    ax_grid.plot(cont_x, cont_y, 'o', color='#0284c7', markersize=10, zorder=5, label='连续理论解 (0.584kg, 2.208kg, 不可称量)')

    round_x, round_y = 0.58, 2.21
    ax_grid.plot(round_x, round_y, 's', color='#d97706', markersize=10, zorder=5, label='直接四舍五入点 (0.58kg, 2.21kg, 触碰边界)')
    ax_grid.annotate('', xy=(round_x, round_y), xytext=(cont_x, cont_y),
                     arrowprops=dict(arrowstyle='->', color='#d97706', lw=2))

    healed_x, healed_y = 0.58, 2.20
    ax_grid.plot(healed_x, healed_y, '*', color='#059669', markersize=16, zorder=6, label='小步自愈达标点 (0.58kg, 2.20kg, 10g整数)')
    ax_grid.annotate('', xy=(healed_x, healed_y), xytext=(round_x, round_y),
                     arrowprops=dict(arrowstyle='->', color='#059669', lw=2.5))
    ax_grid.text(0.583, 2.203, '自愈微调\n(粗料守恒补偿)', color='#059669', fontweight='bold', fontsize=9.5)

    ax_grid.set_title('(A) 10g 物理超晶格投影与自愈修复几何示意', fontsize=12, fontweight='bold', pad=12)
    ax_grid.set_xlabel('玉米原物质用量 (kg/只/天)', fontsize=10.5)
    ax_grid.set_ylabel('青贮原物质用量 (kg/只/天)', fontsize=10.5)
    ax_grid.set_xlim(0.56, 0.61)
    ax_grid.set_ylim(2.18, 2.23)
    ax_grid.legend(loc='lower left', fontsize=8.5, framealpha=0.95)

    # 右侧: 状态机流程图卡片
    ax_flow.set_facecolor('#f8fafc')
    ax_flow.axis('off')

    cards = [
        ('1. 连续规划求解', 'HiGHS 连续单纯形求解', '求得理论全局最优基解 x_dm (浮点精度)', '#0284c7', 0.82),
        ('2. 阶段 A: MILP 整数求解', '混合整数规划 (分支定界)', '直接以 10g 整数单元求最低成本整数解', '#059669', 0.62),
        ('3. 阶段 B: 启发式小步自愈', '自包含食盐闭式解 + 守恒自愈', '单料微调与双料等量交换，解决边界震荡', '#d97706', 0.42),
        ('4. 降级安全网: 尽力解', 'Approximate 相对违背度最小', '原料受限时最小化无量纲缺口，标红预警永不宕机', '#dc2626', 0.22),
    ]

    for title, subtitle, desc, col, y_pos in cards:
        rect = patches.FancyBboxPatch((0.05, y_pos - 0.07), 0.90, 0.15,
                                      boxstyle="round,pad=0.03",
                                      facecolor='#FFFFFF', edgecolor=col, lw=1.8)
        ax_flow.add_patch(rect)
        ax_flow.text(0.10, y_pos + 0.04, title, fontsize=11, fontweight='bold', color=col)
        ax_flow.text(0.10, y_pos, subtitle, fontsize=9.5, fontweight='bold', color='#1e293b')
        ax_flow.text(0.10, y_pos - 0.04, desc, fontsize=8.5, color='#64748b')

    for y_arr in [0.73, 0.53, 0.33]:
        ax_flow.annotate('', xy=(0.5, y_arr - 0.04), xytext=(0.5, y_arr + 0.02),
                         arrowprops=dict(arrowstyle='->', color='#94a3b8', lw=1.8))

    ax_flow.set_title('(B) 双层运筹优化与容错状态机流水线', fontsize=12, fontweight='bold', pad=12, color='#0f172a')

    plt.suptitle('图 3：10g 物理超晶格离散自愈微调机制与两层求解架构', fontsize=14, fontweight='bold', y=0.98, color='#0f172a')
    plt.tight_layout()

    out_path = os.path.join(OUTPUT_DIR, "ppt_figure3_discrete_lattice_and_repair.png")
    plt.savefig(out_path, dpi=300, bbox_inches='tight')
    shutil.copy(out_path, os.path.join(ARTIFACT_DIR, "ppt_figure3_discrete_lattice_and_repair.png"))
    plt.close()
    print("Generated:", out_path)

# ==============================================================================
# 图 4: 全链路白盒数据穿透流与 50kg 奶山羊实测看板
# ==============================================================================
def generate_figure4():
    fig = plt.figure(figsize=(16, 8.5), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')

    gs = fig.add_gridspec(2, 3, height_ratios=[1.2, 1.0], hspace=0.32, wspace=0.25)

    # 1. 输入卡片
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.set_facecolor('#f8fafc')
    ax1.axis('off')
    rect1 = patches.FancyBboxPatch((0.02, 0.02), 0.96, 0.96, boxstyle="round,pad=0.03", facecolor='#FFFFFF', edgecolor='#0284c7', lw=1.8)
    ax1.add_patch(rect1)
    ax1.text(0.08, 0.85, '步骤 1: 牧场基础画像输入', fontsize=12, fontweight='bold', color='#0284c7')
    ax1.text(0.08, 0.70, '• 牧场模式: 规模化牧场 (存栏 500 只)', fontsize=10, color='#334155')
    ax1.text(0.08, 0.55, '• 核心计算群: 成年泌乳群 (350 只)', fontsize=10, color='#334155')
    ax1.text(0.08, 0.40, '• 标杆生理: 体重 50kg, 产奶 2.5kg/d', fontsize=10, color='#334155')
    ax1.text(0.08, 0.25, '• 目标乳脂率: 4.0% (标准产出)', fontsize=10, color='#334155')
    ax1.text(0.08, 0.10, '• 代表产区: 陕西关中核心产区', fontsize=10, color='#059669', fontweight='bold')

    # 2. 动平衡标准卡片
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.set_facecolor('#f8fafc')
    ax2.axis('off')
    rect2 = patches.FancyBboxPatch((0.02, 0.02), 0.96, 0.96, boxstyle="round,pad=0.03", facecolor='#FFFFFF', edgecolor='#059669', lw=1.8)
    ax2.add_patch(rect2)
    ax2.text(0.08, 0.85, '步骤 2: 动平衡约束确立 (NY/T 2835)', fontsize=12, fontweight='bold', color='#059669')
    ax2.text(0.08, 0.70, '• 胃容积 DMI: 2.05 kg DM (±3% 弹性)', fontsize=10, color='#334155')
    ax2.text(0.08, 0.55, '• 代谢能 ME: ≥ 23.62 MJ/d (含5%余量)', fontsize=10, color='#334155')
    ax2.text(0.08, 0.40, '• 粗蛋白 CP: ≥ 14.7% DM (阶梯第三档)', fontsize=10, color='#334155')
    ax2.text(0.08, 0.25, '• 粗饲料下限: ≥ 50% DM (防SARA酸中毒)', fontsize=10, color='#334155')
    ax2.text(0.08, 0.10, '• 矿物比例: Ca:Phos 1.5~2.0, 盐 0.5%DM', fontsize=10, color='#334155')

    # 3. 运筹求解输出卡片
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.set_facecolor('#f8fafc')
    ax3.axis('off')
    rect3 = patches.FancyBboxPatch((0.02, 0.02), 0.96, 0.96, boxstyle="round,pad=0.03", facecolor='#FFFFFF', edgecolor='#7c3aed', lw=1.8)
    ax3.add_patch(rect3)
    ax3.text(0.08, 0.85, '步骤 3: 运筹学 Simplex LP 求解', fontsize=12, fontweight='bold', color='#7c3aed')
    ax3.text(0.08, 0.70, '• 目标函数: 关中采购价 Min Cost', fontsize=10, color='#334155')
    ax3.text(0.08, 0.55, '• 求解耗时: 12.4 ms (连续凸空间极值)', fontsize=10, color='#334155')
    ax3.text(0.08, 0.40, '• 离散算法: 10g 分支定界自愈收敛', fontsize=10, color='#334155')
    ax3.text(0.08, 0.25, '• 单羊日成本: 3.97 元/只/天 (最低采购价)', fontsize=10, color='#dc2626', fontweight='bold')
    ax3.text(0.08, 0.10, '• 状态判定: Qualified = True (100%合规)', fontsize=10, color='#059669', fontweight='bold')

    # 4. 配方原料柱状对比
    ax4 = fig.add_subplot(gs[1, 0:2])
    feeds = ['全株玉米青贮', '苜蓿干草', '玉米', '豆粕', '食盐', '石灰石粉']
    as_fed = [2.20, 0.75, 0.58, 0.21, 0.01, 0.01]
    dm_vals = [0.704, 0.675, 0.499, 0.187, 0.01, 0.01]
    
    x_idx = np.arange(len(feeds))
    width = 0.35
    
    rects1 = ax4.bar(x_idx - width/2, as_fed, width, label='物理原物质用量 (As-Fed kg/天)', color='#0284c7', edgecolor='#0369a1')
    rects2 = ax4.bar(x_idx + width/2, dm_vals, width, label='有效干物质重量 (DM kg/天)', color='#10b981', edgecolor='#047857')

    for r in rects1:
        h = r.get_height()
        ax4.text(r.get_x() + r.get_width()/2., h + 0.04, f'{h:.2f}', ha='center', va='bottom', fontsize=9, fontweight='bold', color='#0369a1')
    for r in rects2:
        h = r.get_height()
        ax4.text(r.get_x() + r.get_width()/2., h + 0.04, f'{h:.2f}', ha='center', va='bottom', fontsize=9, color='#047857')

    ax4.set_title('最终输出：10g 物理可称量精准日粮配比清单 (单羊总原物质: 3.76 kg/d)', fontsize=11.5, fontweight='bold', pad=10)
    ax4.set_xticks(x_idx)
    ax4.set_xticklabels(feeds, fontsize=10, fontweight='bold')
    ax4.set_ylabel('投喂量 (kg/只/天)', fontsize=10)
    ax4.set_ylim(0, 2.6)
    ax4.grid(True, linestyle='--', alpha=0.4, color='#cbd5e1', axis='y')
    ax4.legend(loc='upper right', fontsize=9.5)

    # 5. 全场规模放大与执行卡片
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_facecolor('#f8fafc')
    ax5.axis('off')
    rect5 = patches.FancyBboxPatch((0.02, 0.02), 0.96, 0.96, boxstyle="round,pad=0.03", facecolor='#FFFFFF', edgecolor='#ea580c', lw=1.8)
    ax5.add_patch(rect5)
    ax5.text(0.08, 0.85, '步骤 4: 全场吨位放大与硬件执行', fontsize=12, fontweight='bold', color='#ea580c')
    ax5.text(0.08, 0.70, '• 核心群每日青贮: 0.77 吨/天 (TMR车)', fontsize=10, color='#334155')
    ax5.text(0.08, 0.55, '• 核心群每日苜蓿: 0.26 吨/天', fontsize=10, color='#334155')
    ax5.text(0.08, 0.40, '• 核心群玉米豆粕: 0.28 吨/天', fontsize=10, color='#334155')
    ax5.text(0.08, 0.25, '• 全场日饲料总支出: 1389.5 元/天', fontsize=10, color='#dc2626', fontweight='bold')
    ax5.text(0.08, 0.10, '• 蓝牙下位机 Demo: 1:100 等比精准称量', fontsize=10, color='#0284c7', fontweight='bold')

    plt.suptitle('图 4：全系统端到端白盒数据穿透流与 50kg 奶山羊实测验证看板',
                 fontsize=14.5, fontweight='bold', y=0.98, color='#0f172a')

    out_path = os.path.join(OUTPUT_DIR, "ppt_figure4_transparent_data_pipeline.png")
    plt.savefig(out_path, dpi=300, bbox_inches='tight')
    shutil.copy(out_path, os.path.join(ARTIFACT_DIR, "ppt_figure4_transparent_data_pipeline.png"))
    plt.close()
    print("Generated:", out_path)

if __name__ == '__main__':
    print("Generating PPT charts...")
    generate_figure1()
    generate_figure2()
    generate_figure3()
    generate_figure4()
    print("All charts generated successfully!")
