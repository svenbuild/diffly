$ErrorActionPreference = 'Stop'

$releaseDir = Join-Path $PSScriptRoot '..\release'
if (-not (Test-Path -LiteralPath $releaseDir)) {
  return
}

$packageJsonPath = Join-Path $PSScriptRoot '..\package.json'
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$version = $packageJson.version

$portableFiles = Get-ChildItem -LiteralPath $releaseDir -File -Filter 'Diffly *.exe' |
  Where-Object { $_.Name -notlike 'Diffly Setup *' -and $_.Name -notlike 'Diffly-Debug *' }
$installerFiles = Get-ChildItem -LiteralPath $releaseDir -File -Filter 'Diffly Setup *.exe'
$currentPortableFiles = $portableFiles |
  Where-Object { $_.Name -eq "Diffly $version.exe" }
$currentInstallerFiles = $installerFiles |
  Where-Object { $_.Name -eq "Diffly Setup $version.exe" }

if ($currentPortableFiles.Count -ne 1) {
  throw "Expected exactly one portable Diffly $version exe in $releaseDir, found $($currentPortableFiles.Count)."
}

if ($currentInstallerFiles.Count -gt 1) {
  throw "Expected at most one Diffly $version installer exe in $releaseDir, found $($currentInstallerFiles.Count)."
}

$keepPaths = @($currentPortableFiles[0].FullName)
if ($currentInstallerFiles.Count -eq 1) {
  $keepPaths += $currentInstallerFiles[0].FullName
}
$itemsToRemove = Get-ChildItem -LiteralPath $releaseDir |
  Where-Object { $keepPaths -notcontains $_.FullName }

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
