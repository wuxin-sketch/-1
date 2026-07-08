param(
  [ValidateSet("dev", "preview")]
  [string]$Mode = "dev"
)

# 定位当前项目目录。
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = "D:\codex-workspace\tools\Start-ProjectPreview.ps1"

# 根据预览模式选择固定端口和启动命令。
if ($Mode -eq "preview") {
  $port = 8787
  $command = "npm run serve:prod"
  $buildBeforeStart = $false
} else {
  $port = 5175
  $command = "npm run dev"
  $buildBeforeStart = $false
}

# 调用统一预览启动器执行身份校验和端口校验。
& $launcher -ProjectRoot $projectRoot -ProjectLabel "6-29 月值好车" -ExpectedPackageName "yuezhi-haoche-terminal" -Mode $Mode -Port $port -Command $command -InstallIfMissing -BuildBeforeStart:$buildBeforeStart -WaitForExit
