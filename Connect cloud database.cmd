@echo off
cd /d "%~dp0backend"
".venv\Scripts\python.exe" configure_cloud.py
if errorlevel 1 pause
