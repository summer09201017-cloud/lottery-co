@echo off
chcp 65001 >nul
title 跑馬燈抽獎機 啟動器
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [X] 找不到 Node.js, 請先到 https://nodejs.org 安裝 Node.js 18 或以上版本。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo [1/2] 第一次執行, 正在安裝相依套件 ^(約 1-3 分鐘^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [X] npm install 失敗, 請檢查網路或刪除 node_modules 後重試。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo  跑馬燈抽獎機 啟動中
echo  本機網址 : http://localhost:5173/
echo  投影視窗 : http://localhost:5173/?display=1
echo  關閉本視窗或按 Ctrl+C 即可停止伺服器
echo ============================================================
echo.

call npm run dev -- --open

echo.
echo dev server 已停止。按任意鍵關閉視窗。
pause >nul
