# Fluxo de desenvolvimento vs instalador

Objetivo: iterar no código **sem** reconstruir `servidor.exe` a cada alteração, preservando dados em `C:\ServidorManager\`.

## Três operações

| # | Operação | O que faz | Comandos | Gera instalador? |
|---|----------|-----------|----------|------------------|
| 1 | **Build de desenvolvimento** | Compila UI (`dist/`) e local-service (`dist-local-service/`) | `npm run build` | Não |
| 2 | **Atualização local** | Copia `release\win-unpacked` para o Manager instalado | `npm run refresh:installed` (recomendado) ou `npm run package:dir` + `npm run update:installed` | Não |
| 3 | **Empacotamento final** | NSIS `release\servidor.exe` para distribuição | `npm run package:installer` ou `npm run package:servidor-exe` | **Sim** — só quando solicitado |

## Detalhes

- **`npm run package:dir`** — electron-builder em modo pasta (`release\win-unpacked`). Inclui build. **Não** produz `servidor.exe`.
- **`npm run update:installed`** — encerra o Manager nas pastas conhecidas, `robocopy` de `win-unpacked` → `%LOCALAPPDATA%\Programs\ServidorManager` (e `Program Files` se existir), atualiza atalhos. Se faltar build ou `win-unpacked`, o script roda `build` / `package:dir` automaticamente (**nunca** o instalador NSIS).
- **`npm run refresh:installed`** — atalho canônico para (2): `package:dir` + `update:installed`.

## Desenvolvimento com Vite (opcional)

```bash
npm run dev:local-service   # 127.0.0.1:47831
npm run dev                 # http://localhost:5173 (proxy /api → 47831)
```

## App instalado (teste pós-build)

- UI: **http://127.0.0.1:5199/** (servida pelo launcher instalado; ver `scripts/serve-manager-ui.mjs`)
- API local-service: **http://127.0.0.1:47831**

Feche todas as janelas do Manager antes da cópia; reabra pelo atalho **Servidor Manager**.

## Release / aceite manifest-LAN

`npm run release:manifest-lan` usa `package:dir` + aceite + `update:installed` — **não** gera NSIS.

## O que não usar no dia a dia

- `npm run package:installer`
- `npm run package:servidor-exe`
- `npm run package` (NSIS + portable completos)

Use-os apenas quando a versão final for pedida explicitamente.
