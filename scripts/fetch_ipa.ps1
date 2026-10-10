<#
  从 GitHub Actions 把最新一次构建好的未签名 IPA 抓到本机。

  为什么要有这个脚本：
    artifact 的 /zip 端点必须带身份（匿名访问是 401），而网页版 Actions
    页面又只能手动点、下完还是嵌套的 zip（里面才是 .ipa）。这里把
    「查最新一次成功的 run → 下载 artifact → 解出 .ipa → 打印 sha256」
    合成一条命令，省掉每次打包后的重复劳动。

  身份从哪来：
    和 git push 用的是同一份 —— git 的 credential helper 里存的 GitHub
    token。脚本只把它放进 Authorization 头，**不会打印出来**。

  用法（在 retro-film-cam 目录下）：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch_ipa.ps1
    ... -Out "$env:USERPROFILE\Desktop\FretroCam.ipa"
    ... -Run 38038878678      # 指定某一次 run

  跑完会打印 IPA 的路径、大小和 sha256；把这个文件用隔空投送 / 文件 App /
  数据线丢进 iPhone，再交给 SideStore 安装（见《如何装到手机上.md》）。

  ⚠️ 两个 Windows 特有的坑，都踩过：
  1. 这个文件必须以 **UTF-8 带 BOM** 保存。Windows PowerShell 5.1 读 .ps1 时，
     没有 BOM 就按系统 ANSI（本机是 GBK）解码，中文注释被拆成乱码，然后报一堆
     看不懂的语法错（`Missing expression after ','`、
     `The ampersand (&) character is not allowed`）。用记事本另存为时要选
     「UTF-8 带 BOM」，别选「UTF-8」。
  2. 本机 CurrentUser 的执行策略是 RemoteSigned，没有数字签名的 .ps1 会被直接
     拒绝加载（`is not digitally signed`），所以要么加 -ExecutionPolicy Bypass，
     要么双击同目录下的 fetch_ipa.cmd。
  3. ⚠️ 用脚本或编辑器的「替换」改这个文件时，BOM 很容易被吃掉（实测
     deepseek harness 的 edit 工具就会）。改完回头确认前三个字节是 EF BB BF；
     不是的话补回去，否则又变成一堆乱码语法错：
       [System.IO.File]::WriteAllText($p, $text, [System.Text.UTF8Encoding]::new($true))
#>
[CmdletBinding()]
param(
  # owner/repo
  [string]$Repo = 'lizimo20041023-oss/retro-film-cam',

  # .ipa 落地的位置。默认放在仓库的**上一级**（也就是工作区根目录），
  # 免得一个几百 KB 的构建产物混进 git status。
  [string]$Out = '',

  # 指定某一次 run（id 或序号）。不给就取最新一次成功的。
  [string]$Run = '',

  # artifact 名字。和 .github/workflows/build-ios-ipa.yml 里的 name 一致。
  [string]$ArtifactName = 'FretroCam-unsigned-ipa'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Out)) {
  $Out = Join-Path (Split-Path -Parent $repoRoot) 'FretroCam-unsigned.ipa'
}

function Get-GitHubToken {
  $cred = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
  $line = $cred | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
  if (-not $line) { return '' }
  return $line.Substring(9)
}

function Invoke-GitHubApi([string]$Path) {
  $raw = & curl.exe -sL --max-time 60 -H "Authorization: Bearer $script:token" `
                    -H "Accept: application/vnd.github+json" `
                    "https://api.github.com$Path"
  if (-not $raw) { throw "api.github.com$Path 没有返回任何内容（网络断了？）" }
  try { return $raw | ConvertFrom-Json } catch { throw "api.github.com$Path 返回的不是 JSON：$($raw.Substring(0, [Math]::Min(200, $raw.Length)))" }
}

Write-Host "仓库：$Repo"

$token = Get-GitHubToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "git 的凭据里没有 github.com 的 token。先在仓库里跑一次 git push（让它弹窗登录），再回来跑这个脚本。"
}
Write-Host "身份：已从 git credential helper 取到（不打印）"

# ── 1. 找 run ────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($Run)) {
  # status=success 过滤掉排队中和失败的；按创建时间倒序，第一条就是最新的。
  $runs = Invoke-GitHubApi "/repos/$Repo/actions/runs?per_page=20&status=success"
  if ($runs.workflow_runs.Count -eq 0) { throw "这个仓库还没有成功过任何一次 workflow（去 Actions 页面看看是不是构建挂了）。" }
  $target = $runs.workflow_runs[0]
} else {
  $target = Invoke-GitHubApi "/repos/$Repo/actions/runs/$Run"
  if ($target.status -ne 'completed') { throw "run $Run 还没跑完（status=$($target.status)），等一会儿再试。" }
  if ($target.conclusion -ne 'success') { throw "run $Run 的结论是 $($target.conclusion)，没有 artifact。去 Actions 页面看日志。" }
}

$sha7 = $target.head_sha.Substring(0, 7)
Write-Host ("run  #{0}  id={1}  commit={2}  {3}" -f $target.run_number, $target.id, $sha7, $target.display_title)
Write-Host ("     完成于 {0}" -f $target.updated_at)

# ── 2. 找 artifact ───────────────────────────────────────────────────────
$arts = Invoke-GitHubApi "/repos/$Repo/actions/runs/$($target.id)/artifacts"
$art = $arts.artifacts | Where-Object { $_.name -eq $ArtifactName } | Select-Object -First 1
if (-not $art) {
  $names = ($arts.artifacts | ForEach-Object { $_.name }) -join '、'
  throw "run $($target.run_number) 里没有叫「$ArtifactName」的 artifact。实际有：$names"
}
if ($art.expired) { throw "artifact 已经过期了（{0}）。重新跑一次 workflow 吧。" -f $art.expires_at }
Write-Host ("artifact  {0}  {1:N1} MB  sha256(压缩包)={2}" -f $art.name, ($art.size_in_bytes / 1MB), $art.digest)

# ── 3. 下载 + 解出 .ipa ──────────────────────────────────────────────────
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fretrocam-ipa-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $zip = Join-Path $tmp 'artifact.zip'
  Write-Host "下载中…"
  & curl.exe -sL --max-time 300 -H "Authorization: Bearer $token" `
              -H "Accept: application/vnd.github+json" `
              -o $zip "https://api.github.com/repos/$Repo/actions/artifacts/$($art.id)/zip"
  $got = (Get-Item $zip).Length
  if ($got -ne $art.size_in_bytes) { throw "下载不完整：拿到 $got 字节，应该是 $($art.size_in_bytes) 字节。" }

  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $ipa = Get-ChildItem $tmp -Filter *.ipa -Recurse | Select-Object -First 1
  if (-not $ipa) { throw "压缩包里没有 .ipa（里面有：$((Get-ChildItem $tmp -Name) -join '、')）" }

  # 产物目录可能不存在（第一次跑）；建出来。
  $outDir = Split-Path -Parent $Out
  if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  Copy-Item $ipa.FullName $Out -Force

  $hash = (Get-FileHash $Out -Algorithm SHA256).Hash.ToLower()
  Write-Host ""
  Write-Host "✔ IPA 已就绪" -ForegroundColor Green
  Write-Host ("  路径   {0}" -f $Out)
  Write-Host ("  大小   {0:N0} 字节 ({1:N2} MB)" -f (Get-Item $Out).Length, ((Get-Item $Out).Length / 1MB))
  Write-Host ("  sha256 {0}" -f $hash)
  Write-Host ""
  Write-Host "下一步：把这个 .ipa 传到 iPhone，用 SideStore / iloader 安装。"
  Write-Host "       详见仓库根目录的《如何装到手机上.md》。"
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
