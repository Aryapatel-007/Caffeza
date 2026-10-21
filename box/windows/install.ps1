# Cafe POS: one-time setup on a Windows 10 or 11 PC. P62, docs/WINDOWS-INSTALL.md.
#
# Run by double-clicking "Install Cafe POS.bat" in the CafePOS folder. It asks
# for Administrator once, then:
#   1. installs Node.js, MongoDB and the MongoDB tools with winget (needs internet, once)
#   2. makes MongoDB a single-node replica set, reachable from this PC only
#   3. installs the app's packages, writes its settings (.env), builds the indexes
#   4. creates the restaurant and the owner's login (asks the name, phone, password)
#   5. starts the server when Windows starts, before anyone logs in, and restarts
#      it if it stops; takes a snapshot of the database every hour
#   6. lets tablets on the WiFi reach it (Windows Firewall)
#   7. puts "Cafe POS" and "Cafe POS - Connect a device" on the desktop
#
# Safe to run again: every step checks first. Running it again after copying a
# newer CafePOS folder over this one is how the app is updated.
# Written in plain ASCII for Windows PowerShell 5.1.

$ErrorActionPreference = 'Stop'
# Anything unexpected: say it and wait, so the window does not vanish before it can be read.
trap {
  Write-Host ''
  Write-Host "STOPPED: $_" -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$DataDir = Join-Path $Root 'data'
$LogDir = Join-Path $DataDir 'logs'
$EnvFile = Join-Path $Root '.env'
$TaskName = 'CafePOS Server'
$SnapshotTask = 'CafePOS Snapshot'

function Say($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Fail($text) {
  Write-Host ''
  Write-Host "STOPPED: $text" -ForegroundColor Red
  Write-Host 'Nothing is lost. Fix this and double-click "Install Cafe POS" again.'
  Read-Host 'Press Enter to close'
  exit 1
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function New-Secret([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return [Convert]::ToBase64String($buffer)
}
function Winget-Install($id, $label) {
  Write-Host "Installing $label..."
  winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fail 'Run this as Administrator: double-click "Install Cafe POS.bat", and say Yes when Windows asks.'
}
if (-not (Test-Path (Join-Path $Root 'server\server.js'))) { Fail "This script must stay inside the CafePOS folder. Looked in $Root." }
if (-not (Test-Path (Join-Path $Root 'client\dist\index.html'))) { Fail 'The screens are missing (client\dist). Use the CafePOS.zip made by box/windows/make-package.sh.' }
New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

Write-Host 'Cafe POS setup' -ForegroundColor Green
Write-Host "Folder: $Root"

# ---------------------------------------------------------------------------
Say '1. Node.js and MongoDB'
Refresh-Path
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js did not install. Install it from https://nodejs.org (LTS), then run this again.' }
Write-Host "Node.js $(node -v)"

$mongoService = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
if (-not $mongoService) { Winget-Install 'MongoDB.Server' 'MongoDB'; $mongoService = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue }
if (-not $mongoService) { Fail 'MongoDB did not install as a service. Install MongoDB Community Server (MSI, "Install as a Service"), then run this again.' }
if (-not (Get-Command mongodump -ErrorAction SilentlyContinue)) { Winget-Install 'MongoDB.DatabaseTools' 'MongoDB tools (for the hourly snapshot)' }
$toolsBin = Get-ChildItem 'C:\Program Files\MongoDB\Tools\*\bin' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($toolsBin -and -not (Get-Command mongodump -ErrorAction SilentlyContinue)) {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  [Environment]::SetEnvironmentVariable('Path', "$machinePath;$($toolsBin.FullName)", 'Machine')
  Refresh-Path
}

# ---------------------------------------------------------------------------
Say '2. MongoDB as a replica set, on this PC only'
$cfg = Get-ChildItem 'C:\Program Files\MongoDB\Server\*\bin\mongod.cfg' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $cfg) { Fail 'Could not find mongod.cfg under C:\Program Files\MongoDB\Server.' }
$cfgText = Get-Content $cfg.FullName -Raw
if ($cfgText -notmatch 'replSetName') {
  Copy-Item $cfg.FullName "$($cfg.FullName).before-cafe-pos" -Force
  # The installer's file has "#replication:" commented out; add a real section at the end.
  $cfgText = $cfgText.TrimEnd() + "`r`n`r`nreplication:`r`n  replSetName: rs0`r`n"
  Set-Content -Path $cfg.FullName -Value $cfgText -Encoding ASCII
  Write-Host "Added replSetName: rs0 to $($cfg.FullName)"
}
if ($cfgText -notmatch 'bindIp:\s*127\.0\.0\.1') {
  Write-Host 'Note: MongoDB is not bound to 127.0.0.1 only. Tablets never talk to MongoDB; keep it on this PC.' -ForegroundColor Yellow
}
Set-Service -Name 'MongoDB' -StartupType Automatic
Restart-Service -Name 'MongoDB' -Force
Start-Sleep -Seconds 5

# ---------------------------------------------------------------------------
Say '3. The app'
Push-Location $Root
try {
  npm ci --omit=dev --no-audit --no-fund | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'Installing the app packages failed (npm ci). Check the internet and run this again.' }
} finally { Pop-Location }

node (Join-Path $PSScriptRoot 'init-replica-set.mjs')
if ($LASTEXITCODE -ne 0) { Fail 'MongoDB could not be made a replica set.' }

# Port 80 means staff type just the address; 8080 when something else holds 80.
$port = 80
$busy80 = Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue
if (Test-Path $EnvFile) {
  $existing = Select-String -Path $EnvFile -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($existing) { $port = [int]$existing.Matches[0].Groups[1].Value }
} elseif ($busy80) { $port = 8080 }

if (-not (Test-Path $EnvFile)) {
  $lines = @(
    'NODE_ENV=production',
    "PORT=$port",
    'DEPLOYMENT_ROLE=BOX',
    'MONGO_URI=mongodb://127.0.0.1:27017/restaurant-erp?replicaSet=rs0',
    "JWT_ACCESS_SECRET=$(New-Secret 48)",
    "JWT_REFRESH_SECRET=$(New-Secret 48)",
    "INTEGRATION_SECRETS_KEY=$(New-Secret 32)",
    "CLIENT_ORIGIN=http://localhost:$port",
    'TRUST_PROXY=false',
    "BOX_DATA_DIR=$DataDir",
    '# Empty: the address staff open is worked out from the WiFi this PC is on.',
    'BOX_PUBLIC_URL=',
    'BOX_LOCAL_NAME_URL=',
    'BOX_WIFI_CONTROL=off',
    '# Fill both to send a copy to the cloud mirror (docs/DEPLOYMENT.md section 18):',
    'MIRROR_URL=',
    'REPLICATION_SECRET='
  )
  Set-Content -Path $EnvFile -Value $lines -Encoding ASCII
  Write-Host "Settings written to $EnvFile (keep this file private)."
}

Push-Location $Root
try {
  npm run db:indexes | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail 'Building the database indexes failed.' }
} finally { Pop-Location }

# ---------------------------------------------------------------------------
Say '4. The restaurant and the owner login'
$marker = Join-Path $DataDir 'restaurant-created.txt'
$ownerPhone = $null
$ownerPassword = $null
if (Test-Path $marker) {
  Write-Host 'The restaurant was already created. Skipping.'
} else {
  $cafeName = Read-Host 'Cafe name (for example Z Chaat)'
  $ownerName = Read-Host 'Owner full name'
  do { $ownerPhone = Read-Host 'Owner mobile number (10 digits, used to sign in)' } until ($ownerPhone -match '^\d{10}$')
  do {
    $secure = Read-Host 'Owner password (at least 8 characters, letters and numbers, no quotes)' -AsSecureString
    $ownerPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  } until ($ownerPassword.Length -ge 8)
  Push-Location $Root
  try {
    # The empty line answers the optional email question.
    '' | node server\scripts\provisionRestaurant.js --name "$cafeName" --owner "$ownerName" --phone $ownerPhone --password "$ownerPassword" | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail 'Creating the restaurant failed. Is that phone number already used?' }
  } finally { Pop-Location }
  Set-Content -Path $marker -Value "Created $(Get-Date -Format s) for $cafeName, owner phone $ownerPhone" -Encoding ASCII
}

# ---------------------------------------------------------------------------
Say '5. Start with Windows, restart if it stops, snapshot every hour'
$node = (Get-Command node).Source
$serverCmd = "/c cd /d `"$Root`" && `"$node`" server\server.js >> `"$LogDir\server.log`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $serverCmd -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$system = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $system -Force | Out-Null

# The snapshot reads the whole server with --oplog, so its address names no database.
$snapCmd = "/c cd /d `"$Root`" && set `"MONGO_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0`" && `"$node`" server\scripts\localSnapshot.js >> `"$LogDir\snapshot.log`" 2>&1"
$snapAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $snapCmd -WorkingDirectory $Root
$snapTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $SnapshotTask -Action $snapAction -Trigger $snapTrigger -Settings $settings -Principal $system -Force | Out-Null

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*server\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-ScheduledTask -TaskName $TaskName
$url = if ($port -eq 80) { 'http://localhost' } else { "http://localhost:$port" }
$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
  Start-Sleep -Seconds 1
  try { $up = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$url/api/v1/network/ping").StatusCode -eq 200 } catch { $up = $false }
}
if (-not $up) { Fail "The server did not start. Read $LogDir\server.log." }
Write-Host "The server is running at $url"

if ($ownerPhone) {
  $answer = Read-Host 'Load the sample Z Chaat menu and 12 starter tables? (Y/N)'
  if ($answer -match '^[Yy]') {
    $env:CAFE_URL = $url; $env:CAFE_PHONE = $ownerPhone; $env:CAFE_PASSWORD = $ownerPassword
    node (Join-Path $PSScriptRoot 'load-starter.mjs') | Out-Host
    Remove-Item Env:CAFE_PASSWORD -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------------------
Say '6. Let tablets on the WiFi reach it'
# Any profile: a new WiFi is often marked Public by Windows, and the tablets must still get in.
Get-NetFirewallRule -DisplayName 'Cafe POS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Cafe POS' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
Write-Host "Port $port is open to devices on the network."

# ---------------------------------------------------------------------------
Say '7. Desktop icons'
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$shell = New-Object -ComObject WScript.Shell
$opener = Join-Path $PSScriptRoot 'open.vbs'
foreach ($icon in @(@{ Name = 'Cafe POS'; Page = '' }, @{ Name = 'Cafe POS - Connect a device'; Page = 'connect' })) {
  $shortcut = $shell.CreateShortcut((Join-Path $desktop "$($icon.Name).lnk"))
  $shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $shortcut.Arguments = "`"$opener`" $($icon.Page)"
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,15"
  $shortcut.Description = 'Opens the cafe system, starting the server if it is not running.'
  $shortcut.Save()
}

$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' } | Select-Object -ExpandProperty IPAddress
$portPart = if ($port -eq 80) { '' } else { ":$port" }
Write-Host ''
Write-Host 'All done.' -ForegroundColor Green
Write-Host 'On this PC: double-click "Cafe POS" on the desktop.'
foreach ($address in $addresses) { Write-Host "On tablets and phones on the same WiFi: http://$address$portPart" -ForegroundColor Green }
Write-Host 'Print the card with QR codes: "Cafe POS - Connect a device" on the desktop.'
Write-Host 'The server starts by itself whenever this PC is switched on.'
Read-Host 'Press Enter to close'
Start-Process $url
