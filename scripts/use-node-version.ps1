# Script para usar la versión de Node.js especificada en .nvmrc
$nvmrcPath = Join-Path $PSScriptRoot "..\.nvmrc"
if (Test-Path $nvmrcPath) {
    $nodeVersion = Get-Content $nvmrcPath -Raw | ForEach-Object { $_.Trim() }
    
    # Verificar si nvm está disponible
    $nvmCommand = Get-Command nvm -ErrorAction SilentlyContinue
    if ($nvmCommand) {
        Write-Host "Cambiando a Node.js $nodeVersion usando nvm..." -ForegroundColor Cyan
        nvm use $nodeVersion
    } else {
        Write-Host "nvm no está disponible. Por favor, instala nvm-windows o cambia manualmente a Node.js $nodeVersion" -ForegroundColor Yellow
    }
} else {
    Write-Host "No se encontró archivo .nvmrc" -ForegroundColor Yellow
}

