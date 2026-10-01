@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

set "PYTHON=python"
if exist "..\..\.venv\Scripts\python.exe" set "PYTHON=..\..\.venv\Scripts\python.exe"
if exist "..\.venv\Scripts\python.exe" set "PYTHON=..\.venv\Scripts\python.exe"

echo Starting dashboard. Open the URL printed below.
echo Keep this window open while using the dashboard.
"%PYTHON%" "scripts\serve_dashboard.py" %*
set "EXIT_CODE=%ERRORLEVEL%"

popd
pause
exit /b %EXIT_CODE%