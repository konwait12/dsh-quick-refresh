# publish.ps1 - 初始化 git、提交代码、创建 GitHub 仓库并推送
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1
#
# 可选：
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1 -NoPublish   # 只提交到本地 git，不推 GitHub

param(
  [switch]$NoPublish
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1) 确保有 package.json
if (-not (Test-Path .\package.json)) {
  throw 'package.json not found in current directory'
}

# 2) 初始化 git（如未初始化）
if (-not (Test-Path .\.git)) {
  git init | Out-Null
  git branch -M main
}

# 3) 添加并提交
git add .
if (-not (git diff --cached --quiet)) {
  git commit -m "feat: initial release of dsh-quick-refresh"
} else {
  Write-Host "No changes to commit."
}

# 4) 只本地提交
if ($NoPublish) {
  Write-Host ""
  Write-Host "Local git repo is ready. Run publish.ps1 without -NoPublish to create GitHub repo and push."
  exit 0
}

# 5) 检查 gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "gh CLI not found. Please create the repo at https://github.com/konwait12/dsh-quick-refresh manually, then run:"
  Write-Host "  git push -u origin main"
  exit 1
}

# 6) 确认 gh 已登录
try {
  gh auth status | Out-Null
} catch {
  Write-Host "gh is not logged in. Run: gh auth login"
  exit 1
}

# 7) 创建或复用仓库并推送
gh repo view konwait12/dsh-quick-refresh 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating GitHub repo: konwait12/dsh-quick-refresh ..."
  gh repo create dsh-quick-refresh --public --source=. --remote=origin --push `
    --description "DSH Web 主动刷新/热应用插件：把 cordis.patch.yml 变更即时应用到 Loader，免重启客户端。" `
    --homepage "https://github.com/konwait12/dsh-quick-refresh"
} else {
  Write-Host "Repo already exists. Pushing to origin ..."
  git remote add origin https://github.com/konwait12/dsh-quick-refresh.git 2>$null
  git push -u origin main
}

Write-Host ""
Write-Host "Done: https://github.com/konwait12/dsh-quick-refresh"
