@echo off
chcp 65001 >nul
title 奶山羊智能日粮配比助手 - 桌面版启动器
echo ============================================================
echo  正在启动 奶山羊智能日粮配比助手 (桌面版)...
echo ============================================================

set SCRIPT_DIR=%~dp0
set VENV_PYTHON=%SCRIPT_DIR%backend\.venv\Scripts\python.exe

if not exist "%VENV_PYTHON%" (
    echo [错误] 未找到虚拟环境 Python: %VENV_PYTHON%
    pause
    exit /b 1
)

start "" "%VENV_PYTHON%" "%SCRIPT_DIR%desktop_app.py"
echo 桌面窗口已唤起，本控制台窗口将在 3 秒后自动关闭...
timeout /t 3 >nul
exit
