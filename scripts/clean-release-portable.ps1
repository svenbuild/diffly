$ErrorActionPreference = 'Stop'

$releaseDir = Join-Path $PSScriptRoot '..\release'
if (-not (Test-Path -LiteralPath $releaseDir)) {
  return
}

$portableFiles = Get-ChildItem -LiteralPath $releaseDir -File -Filter 'Diffly *.exe' |
  Where-Object { $_.Name -notlike 'Diffly Setup *' -and $_.Name -notlike 'Diffly-Debug *' }

if ($portableFiles.Count -ne 1) {
  throw "Expected exactly one portable Diffly exe in $releaseDir, found $($portableFiles.Count)."
}

$keepPath = $portableFiles[0].FullName
$itemsToRemove = Get-ChildItem -LiteralPath $releaseDir |
  Where-Object { $_.FullName -ne $keepPath }

foreach ($item in $itemsToRemove) {
  for ($attempt = 1; $attempt -le 5; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $item.FullName -Recurse -Force
      break
    } catch {
      if ($attempt -eq 5) {
        throw
      }

      Start-Sleep -Milliseconds 500
    }
  }
}
