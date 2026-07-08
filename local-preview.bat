@echo off
REM 调用同目录 PowerShell 预览脚本。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-preview.ps1" %*
