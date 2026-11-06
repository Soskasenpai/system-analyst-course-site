@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Сайт: http://localhost:8000  (остановить: Ctrl+C)
start "" http://localhost:8000
py -m http.server 8000 2>nul || python -m http.server 8000
