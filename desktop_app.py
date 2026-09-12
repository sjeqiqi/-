# -*- coding: utf-8 -*-
"""奶山羊智能日粮配比助手 - 桌面应用主控入口

负责管理后台 FastAPI 服务与原生桌面窗口 (PyWebView / WebView2) 的生命周期：
1. 探测空闲端口 (默认 28350)；
2. 后台守护线程启动 Uvicorn ASGI 服务器；
3. 轮询健康检查探针 /api/health 确认就绪；
4. 创建并呈现原生 Windows 桌面独立窗口 (1280x850)；
5. 支持异常降级调用系统浏览器与窗口关闭自动退出。
"""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

# Windows --windowed 模式下 sys.stdout / sys.stderr 为 None，重定向到 Dummy 流防 uvicorn.logging 崩溃
class NullWriter:
    def write(self, s):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = NullWriter()
if sys.stderr is None:
    sys.stderr = NullWriter()

# 设置日志文件路径（与可执行文件同级）
if getattr(sys, "frozen", False):
    LOG_FILE = Path(sys.executable).resolve().parent / "desktop_app.log"
else:
    LOG_FILE = Path(__file__).resolve().parent / "desktop_app.log"

def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    try:
        print(line)
    except Exception:
        pass
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

log(f"程序启动, frozen={getattr(sys, 'frozen', False)}, exe={sys.executable}")


# 适配开发源码目录与打包冻结目录
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if BACKEND_DIR.exists() and str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# 加载应用
try:
    from app.main import app
    log("成功导入 app.main:app")
except Exception as e:
    log(f"导入 app.main 失败: {e}\n{traceback.format_exc()}")
    try:
        from backend.app.main import app
        log("成功导入 backend.app.main:app")
    except Exception as e2:
        log(f"导入 backend.app.main 也失败: {e2}\n{traceback.format_exc()}")
        raise



def get_free_port(preferred: int = 28350) -> int:
    """探测首选端口，若已被占用则自动分配可用端口。"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", preferred))
            return preferred
    except OSError:
        pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(url: str, timeout: float = 12.0) -> bool:
    """轮询检测后台服务是否就绪。"""
    health_url = f"{url}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(health_url)
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.1)
    return False


def find_icon_path() -> str | None:
    """寻找应用图标路径。"""
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / "app_icon.ico")
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "app_icon.ico")
    candidates.append(ROOT_DIR / "app_icon.ico")
    candidates.append(ROOT_DIR / "backend" / "app_icon.ico")

    for c in candidates:
        if c.exists():
            return str(c)
    return None


def run_desktop(host: str = "127.0.0.1", port: int = 28350, force_browser: bool = False):
    """启动服务并打开桌面窗口或浏览器。"""
    import uvicorn

    actual_port = get_free_port(port)
    base_url = f"http://{host}:{actual_port}"

    log(f"============================================================")
    log(f" 奶山羊智能日粮配比助手 - 独立桌面应用版 v1.0")
    log(f" 本地服务地址: {base_url}")
    log(f"============================================================")

    # 1. 启动 Uvicorn 后台服务
    config = uvicorn.Config(
        app=app,
        host=host,
        port=actual_port,
        log_config=None,  # 避免 uvicorn 自带 ColourizedFormatter 检测 isatty 崩溃
        access_log=False,
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True, name="uvicorn-worker")
    server_thread.start()

    # 2. 等待服务就绪
    log("正在初始化本地计算引擎与前端资源...")
    if not wait_for_server(base_url, timeout=15.0):
        log("警告: 探针检测超时，将尝试继续打开窗口...")
    else:
        log("计算引擎与数据库加载完成，正在启动桌面界面...")

    # 3. 判断是否使用原生桌面窗口 (PyWebView)
    has_webview = False
    if not force_browser:
        try:
            import webview
            has_webview = True
            log("检测到 pywebview，准备启动原生桌面窗口...")
        except Exception as exc:
            log(f"未检测到 pywebview 或初始化失败 ({exc})，自动降级为浏览器模式。")

    icon_path = find_icon_path()
    log(f"使用图标路径: {icon_path}")

    if has_webview:
        try:
            import webview

            window = webview.create_window(
                title="牧语算草 (独立桌面版)",
                url=base_url,
                width=1280,
                height=850,
                min_size=(1024, 680),
                text_select=True,
                confirm_close=False,
            )

            def on_closed():
                log("桌面窗口已关闭，正在停止后台服务...")
                server.should_exit = True

            window.events.closed += on_closed

            # 启动桌面窗口事件循环 (阻塞直至窗口关闭)
            log("正在唤起原生桌面独立窗口...")
            webview.start(debug=False, icon=icon_path)
            log("桌面窗口生命周期结束")
            server.should_exit = True
            return
        except Exception as exc:
            log(f"原生窗口启动遇到异常: {exc}\n{traceback.format_exc()}，切换至系统默认浏览器...")

    # 4. 浏览器降级模式
    log(f"正在打开系统默认浏览器: {base_url}")
    webbrowser.open(base_url)
    log("浏览器模式运行中，退出请关闭进程。")
    try:
        while not server.should_exit:
            time.sleep(0.5)
    except KeyboardInterrupt:
        log("收到退出信号，程序安全退出。")
        server.should_exit = True


def main():
    try:
        parser = argparse.ArgumentParser(description="奶山羊智能日粮配比助手 - 桌面应用版")
        parser.add_argument("--host", default="127.0.0.1", help="监听主机地址 (默认: 127.0.0.1)")
        parser.add_argument("--port", type=int, default=28350, help="服务端口 (默认: 28350)")
        parser.add_argument("--browser", action="store_true", help="强制直接使用浏览器打开而非独立窗口")
        args = parser.parse_args()

        run_desktop(host=args.host, port=args.port, force_browser=args.browser)
    except Exception as e:
        log(f"主程序异常: {e}\n{traceback.format_exc()}")
        sys.exit(1)


if __name__ == "__main__":
    main()

