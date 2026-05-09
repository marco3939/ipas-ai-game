@echo off
chcp 65001 > nul
title IPAS AI Game - Local Server
cd /d "%~dp0src"
echo.
echo ==========================================
echo   IPAS AI Game - Local Server
echo ==========================================
echo.
echo  Starting at http://localhost:8000
echo  (Press Ctrl+C to stop)
echo.
echo ==========================================
echo.
start "" "http://localhost:8000"
python -m http.server 8000
pause
