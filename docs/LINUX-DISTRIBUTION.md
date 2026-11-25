# Distribuição Linux (futura)

O núcleo do Servidor Manager já separa:

- `local-service/src/runtime/platform/linux/`
- `local-service/src/database/platform/linux/`

## Direção planejada

1. Empacotar UI + local-service (Node bundle) em AppImage ou pacote `.deb`
2. Serviço do Manager via **systemd** (`Type=simple`, `127.0.0.1:47831`)
3. Serviços por sistema instalado via `systemdServiceManager` (stub hoje)
4. Dados em `/var/lib/servidor-manager/` ou `$XDG_DATA_HOME/servidor-manager/`

Não implementado na Etapa 13 (Windows).
