<#
    Installa l'aggiornamento automatico della programmazione su questo PC.

    Il WAF di AWS blocca le richieste dai runner di GitHub Actions, quindi lo
    scraping gira da qui (IP residenziale) e pubblica con un push: il sito si
    ridistribuisce da solo. Il task parte all'accesso e poi ogni quattro ore.

    Uso:  powershell -ExecutionPolicy Bypass -File scripts\install_scheduled_task.ps1
#>

$ErrorActionPreference = 'Stop'

$taskName = 'FuoriProgrammaCosenza'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\update_and_push.ps1'

if (-not (Test-Path $script)) {
    throw "Script non trovato: $script"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $root

# All'accesso e poi ogni quattro ore: se il PC era spento, recupera al primo
# avvio utile invece di saltare la giornata.
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$daily = New-ScheduledTaskTrigger -Daily -At '07:00'
$daily.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' `
    -RepetitionInterval (New-TimeSpan -Hours 4) `
    -RepetitionDuration (New-TimeSpan -Days 1)).Repetition

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger @($atLogon, $daily) `
    -Settings $settings `
    -Description 'Aggiorna e pubblica la programmazione dei cinema di Cosenza.' `
    -Force | Out-Null

Write-Host "Task '$taskName' installato."
Write-Host "Avvio manuale:  Start-ScheduledTask -TaskName $taskName"
Write-Host "Stato:          Get-ScheduledTaskInfo -TaskName $taskName"
