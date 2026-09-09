# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/desktop_app.py'],
    pathex=['D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07', 'D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/backend'],
    binaries=[],
    datas=[('D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/frontend/dist', 'frontend/dist'), ('D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/backend/app/feeds', 'app/feeds'), ('D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/app_icon.ico', '.')],
    hiddenimports=['uvicorn', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'fastapi', 'starlette', 'starlette.staticfiles', 'starlette.responses', 'pydantic', 'scipy', 'scipy.optimize', 'scipy.optimize._linprog', 'scipy.optimize._linprog_highs', 'httpx', 'webview', 'webview.platforms.winforms', 'clr', 'clr_loader', 'pythonnet', 'app', 'app.main', 'app.models', 'app.optimizer', 'app.service', 'app.feeds', 'app.insights', 'app.ai', 'app.spec', 'app.nutrition'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='奶山羊智能日粮配比助手',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['D:/chuangxinchaungye/奶山羊日粮配比助手_源码_2026-08-07/app_icon.ico'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='奶山羊智能日粮配比助手',
)
