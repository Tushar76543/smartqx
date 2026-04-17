@echo off
setlocal

:: Fix for broken system PATH
set "PATH=C:\Windows\System32;C:\Windows;%PATH%"

echo ============================================
echo    Smart-QX Production Startup Script
echo ============================================
echo.

set "ROOT=%~dp0"
set "DOCKER_EXE=C:\Program Files\Docker\Docker\resources\bin\docker.exe"

echo [1/4] Starting Docker containers (PostgreSQL + Redis)...
if not exist "%DOCKER_EXE%" (
    echo [ERROR] Docker CLI not found at "%DOCKER_EXE%".
    pause
    exit /b 1
)

"%DOCKER_EXE%" compose -f "%ROOT%docker-compose.yml" up -d --wait
if %errorlevel% neq 0 (
    echo [ERROR] Docker failed. Please open Docker Desktop first, then run this script again.
    pause
    exit /b 1
)
echo [OK] Docker containers started and healthy!
echo.

echo [2/4] Starting Backend Server...
start "SmartQX-Backend" "%SystemRoot%\System32\cmd.exe" /k "cd /d ""%ROOT%backend"" & (if not exist venv\Scripts\python.exe py -m venv venv) & venv\Scripts\python.exe -m pip install -r requirements.txt & venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
echo [OK] Backend starting in new window!
echo.

echo [3/4] Starting Frontend...
start "SmartQX-Frontend" "%SystemRoot%\System32\cmd.exe" /k "cd /d ""%ROOT%frontend"" & (if not exist node_modules\.bin\vite.cmd call npm install) & npm run dev -- --host 127.0.0.1 --strictPort --port 5173"
echo [OK] Frontend starting in new window!
echo.

echo [4/4] Waiting a moment for dev servers to boot...
timeout /t 5 /nobreak >nul

echo ============================================
echo    ALL SYSTEMS LAUNCHING!
echo ============================================
echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  Admin:    http://localhost:5173/admin
echo  Scanner:  http://localhost:5173/scanner
echo.
echo  Wait ~30 seconds for everything to boot.
echo  Then open http://localhost:5173 in your browser!
echo ============================================
pause
