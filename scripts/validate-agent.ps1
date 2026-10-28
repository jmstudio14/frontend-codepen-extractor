[CmdletBinding()]
param(
    [switch]$Quiet
)

# Runs the same four validators as `npm run validate:all`, in the same order, and exits with the
# first non-zero code. Errors go to stderr without Write-Error, so the exit codes below are reached.
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Failure([string]$Message) {
    [Console]::Error.WriteLine($Message)
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Failure 'Node.js was not found on PATH. Install Node.js 22+ and run this script again.'
    exit 2
}

$validators = @(
    'scripts/validate-agent.mjs',
    'scripts/validate-plugin.mjs',
    'scripts/test-agent.mjs',
    'scripts/security-gate.mjs'
)

foreach ($validator in $validators) {
    $scriptPath = Join-Path $repoRoot $validator
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        Write-Failure "Validator not found: $scriptPath"
        exit 2
    }
    if ($Quiet) {
        # Merge stderr into the discarded stream inside one native call, so Windows PowerShell 5.1
        # does not turn the validator's FAIL lines into terminating errors.
        & node $scriptPath 2>&1 | Out-Null
    } else {
        & node $scriptPath
    }
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Failure "Validation failed in $validator with exit code $exitCode."
        exit $exitCode
    }
}

if (-not $Quiet) { Write-Output 'All validators passed.' }
exit 0
