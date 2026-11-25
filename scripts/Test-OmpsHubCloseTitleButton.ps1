# Clica o botão Fechar/Close da barra de título (não WM_CLOSE genérico).
param(
  [int] $WaitSeconds = 6
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$hubExe = Join-Path $env:LOCALAPPDATA 'Programs\OMPS\OMPS.exe'
if (-not (Test-Path -LiteralPath $hubExe)) {
  throw "Hub não instalado: $hubExe"
}

$proc = Start-Process -FilePath $hubExe -PassThru
Start-Sleep -Seconds $WaitSeconds

$root = [System.Windows.Automation.AutomationElement]::RootElement
$pidCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
if (-not $win) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "Janela do processo $($proc.Id) não encontrada via UIA"
}

$clicked = $false
$clickMethod = 'none'
$names = @('Fechar', 'Close')
foreach ($n in $names) {
  $nameCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $n)
  $typeCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  $and = New-Object System.Windows.Automation.AndCondition($typeCond, $nameCond)
  $closeBtn = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $and)
  if ($closeBtn) {
    ($closeBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
    $clicked = $true
    $clickMethod = 'UIA.Invoke'
    break
  }
}

if (-not $clicked) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OmpsMouseClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
  public const int LDown = 0x0002;
  public const int LUp = 0x0004;
  public static void LeftClick(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(LDown, 0, 0, 0, 0);
    mouse_event(LUp, 0, 0, 0, 0);
  }
}
"@
  $rect = $win.Current.BoundingRectangle
  $x = [int]($rect.X + $rect.Width - 18)
  $y = [int]($rect.Y + 14)
  [OmpsMouseClick]::LeftClick($x, $y)
  $clicked = $true
  $clickMethod = 'TitleBarCoordinates'
}

Start-Sleep -Seconds 4

$still = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
$ompsSamePath = Get-CimInstance Win32_Process -Filter "Name='OMPS.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $hubExe) }

@{
  clickedTitleClose = $clicked
  clickMethod = $clickMethod
  mainPid = $proc.Id
  mainAliveAfter4s = [bool]$still
  residualSameExe = @($ompsSamePath | Where-Object { $_.ProcessId -ne $proc.Id }).Count
  errorDialogProbe = $false
} | ConvertTo-Json

if ($still) { exit 2 }
exit 0
