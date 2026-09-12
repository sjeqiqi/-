# -*- coding: utf-8 -*-
"""
牧语算草 - Android APK 一键构建与打包脚本
功能：
1. 编译前端生产静态资源 (npm run build)
2. 同步静态资源至 Android assets 目录
3. 调用 Gradle 构建已签名的 Release APK
4. 自动复制并发布至输出目录与根目录
"""

import os
import sys
import shutil
import subprocess
import hashlib
import re
from pathlib import Path

# 设置标准输出编码为 UTF-8
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
ANDROID_DIR = ROOT_DIR / "android_app"
ASSETS_DIST_DIR = ANDROID_DIR / "app" / "src" / "main" / "assets" / "dist"
RELEASE_APK_SRC = ANDROID_DIR / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"

PROJECT_ROOT = ROOT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "牧语算草_安卓版"
OUTPUT_APK_ROOT = PROJECT_ROOT / "牧语算草_Android_v1.0.apk"
OUTPUT_APK_FOLDER = OUTPUT_DIR / "牧语算草_v1.0.apk"
PUBLIC_APK_DEST = FRONTEND_DIR / "public" / "牧语算草_Android_v1.0.apk"


def log(msg):
    print(f"[APK-Builder] {msg}")


def check_prerequisites():
    log("检查构建环境...")
    # 检查 Node
    try:
        res = subprocess.run(["npm", "--version"], capture_output=True, text=True, shell=True)
        log(f"Node npm 版本: {res.stdout.strip()}")
    except Exception as e:
        log(f"警告: 未检测到 npm: {e}")

    # 检查 Java
    java_home = os.environ.get("JAVA_HOME")
    if not java_home:
        candidate = Path(r"C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot")
        if candidate.exists():
            os.environ["JAVA_HOME"] = str(candidate)
            os.environ["PATH"] = f"{candidate / 'bin'};{os.environ['PATH']}"
            log(f"已自动配置 JAVA_HOME: {candidate}")
    else:
        log(f"当前 JAVA_HOME: {java_home}")

    # 检查 Android SDK
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not android_home:
        candidate_sdk = Path.home() / "AppData" / "Local" / "Android" / "Sdk"
        if candidate_sdk.exists():
            os.environ["ANDROID_HOME"] = str(candidate_sdk)
            log(f"已自动配置 ANDROID_HOME: {candidate_sdk}")
    else:
        log(f"当前 ANDROID_HOME: {android_home}")


def optimize_frontend_dist():
    log("加固前端 HTML（转换为高兼容性内联单文件，消除 module/CORS 限制）...")
    dist_html = FRONTEND_DIR / "dist" / "index.html"
    if not dist_html.exists():
        raise FileNotFoundError(f"未找到构建产物: {dist_html}")

    content = dist_html.read_text(encoding="utf-8")

    # 1. 替换 module script 标签为普通 defer script 标签，彻底避免旧版或厂商定制 WebView 的 module/CORS 策略阻断
    content = re.sub(r'<script\s+type=["\']module["\']\s+crossorigin>', '<script defer>', content)
    content = re.sub(r'<script\s+type=["\']module["\']>', '<script defer>', content)

    # 2. 如果 script 位于 head 中，将其迁移至 body 底部，确保 DOM #root 节点已完全解析
    script_match = re.search(r'(<script defer>.*?</script>)', content, re.DOTALL)
    if script_match and "</body>" in content:
        script_block = script_match.group(1)
        root_idx = content.find('id="root"')
        script_idx = content.find(script_block)
        if script_idx != -1 and script_idx < root_idx:
            content = content[:script_idx] + content[script_idx + len(script_block):]
            content = content.replace("</body>", f"{script_block}\n  </body>")
            log("已将核心应用脚本从 head 迁移至 body 底部，保障 DOM #root 即时可用")

    dist_html.write_text(content, encoding="utf-8")
    log(f"前端 HTML 单文件加固完成，总大小: {len(content):,} 字节")


def build_frontend():
    log("步骤 1/4: 编译前端静态资源...")
    cmd = "npm run build"
    log(f"执行: {cmd} (工作目录: {FRONTEND_DIR})")
    ret = subprocess.run(cmd, shell=True, cwd=FRONTEND_DIR)
    if ret.returncode != 0:
        raise RuntimeError(f"前端构建失败，退出码: {ret.returncode}")
    log("前端编译成功！")
    optimize_frontend_dist()


def sync_assets():
    log("步骤 2/4: 同步静态资源到 Android assets...")
    frontend_dist = FRONTEND_DIR / "dist"
    if not frontend_dist.exists():
        raise RuntimeError(f"未找到前端输出目录: {frontend_dist}")

    assets_root = ANDROID_DIR / "app" / "src" / "main" / "assets"
    if assets_root.exists():
        shutil.rmtree(assets_root)
    assets_root.mkdir(parents=True, exist_ok=True)

    # 1. 注入 assets/ 根目录（排除 APK 安装包文件，避免把安装包打包进自身）
    for item in frontend_dist.iterdir():
        if item.suffix.lower() == ".apk":
            continue
        dest = assets_root / item.name
        if item.is_dir():
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(item, dest, ignore=shutil.ignore_patterns("*.apk"))
        else:
            shutil.copyfile(item, dest)

    # 2. 同时保留 assets/dist/ 以保证历史兼容性（同样排除 APK）
    if ASSETS_DIST_DIR.exists():
        shutil.rmtree(ASSETS_DIST_DIR)
    shutil.copytree(frontend_dist, ASSETS_DIST_DIR, ignore=shutil.ignore_patterns("*.apk"))

    file_count = sum(len(files) for _, _, files in os.walk(assets_root))
    log(f"静态资源同步完成（已自动排除外部 APK），共注入 {file_count} 个核心文件至 Android assets 目录")


def build_apk():
    log("步骤 3/4: 调用 Gradle 构建签名 Release APK...")
    gradlew = ANDROID_DIR / ("gradlew.bat" if sys.platform == "win32" else "gradlew")
    if not gradlew.exists():
        raise RuntimeError(f"未找到 gradlew 脚本: {gradlew}")

    cmd = f"{gradlew} assembleRelease --no-daemon"
    log(f"执行: {cmd} (工作目录: {ANDROID_DIR})")
    ret = subprocess.run(str(gradlew) + " assembleRelease --no-daemon", shell=True, cwd=ANDROID_DIR)
    if ret.returncode != 0:
        raise RuntimeError(f"Gradle 构建失败，退出码: {ret.returncode}")
    
    if not RELEASE_APK_SRC.exists():
        raise RuntimeError(f"构建完成但未找到目标 APK: {RELEASE_APK_SRC}")
    log("APK 编译及签名成功！")


def deploy_apk():
    log("步骤 4/4: 发布并归档 APK 文件...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(RELEASE_APK_SRC, OUTPUT_APK_ROOT)
    shutil.copyfile(RELEASE_APK_SRC, OUTPUT_APK_FOLDER)
    if PUBLIC_APK_DEST.parent.exists():
        shutil.copyfile(RELEASE_APK_SRC, PUBLIC_APK_DEST)

    size_bytes = OUTPUT_APK_ROOT.stat().st_size
    size_mb = size_bytes / (1024 * 1024)

    with open(OUTPUT_APK_ROOT, "rb") as f:
        sha256 = hashlib.sha256(f.read()).hexdigest()

    log("=" * 60)
    log("构建与发布成功！")
    log(f"APK 文件大小: {size_mb:.2f} MB ({size_bytes:,} 字节)")
    log(f"SHA-256 校验码: {sha256}")
    log(f"发布路径 1: {OUTPUT_APK_ROOT}")
    log(f"发布路径 2: {OUTPUT_APK_FOLDER}")
    log(f"发布路径 3: {PUBLIC_APK_DEST}")
    log("=" * 60)


def main():
    try:
        check_prerequisites()
        build_frontend()
        sync_assets()
        build_apk()
        deploy_apk()
    except Exception as e:
        log(f"构建过程中断: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
