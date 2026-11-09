@echo off
cd /d "%~dp0.."
python -m venv work\notif-motor-venv
if errorlevel 1 exit /b 1
work\notif-motor-venv\Scripts\python.exe -m pip install -r local-server\requirements.txt
if errorlevel 1 exit /b 1
call npm install
if errorlevel 1 exit /b 1
call npm run build
pause
