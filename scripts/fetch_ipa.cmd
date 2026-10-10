@echo off
rem ---------------------------------------------------------------------------
rem Fetch the newest unsigned IPA from GitHub Actions.
rem
rem Double-click this file, or run it from a terminal. It only wraps
rem fetch_ipa.ps1 with -ExecutionPolicy Bypass, because this machine's
rem CurrentUser execution policy is RemoteSigned and the .ps1 has no
rem digital signature (loading it directly fails with "is not digitally
rem signed").
rem
rem This file is intentionally ASCII-only: a .cmd with UTF-8 Chinese text
rem shows up as mojibake in a GBK console window.
rem ---------------------------------------------------------------------------
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fetch_ipa.ps1" %*
echo.
pause
