#!/usr/bin/env bash
# Abre a porta HTTP do Caddy na LAN (equivalente mínimo a network.firewall no Windows).
set -euo pipefail
HTTP_PORT="${1:-8080}"

if command -v ufw >/dev/null 2>&1; then
  if [[ "${EUID:-0}" -ne 0 ]]; then
    echo "ufw disponível — execute com sudo para aplicar: sudo bash \"$0\" ${HTTP_PORT}"
    echo "Até lá, clientes LAN podem não alcançar a porta ${HTTP_PORT}."
    exit 0
  fi
  ufw allow "${HTTP_PORT}/tcp" comment 'AcompOPMS Caddy LAN (Manager)' || true
  ufw status numbered || true
  echo "Regra ufw allow ${HTTP_PORT}/tcp aplicada."
  exit 0
fi

cat <<EOF
ufw não encontrado. Abra ${HTTP_PORT}/tcp manualmente (firewalld/iptables/nftables).
A fase network.block-internal-ports do manifesto OMPS também orienta bloqueio das portas Supabase na LAN.
EOF
exit 0
