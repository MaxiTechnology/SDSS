@echo off
cd /d "%~dp0backend"
".venv\Scripts\python.exe" configure_ai.py
if errorlevel 1 pause
