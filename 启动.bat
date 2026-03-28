@echo off
title A股涨幅榜
echo.
echo  ==============================
echo    A股今日涨幅榜  启动中...
echo  ==============================
echo.
cd /d "%~dp0"
start "" "http://localhost:5000"
node server.js
pause
