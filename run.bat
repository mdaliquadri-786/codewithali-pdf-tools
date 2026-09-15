@echo off
title CodeWithAli PDF Tools Suite
echo ========================================================
echo   CodeWithAli PDF Tools Suite - Starting Server...
echo ========================================================
echo.
node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred. Keeping window open for details:
    pause
)
