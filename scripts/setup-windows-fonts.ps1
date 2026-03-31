$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:InstalledHashes = @{}
$script:InstalledAny = $false

function Get-FontFamilyName {
  param([string]$FontPath)

  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $collection = New-Object System.Drawing.Text.PrivateFontCollection
    $collection.AddFontFile($FontPath)
    if ($collection.Families.Length -gt 0) {
      return $collection.Families[0].Name
    }
  } catch {
  }

  return [System.IO.Path]::GetFileNameWithoutExtension($FontPath)
}

function Get-FontStorePath {
  $fontsDir = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
  if (-not (Test-Path $fontsDir)) {
    New-Item -ItemType Directory -Path $fontsDir | Out-Null
  }
  return $fontsDir
}

function Install-FontFile {
  param([string]$FontPath)

  try {
    $hash = (Get-FileHash -Path $FontPath -Algorithm SHA256).Hash
    if ($script:InstalledHashes.ContainsKey($hash)) {
      Write-Host "Skipping duplicate font file: $(Split-Path $FontPath -Leaf)"
      return
    }
    $script:InstalledHashes[$hash] = $true
  } catch {
  }

  $fontsDir = Get-FontStorePath
  $destination = Join-Path $fontsDir (Split-Path $FontPath -Leaf)
  Copy-Item $FontPath $destination -Force

  $family = Get-FontFamilyName -FontPath $destination
  $extension = [System.IO.Path]::GetExtension($destination).ToLowerInvariant()
  $fontType = if ($extension -eq ".otf") { "OpenType" } else { "TrueType" }
  $registryPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
  $valueName = "$family ($fontType)"
  Set-ItemProperty -Path $registryPath -Name $valueName -Value (Split-Path $destination -Leaf)
  $script:InstalledAny = $true
}

function Save-FirstReachableFont {
  param(
    [string[]]$Urls,
    [string]$OutputPath
  )

  foreach ($url in $Urls) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $OutputPath -UseBasicParsing
      if ((Get-Item $OutputPath).Length -ge 10240) {
        return $url
      }
      Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }

  return $null
}

function Install-FontBundle {
  param($Bundle)

  $tempDir = Join-Path $env:TEMP ("xrdb-fonts-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tempDir | Out-Null

  try {
    Write-Host "Downloading $($Bundle.Label)..."
    foreach ($file in $Bundle.Files) {
      $outputPath = Join-Path $tempDir $file.Name
      $usedUrl = Save-FirstReachableFont -Urls $file.Urls -OutputPath $outputPath
      if (-not $usedUrl) {
        Write-Warning "Download failed for $($file.Name)."
        continue
      }

      Write-Host "Downloaded $($file.Name) from $usedUrl"
      Install-FontFile -FontPath $outputPath
    }
  } catch {
    Write-Warning "Download or install failed for $($Bundle.Label): $($_.Exception.Message)"
  } finally {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($env:XRDB_FONT_DOWNLOAD -eq "0") {
  Write-Warning "Font download disabled (XRDB_FONT_DOWNLOAD=0)."
  exit 1
}

$fontBundles = @(
  @{
    Label = "Noto Sans"
    Files = @(
      @{
        Name = "NotoSans-Regular.ttf"
        Urls = @(
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/static/NotoSans-Regular.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans[wdth,wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-VariableFont_wdth,wght.ttf"
        )
      },
      @{
        Name = "NotoSans-Bold.ttf"
        Urls = @(
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/static/NotoSans-Bold.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans[wdth,wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-VariableFont_wdth,wght.ttf"
        )
      }
    )
  },
  @{
    Label = "Noto Serif"
    Files = @(
      @{
        Name = "NotoSerif-Regular.ttf"
        Urls = @(
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/static/NotoSerif-Regular.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif[wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif[wdth,wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif-VariableFont_wght.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif-VariableFont_wdth,wght.ttf"
        )
      },
      @{
        Name = "NotoSerif-Bold.ttf"
        Urls = @(
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/static/NotoSerif-Bold.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif[wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif[wdth,wght].ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif-VariableFont_wght.ttf",
          "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif-VariableFont_wdth,wght.ttf"
        )
      }
    )
  }
)

Write-Host "Downloading fonts directly..."
foreach ($bundle in $fontBundles) {
  Install-FontBundle -Bundle $bundle
}

if (-not $script:InstalledAny) {
  Write-Warning "No fonts installed. You may need to install manually."
  exit 1
}

Write-Host "Fonts installation complete."
