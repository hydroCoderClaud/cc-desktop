@echo off
echo Opening Simple Demo (No CDN Dependencies)...
echo.
echo 正在浏览器中打开纯 HTML/CSS 测试页面...
echo.

start "" "%~dp0simple-demo.html"

echo.
echo 测试页面已在浏览器中打开！
echo.
echo 这是一个不依赖外部 CDN 的纯 HTML/CSS 版本
echo 页面包含：
echo   左侧 = 原生 Claude 风格
echo   右侧 = 模拟 Naive UI 效果（纯 CSS）
echo.
echo 请对比视觉效果，关注：
echo   ✓ 颜色是否一致
echo   ✓ 圆角是否一致
echo   ✓ 阴影效果差异
echo   ✓ 交互效果（hover/focus）
echo   ✓ 整体相似度（目标 85-90%%）
echo.
echo 测试完成后，请告诉我你的决定：
echo   1. 使用 Naive UI（85-90%% 相似）
echo   2. 自己写组件（100%% 相似，复制现有 CSS）
echo   3. 混合方案（基础组件自己写 + 高级组件用库）
echo.
pause
