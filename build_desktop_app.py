# -*- coding: utf-8 -*-
"""一键构建奶山羊智能日粮配比助手独立桌面版应用
执行流程：
1. 校验并构建前端 React 生产静态包 (npm run build -> frontend/dist)
2. 确保应用多尺寸高清图标 app_icon.ico 存在
3. 运行 PyInstaller 执行一体化打包 (嵌入 Python、FastAPI、Scipy、PyWebView 与前端 dist)
4. 输出至独立便携分发目录 d:\\chuangxinchaungye\\奶山羊日粮配比助手_独立桌面版
5. 自动打包生成 zip 压缩包供直接下载分发
"""
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT_DIR.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"
DIST_APP_DIR = PROJECT_ROOT / "牧语算草_独立桌面版"
ZIP_OUTPUT_PATH = PROJECT_ROOT / "牧语算草_独立桌面版_v1.0.zip"


def step_build_frontend():
    print("\n[1/5] 正在构建前端 React 生产环境静态资源 (npm run build)...")
    if not (FRONTEND_DIR / "package.json").exists():
        raise FileNotFoundError(f"未找到前端目录: {FRONTEND_DIR}")
    
    # 执行 npm run build
    result = subprocess.run(
        "npm run build",
        cwd=str(FRONTEND_DIR),
        shell=True,
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise RuntimeError("前端构建失败！请检查前端代码。")
    print("前端构建成功！输出目录:", FRONTEND_DIR / "dist")


def step_check_icon():
    print("\n[2/5] 正在检查/生成应用图标 app_icon.ico...")
    icon_path = ROOT_DIR / "app_icon.ico"
    if not icon_path.exists():
        from PIL import Image, ImageDraw
        size = 256
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([(12, 12), (size-12, size-12)], radius=48, fill='#059669', outline='#047857', width=6)
        draw.arc([(24, 24), (size-24, size-24)], start=0, end=360, fill='#10b981', width=3)
        draw.arc([(50, 45), (120, 135)], start=160, end=330, fill='#fef08a', width=10)
        draw.arc([(136, 45), (206, 135)], start=210, end=20, fill='#fef08a', width=10)
        head_pts = [(128, 90), (175, 125), (155, 185), (128, 215), (101, 185), (81, 125)]
        draw.polygon(head_pts, fill='#ffffff')
        draw.polygon([(85, 130), (45, 145), (75, 160)], fill='#ffffff')
        draw.polygon([(171, 130), (211, 145), (181, 160)], fill='#ffffff')
        draw.ellipse([(102, 138), (112, 148)], fill='#0f172a')
        draw.ellipse([(144, 138), (154, 148)], fill='#0f172a')
        draw.polygon([(123, 195), (133, 195), (128, 203)], fill='#059669')
        draw.arc([(100, 185), (156, 235)], start=20, end=160, fill='#fbbf24', width=6)
        sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
        img.save(icon_path, format='ICO', sizes=sizes)
        print("已成功生成应用图标:", icon_path)
    else:
        print("应用图标已存在:", icon_path)


def step_pyinstaller():
    print("\n[3/5] 正在使用 PyInstaller 进行前后端一体化独立打包...")
    import PyInstaller.__main__

    spec_entry = str(ROOT_DIR / "desktop_app.py")
    frontend_dist = str(FRONTEND_DIR / "dist")
    feeds_dir = str(BACKEND_DIR / "app" / "feeds")
    icon_path = str(ROOT_DIR / "app_icon.ico")

    # 数据包与隐藏导入
    datas = [
        f"{frontend_dist};frontend/dist",
        f"{feeds_dir};app/feeds",
        f"{icon_path};.",
    ]

    hidden_imports = [
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "starlette",
        "starlette.staticfiles",
        "starlette.responses",
        "pydantic",
        "scipy",
        "scipy.optimize",
        "scipy.optimize._linprog",
        "scipy.optimize._linprog_highs",
        "httpx",
        "webview",
        "webview.platforms.winforms",
        "clr",
        "clr_loader",
        "pythonnet",
        "app",
        "app.main",
        "app.models",
        "app.optimizer",
        "app.service",
        "app.feeds",
        "app.insights",
        "app.ai",
        "app.spec",
        "app.nutrition",
    ]

    args = [
        spec_entry,
        "--name=奶山羊智能日粮配比助手",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--windowed", # 隐藏CMD黑窗口，呈现纯正原生桌面软件
        f"--icon={icon_path}",
        f"--paths={str(ROOT_DIR)}",
        f"--paths={str(BACKEND_DIR)}",
        f"--distpath={str(ROOT_DIR / 'build_dist')}",
        f"--workpath={str(ROOT_DIR / 'build_temp')}",
    ]

    for d in datas:
        args.append(f"--add-data={d}")
    for h in hidden_imports:
        args.append(f"--hidden-import={h}")

    print("执行 PyInstaller 参数:", " ".join(args[:10]), "...")
    PyInstaller.__main__.run(args)
    print("PyInstaller 编译完成！")


def step_package_distribution():
    print("\n[4/5] 正在组织便携分发目录...")
    built_app = ROOT_DIR / "build_dist" / "奶山羊智能日粮配比助手"
    if not built_app.exists():
        raise FileNotFoundError(f"编译产物未找到: {built_app}")

    if DIST_APP_DIR.exists():
        shutil.rmtree(DIST_APP_DIR)
    shutil.copytree(built_app, DIST_APP_DIR)

    # 附带使用说明
    readme_content = """奶山羊智能日粮配比助手 —— 独立桌面应用版使用说明
============================================================
版本：v1.0 (独立免安装便携版)
支持系统：Windows 10 / Windows 11 (64位)
核心特性：
1. 原生桌面应用窗口：无浏览器地址栏，支持最大化/自由缩放；
2. 零环境依赖：目标电脑无需安装 Python、Node.js 或任何运行库；
3. 100% 本地离线计算：内置农业农村部 NY/T 2835 动平衡机理与两阶段单纯形 LP 优化算法，断网依然毫秒级响应；
4. 10g 工业称重自愈微调：配比结果可直接指导现场称重；
5. AI 智能解读：联网状态下支持配置 DeepSeek 大模型进行深度推理分析；断网自动启动专业离线科学解读。

【启动方式】
直接双击运行本目录下的：
    奶山羊智能日粮配比助手.exe

【退出方式】
直接点击窗口右上角“关闭”按钮，后台所有服务将自动安全退出，无内存残留。
============================================================
"""
    (DIST_APP_DIR / "使用说明.txt").write_text(readme_content, encoding="utf-8")

    # 创建一个快捷启动脚本（备用）
    bat_content = '@echo off\r\nchcp 65001 >nul\r\nstart "" "%~dp0奶山羊智能日粮配比助手.exe"\r\n'
    (DIST_APP_DIR / "启动应用.bat").write_text(bat_content, encoding="gbk")

    print(f"独立桌面应用已成功输出至: {DIST_APP_DIR}")


def step_create_zip():
    print("\n[5/5] 正在压缩打包为可直接下载分发的 ZIP 压缩包...")
    if ZIP_OUTPUT_PATH.exists():
        ZIP_OUTPUT_PATH.unlink()

    with zipfile.ZipFile(ZIP_OUTPUT_PATH, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(DIST_APP_DIR):
            for file in files:
                file_path = Path(root) / file
                arc_name = Path("牧语算草_独立桌面版") / file_path.relative_to(DIST_APP_DIR)
                zf.write(file_path, arc_name)

    zip_size_mb = ZIP_OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"============================================================")
    print(f" 恭喜！桌面独立应用版打包完成！")
    print(f" 应用文件夹: {DIST_APP_DIR}")
    print(f" 直接下载分发包: {ZIP_OUTPUT_PATH} ({zip_size_mb:.2f} MB)")
    print(f"============================================================")


def main():
    try:
        step_build_frontend()
        step_check_icon()
        step_pyinstaller()
        step_package_distribution()
        step_create_zip()
    except Exception as exc:
        print(f"\n[错误] 构建中断: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
