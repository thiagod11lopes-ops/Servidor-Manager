#!/usr/bin/env bash
# Sobe Caddy (HTTP LAN) + valida Supabase local. Não registra serviço Windows.
set -euo pipefail

LAN_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$LAN_DIR/../.." && pwd)"
ENV_FILE="$LAN_DIR/servidor.env"
PID_FILE="$LAN_DIR/caddy.pid"
LOG_FILE="$LAN_DIR/caddy.log"
STDERR_LOG="$LAN_DIR/caddy.stderr.log"

read_http_port() {
  local port=8080
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[[:space:]]*ACOMOPMS_HTTP_PORT[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*$ ]]; then
        port="${BASH_REMATCH[1]}"
      fi
    done <"$ENV_FILE"
  fi
  echo "$port"
}

wait_http_login() {
  local port="$1"
  local max_wait="${2:-60}"
  local i=0
  while (( i < max_wait )); do
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      if curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:${port}/login"; then
        return 0
      fi
    else
      echo "Caddy nao esta em execucao (PID $(cat "$PID_FILE" 2>/dev/null || echo '?'))."
      tail -24 "$LOG_FILE" 2>/dev/null || true
      tail -24 "$STDERR_LOG" 2>/dev/null || true
      return 1
    fi
    sleep 1
    (( i++ )) || true
  done
  echo "Caddy nao respondeu em http://127.0.0.1:${port}/login dentro de ${max_wait}s."
  tail -24 "$LOG_FILE" 2>/dev/null || true
  tail -24 "$STDERR_LOG" 2>/dev/null || true
  return 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$LAN_DIR/servidor.env.example" "$ENV_FILE"
fi

if [[ ! -d "$ROOT/frontend/dist" ]]; then
  echo "frontend/dist ausente. Rode: bash \"$LAN_DIR/build-producao-lan.sh\""
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI não encontrado."
  exit 1
fi

HTTP_PORT="$(read_http_port)"

if [[ "${ACOMOPMS_SUPABASE_BOOTSTRAP_DONE:-}" == "1" ]]; then
  node "$LAN_DIR/lib/ensure-edge-runtime.mjs" "$ROOT"
  node "$LAN_DIR/lib/ensure-kong-loopback.mjs" "$ROOT"
else
  cd "$ROOT"
  if ! supabase status >/dev/null 2>&1; then
    echo "Iniciando Supabase local (portas só em 127.0.0.1)..."
    LOOPBACK_NET="$(node "$LAN_DIR/lib/ensure-supabase-loopback-network.mjs")"
    supabase start --network-id "$LOOPBACK_NET"
  fi

  node "$LAN_DIR/lib/ensure-edge-runtime.mjs" "$ROOT"
  node "$LAN_DIR/lib/ensure-kong-loopback.mjs" "$ROOT"
fi

node "$LAN_DIR/generate-caddyfile.mjs"
node "$LAN_DIR/gerar-server-connection.mjs"

if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy não encontrado. Instale (ex.: https://caddyserver.com/docs/install#debian-ubuntu-raspbian)"
  echo "  sudo apt install -y caddy   # ou baixe caddy.exe no Windows"
  exit 1
fi

CONFIG="$LAN_DIR/Caddyfile.generated"
if [[ ! -f "$CONFIG" ]]; then
  echo "Caddyfile.generated ausente após generate-caddyfile.mjs"
  exit 1
fi

(cd "$LAN_DIR" && caddy validate --config "$CONFIG" --adapter caddyfile)

print_urls() {
  (cd "$LAN_DIR" && node --input-type=module <<NODE
import { loadServidorEnv } from './lib/load-servidor-env.mjs'
const c = loadServidorEnv('${ENV_FILE}')
console.log('[servidor-lan] UI:', c.publicOrigin)
console.log('[servidor-lan] Supabase (via proxy):', c.supabasePublicUrl)
console.log('[servidor-lan] Postgres NÃO exposto (127.0.0.1:54322)')
console.log('[servidor-lan] Studio não publicado na LAN (54323 localhost)')
NODE
  )
}

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  if wait_http_login "$HTTP_PORT" 3; then
    echo "Caddy já em execução (PID $(cat "$PID_FILE"))."
    print_urls
    exit 0
  fi
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

(cd "$LAN_DIR" && nohup caddy run --config "$CONFIG" --adapter caddyfile >"$LOG_FILE" 2>"$STDERR_LOG" &)
echo $! >"$PID_FILE"

if ! wait_http_login "$HTTP_PORT" 60; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
fi

print_urls
echo "Log Caddy: $LOG_FILE (stderr: $STDERR_LOG)"
