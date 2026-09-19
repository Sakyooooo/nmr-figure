@echo off
cd /d "%~dp0"
title NMR Figure Editor

echo.
echo   NMR Figure Editor を準備しています
echo   (初回と、内容を更新した後は少し時間がかかります)
echo.

call npm run build
if errorlevel 1 goto error

echo.
echo   ブラウザで開きます。この黒い窓を閉じるとアプリも終わります。
echo.
call npm run preview -- --open --port 4173
goto end

:error
echo.
echo   準備に失敗しました。
echo   このフォルダで npm install を実行してから、もう一度お試しください。
echo.
pause

:end
