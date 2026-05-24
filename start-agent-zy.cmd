@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set "TASK_NAME=Agent ZY Dev Servers"
set "WEB_PORT=5173"
set "API_PORT=4378"

echo Starting Agent ZY dev servers...
echo Project: %CD%
echo.

call :is_port_listening %WEB_PORT%
set "WEB_ALREADY_RUNNING=%ERRORLEVEL%"
call :is_port_listening %API_PORT%
set "API_ALREADY_RUNNING=%ERRORLEVEL%"

if "%WEB_ALREADY_RUNNING%"=="0" (
  echo Port %WEB_PORT% is already in use.
  echo If you want to restart the project, run scripts\restart-dev.ps1 instead.
  echo.
  pause
  exit /b 1
)

if "%API_ALREADY_RUNNING%"=="0" (
  echo Port %API_PORT% is already in use.
  echo If you want to restart the project, run scripts\restart-dev.ps1 instead.
  echo.
  pause
  exit /b 1
)

schtasks /Query /TN "%TASK_NAME%" >nul 2>nul
if errorlevel 1 (
  echo Startup task "%TASK_NAME%" was not found.
  echo Run scripts\install-startup-task.ps1 once, then double-click this file again.
  echo.
  pause
  exit /b 1
)

schtasks /Run /TN "%TASK_NAME%" >nul
if errorlevel 1 (
  echo Failed to start task "%TASK_NAME%".
  echo.
  pause
  exit /b 1
)

echo Waiting for ports %WEB_PORT% and %API_PORT%...

for /L %%I in (1,1,30) do (
  call :is_port_listening %WEB_PORT%
  set "WEB_READY=!ERRORLEVEL!"
  call :is_port_listening %API_PORT%
  set "API_READY=!ERRORLEVEL!"

  if "!WEB_READY!"=="0" if "!API_READY!"=="0" (
    echo Agent ZY started successfully.
    timeout /t 1 /nobreak >nul
    exit /b 0
  )

  timeout /t 1 /nobreak >nul
)

echo Agent ZY did not report ready within 30 seconds.
echo Check the latest log in .agent-zy-data\logs for details.
echo.
pause
exit /b 1

:is_port_listening
netstat -ano -p tcp | findstr /R /C:":%~1 .*LISTENING" >nul 2>nul
exit /b %ERRORLEVEL%
