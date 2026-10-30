param(
  [ValidateSet('Run','Start','Stop','Status','Check')][string]$Action = 'Run',
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$')][string]$Branch = 'main',
  [ValidateRange(10,3600)][int]$IntervalSeconds = 900,
  [ValidateRange(1,65535)][int]$Port = 3000
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Deploy = Join-Path $Repo '.deploy'
$StateFile = Join-Path $Deploy 'state.json'
$StopFile = Join-Path $Deploy 'stop.flag'
$CheckFile = Join-Path $Deploy 'check.flag'
$DataDir = Join-Path $Repo 'data'
$Catalog = Join-Path $DataDir 'restaurants.json'
$Node = $null
$NpmCli = $null
$Git = $null
$script:Worker = $null
$script:State = $null
$script:Stopping = $false

function Read-State {
  if (Test-Path -LiteralPath $StateFile) { return (Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json) }
  return $null
}
function Write-Log([string]$Message) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
  Write-Host $line
  [IO.File]::AppendAllText((Join-Path $Deploy 'deploy.log'), $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}
function Save-State {
  $script:State.heartbeat = (Get-Date).ToUniversalTime().ToString('o')
  $temp = $StateFile + '.tmp'
  [IO.File]::WriteAllText($temp, ($script:State | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temp -Destination $StateFile -Force
}
function Set-Phase([string]$Phase, [string]$Message) {
  $script:State.phase = $Phase
  $script:State.message = $Message
  Save-State
  Write-Log $Message
}
function Quote-Argument([string]$Value) {
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}
function New-Process([string]$File, [string[]]$Arguments, [string]$Directory) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $File
  $info.Arguments = (($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
  $info.WorkingDirectory = $Directory
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
  $info.EnvironmentVariables['GCM_INTERACTIVE'] = 'never'
  $info.EnvironmentVariables['PATH'] = (Split-Path -Parent $Node) + ';' + $env:PATH
  return $info
}
function Invoke-Tool([string]$File, [string[]]$Arguments, [string]$Directory = $Repo, [int]$TimeoutSeconds = 180) {
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = New-Process $File $Arguments $Directory
  try {
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while (-not $process.WaitForExit(250)) {
      Pump-Logs $script:Worker
      Save-State
      if ((Test-Path -LiteralPath $StopFile) -or (Get-Date) -gt $deadline) {
        # Only terminate a process created by this runner, including its build children.
        if ($env:OS -eq 'Windows_NT') { & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F 2>&1 | Out-Null }
        else { $process.Kill() }
        throw '작업이 중지되었거나 제한 시간을 초과했습니다.'
      }
    }
    $text = ($stdout.GetAwaiter().GetResult() + [Environment]::NewLine + $stderr.GetAwaiter().GetResult()).Trim()
    if ($text) { Write-Log $text }
    if ($process.ExitCode -ne 0) { throw ('명령 실패: {0} {1} (exit {2})' -f $File, ($Arguments -join ' '), $process.ExitCode) }
    return $text
  } finally {
    try {
      if ($process.Id -gt 0 -and -not $process.HasExited) {
        if ($env:OS -eq 'Windows_NT') { & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F 2>&1 | Out-Null }
        else { $process.Kill() }
      }
    } catch { }
    $process.Dispose()
  }
}
function Pump-Logs($Worker) {
  if ($null -eq $Worker) { return }
  foreach ($stream in @('Out','Err')) {
    $taskName = $stream + 'Task'
    while ($null -ne $Worker[$taskName] -and $Worker[$taskName].IsCompleted) {
      $line = $Worker[$taskName].GetAwaiter().GetResult()
      if ($null -eq $line) { $Worker[$taskName] = $null; break }
      [IO.File]::AppendAllText($Worker.Log, $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
      if ($line -match 'localhost:(\d+)') { $Worker.DetectedPort = [int]$Matches[1] }
      if ($stream -eq 'Out') { $Worker[$taskName] = $Worker.Process.StandardOutput.ReadLineAsync() }
      else { $Worker[$taskName] = $Worker.Process.StandardError.ReadLineAsync() }
    }
  }
}
function Start-Server([string]$Release, [string]$Revision, [int]$ServerPort, [string]$ServerData, [string]$ServerCatalog) {
  $info = New-Process $Node @('server/index.mjs') $Release
  $info.RedirectStandardInput = $true
  $info.EnvironmentVariables['PORT'] = [string]$ServerPort
  $info.EnvironmentVariables['DATA_DIR'] = $ServerData
  $info.EnvironmentVariables['RESTAURANTS_FILE'] = $ServerCatalog
  $info.EnvironmentVariables['APP_REVISION'] = $Revision
  $info.EnvironmentVariables['AUTO_DEPLOY_MANAGED'] = '1'
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  [void]$process.Start()
  $worker = @{ Process=$process; DetectedPort=$ServerPort; Log=(Join-Path $Deploy ('server-' + $Revision.Substring(0,12) + '-' + $process.Id + '.log')); OutTask=$process.StandardOutput.ReadLineAsync(); ErrTask=$process.StandardError.ReadLineAsync() }
  return $worker
}
function Wait-Healthy($Worker, [string]$Revision) {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    Pump-Logs $Worker
    if ($Worker.Process.HasExited) { throw ('새 서버가 종료됐습니다. 로그: ' + $Worker.Log) }
    if ($Worker.DetectedPort -gt 0) {
      try {
        $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Worker.DetectedPort + '/api/health') -TimeoutSec 2
        if ($health.ok -and $health.revision -eq $Revision) { return }
      } catch { }
    }
    Start-Sleep -Milliseconds 300
  }
  throw ('서버 응답 시간 초과. 로그: ' + $Worker.Log)
}
function Stop-Server($Worker) {
  if ($null -eq $Worker) { return }
  if (-not $Worker.Process.HasExited) {
    try { $Worker.Process.StandardInput.WriteLine('shutdown'); $Worker.Process.StandardInput.Flush() } catch { }
    if (-not $Worker.Process.WaitForExit(8000)) { $Worker.Process.Kill(); [void]$Worker.Process.WaitForExit(3000) }
  }
  Pump-Logs $Worker
  $Worker.Process.Dispose()
}
function Copy-Data([string]$Destination) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  foreach ($name in @('restaurants.json','settings.json','history.jsonl','chat.jsonl','profiles.json','source-index.json')) {
    $source = Join-Path $DataDir $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $name) }
  }
}
function Deploy-Revision([string]$Revision) {
  $attempt = $Revision.Substring(0,12) + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  $release = Join-Path (Join-Path $Deploy 'releases') $attempt
  Set-Phase 'building' ('새 버전 검사 시작: ' + $Revision)
  [void](Invoke-Tool $Git @('worktree','add','--detach',$release,$Revision))
  [void](Invoke-Tool $Node @($NpmCli,'ci','--no-audit','--no-fund') $release 300)
  [void](Invoke-Tool $Node @($NpmCli,'test') $release 300)
  [void](Invoke-Tool $Node @($NpmCli,'run','build') $release 300)
  $smokeData = Join-Path (Join-Path $Deploy 'smoke') $attempt
  Copy-Data $smokeData
  $candidate = $null
  try {
    $candidate = Start-Server $release $Revision 0 $smokeData (Join-Path $smokeData 'restaurants.json')
    Wait-Healthy $candidate $Revision
  } finally { Stop-Server $candidate }
  if (Test-Path -LiteralPath $StopFile) { throw '중지 요청으로 배포를 취소했습니다.' }
  # Give an active 4.2 second wheel animation time to finish before restarting.
  $idleDeadline = (Get-Date).AddSeconds(12)
  while ($null -ne $script:Worker -and -not $script:Worker.Process.HasExited) {
    try {
      $live = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + '/api/state') -TimeoutSec 2
      $spinning = @($live.rooms.PSObject.Properties | Where-Object { $null -ne $_.Value.spin }).Count -gt 0
    } catch { $spinning = $false }
    if (-not $spinning) { break }
    if ((Get-Date) -gt $idleDeadline) { throw '회전이 계속 진행 중이므로 이번 교체를 보류했습니다. auto:check로 다시 시도하세요.' }
    Start-Sleep -Milliseconds 500
  }
  $previousRelease = $script:State.activeRelease
  $previousRevision = $script:State.activeRevision
  Copy-Data (Join-Path (Join-Path $Deploy 'backups') $attempt)
  Set-Phase 'restarting' '검사 통과. 서버를 새 버전으로 교체합니다.'
  Stop-Server $script:Worker
  $script:Worker = $null
  try {
    $script:Worker = Start-Server $release $Revision $Port $DataDir $Catalog
    Wait-Healthy $script:Worker $Revision
  } catch {
    $failure = $_
    Stop-Server $script:Worker
    $script:Worker = $null
    if ($previousRelease) {
      $script:Worker = Start-Server $previousRelease $previousRevision $Port $DataDir $Catalog
      Wait-Healthy $script:Worker $previousRevision
    }
    throw $failure
  }
  $script:State.activeRelease = $release
  $script:State.activeRevision = $Revision
  $script:State.failedRevision = $null
  $script:State.lastError = $null
  $script:State.deployedAt = (Get-Date).ToUniversalTime().ToString('o')
  Set-Phase 'running' ('배포 완료: ' + $Revision + ' / http://localhost:' + $Port)
}

if ($Action -eq 'Status') {
  $state = Read-State
  if ($null -eq $state) { Write-Host '자동 배포를 아직 실행하지 않았습니다.'; exit }
  $runner = Get-Process -Id $state.runnerPid -ErrorAction SilentlyContinue
  $alive = $null -ne $runner -and [math]::Abs(($runner.StartTime.ToUniversalTime() - [datetime]$state.startedAt).TotalSeconds) -lt 10
  Write-Host ('감시 프로세스 실행 중: ' + $alive)
  $state | Format-List
  Write-Host ('로그: ' + (Join-Path $Deploy 'deploy.log'))
  exit
}
if ($Action -eq 'Stop' -or $Action -eq 'Check') {
  if (-not (Test-Path -LiteralPath $Deploy)) { Write-Host '자동 배포가 실행 중이지 않습니다.'; exit }
  if ($Action -eq 'Stop') { [IO.File]::WriteAllText($StopFile, 'stop'); Write-Host '중지를 요청했습니다. 진행 중인 검사를 취소하고 서버를 종료합니다.' }
  else { [IO.File]::WriteAllText($CheckFile, 'check'); Write-Host '즉시 확인/재시도를 요청했습니다.' }
  exit
}
New-Item -ItemType Directory -Path $Deploy -Force | Out-Null
if ($Action -eq 'Start') {
  $existing = Read-State
  if ($null -ne $existing) {
    $runner = Get-Process -Id $existing.runnerPid -ErrorAction SilentlyContinue
    if ($null -ne $runner -and [math]::Abs(($runner.StartTime.ToUniversalTime() - [datetime]$existing.startedAt).TotalSeconds) -lt 10) { Write-Host '이미 자동 배포가 실행 중입니다. npm run auto:status로 확인하세요.'; exit }
  }
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-Action','Run','-Branch',$Branch,'-IntervalSeconds',[string]$IntervalSeconds,'-Port',[string]$Port)
  $argumentLine = (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argumentLine -WorkingDirectory $Repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Deploy ('runner-' + $stamp + '.stdout.log')) -RedirectStandardError (Join-Path $Deploy ('runner-' + $stamp + '.stderr.log'))
  Write-Host ('백그라운드 실행을 요청했습니다. PID ' + $process.Id + ' / npm run auto:status로 시작 결과를 확인하세요.')
  exit
}
$lock = $null
try {
  $lock = [IO.File]::Open((Join-Path $Deploy 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $Node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:LOCALAPPDATA 'lunch-node\bin\node.exe' }
  if (-not (Test-Path -LiteralPath $Node)) { throw 'Node 실행 파일을 찾을 수 없습니다.' }
  $Git = (Get-Command git.exe -ErrorAction Stop).Source
  $npmCandidates = @($env:npm_execpath, (Join-Path (Split-Path -Parent $Node) 'node_modules\npm\bin\npm-cli.js'), (Join-Path (Split-Path -Parent $Node) '..\packages\node_modules\npm\bin\npm-cli.js'))
  $NpmCli = $npmCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if (-not $NpmCli) { throw 'npm CLI를 찾지 못했습니다. npm run auto:start 또는 npm run auto:run으로 실행하세요.' }
  try { $busy = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + '/api/health') -TimeoutSec 2 } catch { $busy = $null }
  if ($busy) { throw ('이미 ' + $Port + '번 포트에 서버가 켜져 있습니다. 기존 npm run dev/start를 Ctrl+C로 종료한 뒤 다시 실행하세요.') }
  $previous = Read-State
  $script:State = [ordered]@{ runnerPid=$PID; startedAt=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o'); heartbeat=$null; phase='starting'; message='자동 배포 시작'; branch=$Branch; port=$Port; intervalSeconds=$IntervalSeconds; activeRevision=$previous.activeRevision; activeRelease=$previous.activeRelease; failedRevision=$null; lastError=$null; deployedAt=$previous.deployedAt }
  if (Test-Path -LiteralPath $StopFile) { Remove-Item -LiteralPath $StopFile }
  New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
  if (-not (Test-Path -LiteralPath $Catalog)) { Copy-Item -LiteralPath (Join-Path $Repo 'config\restaurants.json') -Destination $Catalog }
  if ($script:State.activeRelease -and (Test-Path -LiteralPath $script:State.activeRelease)) {
    $script:Worker = Start-Server $script:State.activeRelease $script:State.activeRevision $Port $DataDir $Catalog
    Wait-Healthy $script:Worker $script:State.activeRevision
    Set-Phase 'running' '이전 정상 버전으로 서버를 시작했습니다.'
  }
  $nextCheck = Get-Date
  while (-not (Test-Path -LiteralPath $StopFile)) {
    Pump-Logs $script:Worker
    Save-State
    $forced = Test-Path -LiteralPath $CheckFile
    if ((Get-Date) -ge $nextCheck -or $forced) {
      if ($forced) { Remove-Item -LiteralPath $CheckFile }
      $target = $null
      try {
        Set-Phase 'checking' ('origin/' + $Branch + ' 확인 중')
        [void](Invoke-Tool $Git @('fetch','origin',('refs/heads/' + $Branch + ':refs/remotes/origin/' + $Branch)) $Repo 60)
        $target = (Invoke-Tool $Git @('rev-parse',('origin/' + $Branch)) $Repo 30).Trim()
        if ($target -notmatch '^[a-f0-9]{40}$') { throw '유효한 원격 커밋을 확인하지 못했습니다.' }
        if ($target -ne $script:State.activeRevision -and ($forced -or $target -ne $script:State.failedRevision)) { Deploy-Revision $target }
        elseif ($target -eq $script:State.activeRevision -and $script:Worker -and -not $script:Worker.Process.HasExited) { $script:State.phase='running'; $script:State.message='새 변경 없음. 서버 운영 중.'; $script:State.lastError=$null }
      } catch {
        $script:State.lastError = $_.Exception.Message
        if ($target -and $target -ne $script:State.activeRevision) { $script:State.failedRevision=$target }
        $script:State.phase='error'; $script:State.message=$_.Exception.Message
        Write-Log ('배포 보류/실패: ' + $_.Exception.Message)
      }
      $nextCheck = (Get-Date).AddSeconds($IntervalSeconds)
    }
    if ($script:State.activeRelease -and ($null -eq $script:Worker -or $script:Worker.Process.HasExited)) {
      try {
        Stop-Server $script:Worker
        $script:Worker = $null
        $script:Worker = Start-Server $script:State.activeRelease $script:State.activeRevision $Port $DataDir $Catalog
        Wait-Healthy $script:Worker $script:State.activeRevision
        Set-Phase 'running' '종료된 서버를 이전 정상 버전으로 재시작했습니다.'
      } catch { Write-Log ('서버 재시작 실패: ' + $_.Exception.Message); Start-Sleep -Seconds 10 }
    }
    Start-Sleep -Seconds 1
  }
} catch {
  if (Test-Path -LiteralPath $Deploy) { Write-Log ('자동 배포 종료: ' + $_.Exception.Message) }
  throw
} finally {
  Stop-Server $script:Worker
  if ($null -ne $script:State) { $script:State.phase='stopped'; $script:State.message='자동 배포와 서버가 종료됐습니다.'; Save-State }
  if ($null -ne $lock) { $lock.Dispose() }
}


