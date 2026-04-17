param(
  [string]$TaskName = "AgentBoxOutreachHourly",
  [string]$ProjectPath = "",
  [string]$StartTime = "09:00"
)

if (-not $ProjectPath) {
  $ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

if (-not (Test-Path $ProjectPath)) {
  throw "ProjectPath not found: $ProjectPath"
}

$command = 'cmd /c cd /d "{0}" && npm run outreach:run' -f $ProjectPath
$createArgs = @(
  "/Create",
  "/SC", "HOURLY",
  "/MO", "1",
  "/TN", $TaskName,
  "/TR", $command,
  "/ST", $StartTime,
  "/F"
)

Write-Host "Registering task: $TaskName"
Write-Host "Project path: $ProjectPath"
Write-Host "Start time: $StartTime"

$createResult = Start-Process -FilePath schtasks.exe -ArgumentList $createArgs -NoNewWindow -Wait -PassThru
if ($createResult.ExitCode -ne 0) {
  throw "Failed to create scheduled task. Exit code: $($createResult.ExitCode)"
}

Write-Host "Task created successfully."
Write-Host "Use this to run immediately: schtasks /Run /TN \"$TaskName\""
