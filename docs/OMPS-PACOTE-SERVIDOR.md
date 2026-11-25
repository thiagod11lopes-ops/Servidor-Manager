# Pacote Servidor OMPS (Etapa 4/6 — preparação de build)

Documentação do **payload OMPS Servidor** embutido na variante de empacotamento **Servidor OMPS** (`electron-builder.servidor-omps.yml`).  
**Não** substitui o instalador genérico `servidor.exe` (`package.json` → `package:installer`).

Futuro: instalador único **OMPS.exe** com escolha Servidor / Cliente — **não implementado nesta etapa**.

---

## Scripts npm

| Script | Função |
|--------|--------|
| `npm run build:omps-payload` | Monta `release/omps-payload/` e `release/omps-bundle/bundle-meta.json` |
| `npm run verify:omps-payload` | Valida origem + lock sem recopiar |
| `npm run test:omps-payload` | Testes automatizados (payload + config produto) |
| `npm run package:servidor-omps:dir` | Manager + payload em `release/servidor-omps/win-unpacked/` (sem NSIS) |
| `npm run package:servidor-omps` | NSIS `Servidor OMPS.exe` (só usar em ambiente de release; não equivale a produto final OMPS.exe) |

Genérico inalterado: `npm run package:installer` → `release/servidor.exe`.

---

## Origem do OMPS e revisão

| Campo | Valor atual no workspace |
|-------|---------------------------|
| Pasta padrão | `AcompSolemp-cursor-servidor-lan-etapa16-bcc8/` |
| Override | variável de ambiente `OMPS_PAYLOAD_SOURCE` |
| **Git SHA** | **Indisponível** (sem `.git` na pasta OMPS nem no repo Servidor) |
| Pin de release | `scripts/omps-payload-source.lock.json` → `contentSha256` |
| Versão OMPS | `frontend/package.json` → `version` (ex.: `0.0.0`) |

Após alterar a árvore OMPS: `node scripts/build-omps-payload.mjs --write-lock` e commitar o lock.

Para CI com clone Git: definir `OMPS_PAYLOAD_SOURCE`, obter SHA real com `git rev-parse HEAD`, lock com `gitShaRequired: true`.

---

## Conteúdo incluído no payload (`release/omps-payload/`)

Definição canônica: `scripts/omps-payload-spec.mjs`.

**Raiz incluída:**

- `server-manifest.json`
- `supabase/` (config, SQL, migrations, Edge Functions)
- `frontend/` (fontes e configs; **sem** `dist/` pré-compilado)
- `Transferir para Servidor/` (scripts LAN, schema, Caddy, backup)
- `schemas/` (JSON Schema + validador do manifesto)

**Excluído explicitamente:**

- `.git`, `.github`, `.cursor`, `docs/`, `scripts/` (raiz OMPS)
- `Instalador OPMS/` (cliente Electron — produto separado)
- `node_modules/` (qualquer nível)
- `frontend/dist/` (build LAN ocorre na instalação no destino)
- `.env`, `connection.json` (segredos / pareamento)

**Metadados gerados:** `release/omps-bundle/bundle-meta.json` (`schema: servidor-omps-bundle/1`).

---

## O que o instalador Servidor OMPS empacota além do payload

Mesmos recursos do Manager genérico (UI, `local-service`, Node embutido, scripts launcher/bootstrap), mais:

- `resources/omps-payload/`
- `resources/omps-bundle/bundle-meta.json`

| Produto | appId | Artefato NSIS | Diretório de saída build |
|---------|-------|---------------|---------------------------|
| Genérico | `com.servidor.manager` | `servidor.exe` | `release/` |
| Servidor OMPS | `com.servidor.omps` | `Servidor OMPS.exe` | `release/servidor-omps/` |

Dados do usuário continuam em `C:\ServidorManager\` (NSIS não apaga).

---

## Dependências no computador de destino (após instalar o .exe)

O payload **não** elimina requisitos do manifesto `supabase-local-v1`. No destino ainda serão necessários (instalação/bootstrap):

| Dependência | Uso |
|-------------|-----|
| **Docker Desktop** (Engine ativo) | `supabase start` |
| **Supabase CLI** | Stack local |
| **Caddy** | Proxy HTTP LAN |
| **Node.js 20+** e **npm** | Scripts `.mjs` e `frontend.build` |
| **bash** (Git Bash) | `aplicar-schema-local.sh` |
| **psql** | Schema/migrations |
| **Rede (1ª subida)** | Pull de imagens Docker Supabase |

**Internet:** winget/bootstrap, npm na fase de build frontend, Docker pull — salvo mirror offline explícito (fora de escopo).

**Não incluído no payload:** imagens Docker, `frontend/dist` LAN final, banco inicializado (fases do Manager na instalação manifest).

---

## Validação local recomendada

```bash
npm run build:omps-payload
npm run test:omps-payload
npm run verify:omps-payload
```

Opcional (não executa NSIS): `npm run package:servidor-omps:dir` e verificar `release/servidor-omps/win-unpacked/resources/omps-payload/server-manifest.json`.

**O payload gerado não significa instalador pronto para produção** — falta first-run, exceção Git, wizard OMPS.exe e testes de NSIS em VM.
