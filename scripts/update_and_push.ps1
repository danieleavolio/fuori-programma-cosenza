<#
    Aggiorna la programmazione e la pubblica nel repository.

    Il WAF di AWS blocca le richieste dai runner di GitHub Actions, quindi lo
    scraping viene eseguito da questo PC, dove le fonti rispondono senza
    problemi. Il push attiva il deploy automatico del sito.

    Uso manuale:  powershell -ExecutionPolicy Bypass -File scripts\update_and_push.ps1
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[1/4] Allineamento con il repository..."
git pull --rebase --autostash origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    git rebase --abort 2>&1 | Out-Null
    Write-Host "Allineamento non riuscito: riprovo al prossimo avvio."
    exit 1
}

Write-Host "[2/4] Aggiorno della programmazione..."
python scripts\update_schedule.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aggiornamento non riuscito: i dati precedenti restano invariati."
    exit 1
}

Write-Host "[3/4] Salvataggio dei dati..."
git add data/schedule.json
if (git diff --staged --quiet) {
    Write-Host "Nessuna variazione nella programmazione."
    exit 0
}

git -c user.name="github-actions[bot]" -c user.email="github-actions[bot]@users.noreply.github.com" `
    commit -m "Aggiorna gli orari dei cinema"

Write-Host "[4/4] Pubblicazione nel repository..."
git pull --rebase --autostash -X ours origin main 2>&1 | Out-Null
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push non riuscito: i dati restano in locale e il sito non cambia."
    exit 1
}

Write-Host "Programmazione pubblicata."
