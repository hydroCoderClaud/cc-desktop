@echo off
echo Opening Naive UI + Claude Theme Demo...
echo.
echo 正在浏览器中打开测试页面...
echo.

start "" "%~dp0demo.html"

echo.
echo 测试页面已在浏览器中打开！
echo.
echo 请对比左右两侧的视觉效果：
echo   左侧 = 原生 Claude 风格
echo   右侧 = Naive UI + Claude 主题
echo.
echo 测试完成后，请告诉我你的决定：
echo   1. 使用 Naive UI（85-90%% 相似）
echo   2. 自己写组件（100%% 相似）
echo   3. 混合方案
echo.
pause
