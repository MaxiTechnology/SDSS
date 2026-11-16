@echo off
cd /d "%~dp0backend"
".venv\Scripts\python.exe" configure_database.py
if errorlevel 1 pause
