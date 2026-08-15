@echo off
chcp 65001 >nul
title dsh-quick-refresh - 发布到 GitHub
cd /d "%~dp0"

echo ============================================
echo  dsh-quick-refresh 一键发布到 GitHub
echo ============================================
echo.

where gh >nul 2>nul
if %errorlevel% neq 0 (
    echo [提示] 未检测到 GitHub CLI (gh).
    echo.
    echo 你可以:
    echo   1. 先安装: winget install --id GitHub.cli
    echo   2. 或者手动创建: https://github.com/new
    echo      - Owner: konwait12
    echo      - Repository name: dsh-quick-refresh
    echo      - Public
    echo      建完后重新运行本脚本。
    echo.
    pause
    exit /b 1
)

gh auth status >nul 2>nul
if %errorlevel% neq 0 (
    echo [提示] 还未登录 GitHub.
    echo 请先运行: gh auth login
    echo.
    pause
    exit /b 1
)

echo [1/4] 初始化 git 并提交...
git init >nul 2>nul
git branch -M main 2>nul
git add .
git commit -m "feat: initial release of dsh-quick-refresh" >nul 2>nul

echo [2/4] 检查是否已存在仓库...
gh repo view konwait12/dsh-quick-refresh >nul 2>nul
if %errorlevel% neq 0 (
    echo [3/4] 创建远程仓库并推送...
    gh repo create dsh-quick-refresh --public --source=. --remote=origin --push --description "DSH Web 主动刷新/热应用插件：把 cordis.patch.yml 变更即时应用到 Loader，免重启客户端。" --homepage "https://github.com/konwait12/dsh-quick-refresh"
) else (
    echo [3/4] 仓库已存在，直接推送...
    git remote add origin https://github.com/konwait12/dsh-quick-refresh.git 2>nul
    git push -u origin main
)

echo.
echo ============================================
echo  完成!
echo  仓库地址: https://github.com/konwait12/dsh-quick-refresh
echo ============================================
pause
