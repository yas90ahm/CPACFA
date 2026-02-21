# Dependency Analysis Script
# Analyzes which services are imported and used

Write-Host "=== ROUTE DEPENDENCIES ===" -ForegroundColor Cyan
Get-ChildItem -Path src\routes -Filter *.ts -Recurse | ForEach-Object {
    $file = $_.FullName
    $imports = Select-String -Path $file -Pattern "from ['\`"].*services.*['\`"]" | ForEach-Object { $_.Line }
    if ($imports) {
        Write-Host "`n$($_.Name):" -ForegroundColor Yellow
        $imports | ForEach-Object { Write-Host "  $_" }
    }
}

Write-Host "`n=== SERVICE DEPENDENCIES ===" -ForegroundColor Cyan
Get-ChildItem -Path src\services -Filter *.ts -Recurse | ForEach-Object {
    $file = $_.FullName
    $imports = Select-String -Path $file -Pattern "from ['\`"].*services.*['\`"]" | ForEach-Object { $_.Line }
    if ($imports) {
        Write-Host "`n$($_.Name):" -ForegroundColor Yellow
        $imports | ForEach-Object { Write-Host "  $_" }
    }
}

Write-Host "`n=== ORPHAN CHECK ===" -ForegroundColor Cyan
Get-ChildItem -Path src\services -Filter *.ts -Recurse | ForEach-Object {
    $basename = $_.BaseName
    $filePath = $_.FullName
    $count = (Select-String -Path src\ -Pattern "$basename" -Include *.ts -Exclude "*.test.ts","*.spec.ts" | Where-Object { $_.Path -ne $filePath }).Count
    if ($count -eq 0) {
        Write-Host "ORPHAN: $($_.Name)" -ForegroundColor Red
    }
}
