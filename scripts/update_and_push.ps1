<#
    Aggiorna la programmazione e la pubblica nel repository.

    Il WAF di AWS blocca le richieste dai runner di GitHub Actions, quindi lo
    scraping viene eseguito da questo PC, dove le fonti rispondono senza
    problemi. Il push attiva il deploy automatico del sito.

    Uso manuale:  powershell -ExecutionPolicy Bypass -File scripts\update_and_push.ps1
#>

# Gli errori dei comandi nativi vengono gestiti tramite $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Git {
    param([string[]]$Arguments)
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output
    }
    return $LASTEXITCODE
}

Write-Host "[1/4] Allineamento con il repository..."
if ((Invoke-Git @('pull', '--rebase', '--autostash', 'origin', 'main')) -ne 0) {
    Invoke-Git @('rebase', '--abort') | Out-Null
    Write-Host "Allineamento non riuscito: riprovo al prossimo avvio."
    exit 1
}

Write-Host "[2/4] Aggiorno della programmazione..."
& python scripts\update_schedule.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aggiornamento non riuscito: i dati precedenti restano invariati."
    exit 1
}

Write-Host "[3/4] Salvataggio dei dati..."
Invoke-Git @('add', 'data/schedule.json') | Out-Null
Invoke-Git @('diff', '--staged', '--quiet') | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Nessuna variazione nella programmazione."
    exit 0
}

Invoke-Git @('-c', 'user.name=github-actions[bot]', '-c', 'user.email=github-actions[bot]@users.noreply.github.com',
    'commit', '-m', 'Aggiorna gli orari dei cinema') | Out-Null

Write-Host "[4/4] Pubblicazione nel repository..."
Invoke-Git @('pull', '--rebase', '--autostash', '-X', 'ours', 'origin', 'main') | Out-Null
if ((Invoke-Git @('push', 'origin', 'main')) -ne 0) {
    Write-Host "Push non riuscito: i dati restano in locale e il sito non cambia."
    exit 1
}

Write-Host "Programmazione pubblicata."
