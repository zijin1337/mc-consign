# Local dev database: portable PostgreSQL 17 (no service, no admin rights).
# Usage:
#   powershell -NoProfile -File scripts/dev-db.ps1 init     first-time initdb + createdb
#   powershell -NoProfile -File scripts/dev-db.ps1 start
#   powershell -NoProfile -File scripts/dev-db.ps1 stop
#   powershell -NoProfile -File scripts/dev-db.ps1 status
#   powershell -NoProfile -File scripts/dev-db.ps1 psql
# Env PG_HOME points at the unzipped folder that contains bin/ (default D:\Cat\pg17\pgsql).
# Data dir and log live next to PG_HOME: <parent>\data, <parent>\pg.log
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files as ANSI.

param(
  [Parameter(Position = 0)]
  [ValidateSet("init", "start", "stop", "status", "psql", "restart")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$PgHome = if ($env:PG_HOME) { $env:PG_HOME } else { "D:\Cat\pg17\pgsql" }
$Bin = Join-Path $PgHome "bin"
$Root = Split-Path $PgHome -Parent
$Data = Join-Path $Root "data"
$Log = Join-Path $Root "pg.log"
$Port = 5432
$DbName = "mc_consign"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $Bin "pg_ctl.exe"))) {
  Write-Error "pg_ctl.exe not found under $Bin. Unzip the PostgreSQL binaries to $PgHome or set PG_HOME."
}

function Test-PgReady {
  & "$Bin\pg_isready.exe" -h localhost -p $Port *> $null
  return ($LASTEXITCODE -eq 0)
}

function Start-Pg {
  if (Test-PgReady) { Write-Host "PostgreSQL already running on port $Port"; return }
  $pidFile = Join-Path $Data "postmaster.pid"
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force }   # stale lock from a killed process
  $env:PG_BIN = $Bin; $env:PG_DATA = $Data; $env:PG_LOG = $Log; $env:PG_PORT = "$Port"
  & cmd.exe /c (Join-Path $Here "pg-start.cmd")
  if (Test-PgReady) { Write-Host "PostgreSQL started on port $Port (log: $Log)" }
  else { Write-Error "PostgreSQL failed to start. See $Log" }
}

function Stop-Pg {
  if (-not (Test-PgReady)) { Write-Host "PostgreSQL is not running"; return }
  & "$Bin\pg_ctl.exe" -D $Data -m fast -w stop
}

switch ($Action) {
  "init" {
    if (Test-Path (Join-Path $Data "PG_VERSION")) {
      Write-Host "Data dir exists, skipping initdb: $Data"
    } else {
      & "$Bin\initdb.exe" -D $Data -U postgres -A trust -E UTF8 --locale=C
      if ($LASTEXITCODE -ne 0) { Write-Error "initdb failed" }
    }
    Start-Pg
    $exists = & "$Bin\psql.exe" -U postgres -h localhost -p $Port -tAc "select 1 from pg_database where datname='$DbName'"
    if ("$exists".Trim() -ne "1") {
      & "$Bin\createdb.exe" -U postgres -h localhost -p $Port $DbName
      Write-Host "Created database $DbName"
    } else {
      Write-Host "Database $DbName already exists"
    }
    Write-Host "DATABASE_URL=postgres://postgres@localhost:$Port/$DbName"
  }
  "start"   { Start-Pg }
  "stop"    { Stop-Pg }
  "restart" { Stop-Pg; Start-Pg }
  "status"  { if (Test-PgReady) { Write-Host "running on port $Port" } else { Write-Host "not running" } }
  "psql"    { & "$Bin\psql.exe" -U postgres -h localhost -p $Port $DbName }
}
