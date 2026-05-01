@echo off
title 涨势通
echo.
echo  ==============================
echo    涨势通  启动中...
echo  ==============================
echo.
cd /d "%~dp0"
start "" "http://localhost:5000"
node server.js
pause
