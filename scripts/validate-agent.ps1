[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'validate-agent.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js was not found on PATH. Install Node.js 22+ or run the validator with a configured Node runtime.'
    exit 2
}

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    Write-Error "Validator not found: $scriptPath"
    exit 2
}

if ($Quiet) {
    & node $scriptPath *> $null
} else {
    & node $scriptPath
}
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Error "Frontend CodePen Extractor validation failed with exit code $exitCode."
}
exit $exitCode
