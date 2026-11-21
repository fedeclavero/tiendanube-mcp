param([Parameter(Mandatory)][string]$Zip)
$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$root = Join-Path $env:RUNNER_TEMP ('Tiendanube Windows ' + [char]0x00f1 + ' ' + [guid]::NewGuid())
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
$env:LOCALAPPDATA = Join-Path $root 'AppData Local'
$env:CLAUDE_CONFIG_DIR = Join-Path $root 'Claude'
$env:CODEX_HOME = Join-Path $root 'Codex'
$env:ANTIGRAVITY_CONFIG_DIR = Join-Path $root 'Antigravity'
$env:AGY_CONFIG_DIR = Join-Path $root 'Agy'
$env:TIENDANUBE_MCP_HOME = Join-Path $root 'Estado'
$package = Join-Path $root 'Archivo extraido'
Expand-Archive -LiteralPath $Zip -DestinationPath $package
$exe = Join-Path $package 'tiendanube-mcp.exe'
$setup = 'fixture-access-token' | & $exe configure --store-id 42 --token-stdin --no-verify --json
if ($LASTEXITCODE -ne 0 -or -not ($setup | Out-String | ConvertFrom-Json).ok) { throw 'Configure failed' }
Push-Location -LiteralPath $package
try {
    & "$env:SystemRoot\System32\cmd.exe" /d /c 'echo 4 | Instalar.cmd'
    if ($LASTEXITCODE -ne 0) { throw "Guided installer exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
$installed = Join-Path $env:LOCALAPPDATA 'Programs\tiendanube-mcp\tiendanube-mcp.exe'
if (-not (Test-Path -LiteralPath $installed -PathType Leaf)) { throw 'Native executable was not installed' }
$claude = Get-Content -Encoding UTF8 -Raw (Join-Path $env:CLAUDE_CONFIG_DIR '.claude.json') | ConvertFrom-Json
if ($claude.mcpServers.tiendanube.command -ne $installed -or $claude.mcpServers.tiendanube.args[0] -ne 'serve') { throw 'Invalid Claude Code entry' }
$codex = Get-Content -Encoding UTF8 -Raw (Join-Path $env:CODEX_HOME 'config.toml')
if (-not $codex.Contains('[mcp_servers.tiendanube]') -or -not $codex.Contains('tiendanube-mcp.exe')) { throw 'Invalid Codex entry' }
$antigravity = Get-Content -Encoding UTF8 -Raw (Join-Path $env:ANTIGRAVITY_CONFIG_DIR 'mcp_config.json') | ConvertFrom-Json
if ($antigravity.mcpServers.tiendanube.command -ne $installed -or $antigravity.mcpServers.tiendanube.args[0] -ne 'serve') { throw 'Invalid Antigravity entry' }
$report = & $installed install --client all --json | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $report.ok -or $report.launch_check.tools -ne 198 -or $report.installed.Count -lt 3) {
    throw 'MCP startup, discovery, or client registration failed'
}
