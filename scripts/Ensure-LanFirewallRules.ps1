# Regras de entrada para uso do Manager e apps na rede local (Wi‑Fi/LAN).
# Requer PowerShell como Administrador.
$ErrorActionPreference = "Stop"
$rules = @(
  @{ Name = "Servidor Manager UI (5199)"; Port = 5199 },
  @{ Name = "OMPS / Caddy LAN (8080)"; Port = 8080 },
  @{ Name = "Servidor Manager Apps Preview (4173)"; Port = 4173 },
  @{ Name = "Servidor Manager Apps Dev (5173)"; Port = 5173 }
)
foreach ($r in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
  if ($existing) { continue }
  New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port | Out-Null
  Write-Host "Regra criada: $($r.Name)"
}
Write-Host "Concluído. A API 47831 NÃO foi aberta (permanece só neste PC)."
