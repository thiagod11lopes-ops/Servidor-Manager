# Instalação e operação do servidor Windows (Etapas 12–13)

Runbook para preparar um PC Windows como **servidor** com o **Servidor Manager** e instalar sistemas via manifesto (perfil **AcompSolemp** / `supabase-local-v1`), **sem Cursor** na máquina destino.

---

## Arquitetura resumida

| Componente | Porta / endereço | Função |
|------------|------------------|--------|
| **local-service** | `127.0.0.1:47831` | API administrativa (runtime, bootstrap, instalação manifest LAN) |
| **UI do Manager** | `0.0.0.0:5199` (proxy `/api/v1` → 47831) | Interface web; abrir preferencialmente em **`http://127.0.0.1:5199/`** |
| **Dados** | `C:\ServidorManager\` | Sistemas, config, logs (persistem ao desinstalar o Manager) |
| **Instalação padrão** | `%LOCALAPPDATA%\Programs\ServidorManager` | Conteúdo do `servidor.exe` (Electron + resources) |

A API **47831** escuta apenas em **loopback** (`SERVICE_HOST = 127.0.0.1`). Outros dispositivos na LAN acessam o Manager pela **5199**, não pela 47831 diretamente.

---

## 1. Instalação e primeiro uso (`servidor.exe`)

### O que o instalador faz

| Item | Comportamento |
|------|----------------|
| **`servidor.exe` (NSIS)** | Instala **Servidor Manager** em `%LOCALAPPDATA%\Programs\ServidorManager` (Electron, `local-service.cjs`, UI estática, scripts em `resources\`) |
| **Pós-instalação** | Atalho **Servidor Manager** no desktop (PowerShell + launcher navegador — ver abaixo) |
| **`ServidorManager.exe`** | Opcional; pode ser bloqueado pelo Controle Inteligente de Aplicativos (SAC) |

### Abrir o Manager após instalar

**Modo recomendado (atalho padrão):** executa `resources\manager-launcher\Start-ServidorManager-NoElectron.ps1` em **segundo plano** (PowerShell oculto), que:

1. Usa **`node.exe` do sistema** quando `node --version` responde (compatível com SAC); senão tenta `ServidorManager.exe`.
2. Sobe **local-service** na porta **47831** e a UI em **5199** via `serve-manager-ui.mjs`.
3. Abre o navegador em **`http://127.0.0.1:5199/`** e grava PIDs em `C:\ServidorManager\logs\manager-launcher-session.json`.
4. Encerrar: `Stop-ServidorManager-Installed.ps1` (somente processos sob o diretório de instalação).

**Modo Electron:** executar `ServidorManager.exe` no diretório de instalação (sobe o `local-service` embutido e carrega a UI).

Se a UI mostrar erro de serviço indisponível, feche processos antigos na 47831 e abra de novo pelo atalho.

### Bootstrap — “Preparar este PC como servidor”

No **Dashboard**, painel **Preparar este PC como servidor**:

- **Verificar de novo** — consulta dependências do perfil de referência `supabase-local-v1` (não instala sozinho).
- **Preparar este computador** — dispara job que executa `resources\server-bootstrap\Invoke-ServerBootstrap.ps1` com `-InstallMissing` e `-LaunchDockerDesktop`.

**Dependências alvo** (manifest LAN / AcompSolemp): Git, Node.js 20+, npm, Docker Desktop (Engine em execução), Supabase CLI (via npm global quando aplicável), Caddy, `psql`, bash (Git Bash).

**Logs do bootstrap:** `C:\ServidorManager\logs\bootstrap-<jobId>.log` (trecho exibido na UI durante o job).

**Códigos de saída do script** (refletidos na mensagem do job):

| Código | Significado usual |
|--------|-------------------|
| 0 | Verificação crítica OK |
| 1 | Ainda faltam dependências ou não funcionam |
| 2 | `winget` ausente (App Installer) |
| 3 | Docker instalado mas Engine parado |
| 4 | Falha winget/npm em componente necessário |

Requisitos **adicionais** do manifesto do projeto (firewall, overlay WireGuard, bash, etc.) aparecem após **Analisar** o repositório em **Meus Sistemas** — o bootstrap do Dashboard não substitui essa análise.

---

## 2. Fluxo operacional (AcompSolemp / manifest LAN)

Ordem recomendada:

1. **Dashboard → Preparar este computador** até pré-requisitos básicos verificados (Docker Engine em execução quando necessário).
2. **Meus Sistemas → Adicionar sistema** — URL GitHub com branch que contém `server-manifest.json` (ex.: repositório AcompSolemp na branch indicada pelo time).
3. **Analisar** — valida manifesto e requisitos específicos.
4. **Preparar instalação / Instalar** — clone e fases do manifesto em `C:\ServidorManager\systems\<systemId>\`.
5. **Iniciar** — runtime **manifest-lan** (Supabase via Docker + Caddy, porta HTTP configurada, em geral **8080**).
6. **Verificar acesso LAN** — no painel **Execução**, link **Acesso local (rede LAN)** ou URL de login; com `C:\ServidorManager\config\network.json` e `"allowLanAccess": true` (padrão ao criar), apps escutam na LAN conforme o runtime (detalhes em `docs/ACESSO-REDE-E-INTERNET.md`).

Falha em fase de instalação do manifesto: mensagem na UI aponta para  
`C:\ServidorManager\systems\<systemId>\logs\phase-<fase>.log`.

---

## 3. Modos de acesso (Local e LAN)

| Modo | Uso |
|------|-----|
| **Local** | OMPS neste computador (`127.0.0.1`, Caddy na porta HTTP do manifesto). |
| **Rede local (LAN)** | Outros dispositivos na mesma Wi‑Fi/Ethernet usam IPv4 RFC1918 + Caddy (em geral **:8080**). |

Modos **Internet / VPN** foram removidos. Instalações antigas com `access-mode.json` inválido devem escolher **Local** ou **LAN** de novo.

**Overlay WireGuard** (opcional no manifesto) é distinto da LAN física — continua configurado via `servidor.env` / fases do manifesto.

Firewall LAN: `scripts\Ensure-LanFirewallRules.ps1` (Admin) — inclui **8080** (Caddy), **5199** (UI) e portas de preview legado.

---

## 4. HTTP local e endereço LAN

No painel **Execução** e no **Checklist**:

| Indicador | O que significa |
|-----------|-----------------|
| **Estado** | Runtime (executando, parado, etc.). |
| **HTTP local** | Probe em **loopback** (`127.0.0.1`) na URL canônica. |
| **Endereço LAN** | IPv4 Wi‑Fi/Ethernet + porta Caddy — use em telemóveis/PCs na mesma rede. |

Endereços CGNAT (100.64.x) ou URLs legadas de preview (:4173) são **corrigidos automaticamente** ao atualizar execução quando o modo é LAN.

---

## 5. Após reinicialização do Windows

Comportamento **confirmado no código** (Etapa 12c) — não há auto-start do Manager nem da pilha **manifest-lan** (AcompSolemp) integrado ao SO.

### Como o Manager inicia hoje

| Mecanismo | O que faz |
|-----------|-----------|
| **Atalho padrão pós-NSIS** | `powershell.exe` (oculto) → `Start-ServidorManager-NoElectron.ps1` — runtime **`node.exe` do sistema** quando disponível; sobe **47831** + **5199** em segundo plano e abre **`http://127.0.0.1:5199/`**. Encerrar: `Stop-ServidorManager-Installed.ps1`. Modo `-Interactive` mantém janela aberta (legado). |
| **`ServidorManager.exe` (Electron)** | Sobe o `local-service` embutido, carrega a UI empacotada; ao sair do app, mata o **47831**. |
| **NSIS** | Também pode criar atalho direto para o `.exe`; o script pós-instalação adiciona o atalho navegador acima. |

**Não implementado:** entrada no login do Windows, Task Scheduler, chaves Run/registry ou `app.setLoginItemSettings` — o Manager **não** sobe sozinho após reboot.

O launcher mata listeners antigos na **47831** antes de subir um novo `local-service` (recuperação quando a porta ficou presa).

### Runtime **manifest-lan** (AcompSolemp / `supabase-local-v1`)

- **Iniciar** na UI chama, em ordem: garantir **Supabase** (`supabase start` via Docker) → script de **proxy/Caddy** do manifesto → probe HTTP na porta LAN (em geral **8080**).
- **Status** reavalia **sempre** Caddy (HTTP loopback) e Supabase (`supabase status`); atualiza `runtime-state.json` — não depende só de PID (manifest-lan usa `pid: null`).
- **Serviço Windows opcional da UI:** **não se aplica** a este perfil. A API recusa instalação (`resolveValidatedRuntimeStart`); em **Meus Sistemas** o painel de serviço é substituído por aviso para usar **Iniciar** (Caddy :8080, não preview :4173).
- **Após reboot:** Caddy e o app **param** com o SO. Supabase/Docker **podem** voltar parcialmente se o Docker Desktop iniciar sozinho e containers sobreviverem — mesmo assim o operador deve **reabrir o Manager** e usar **Iniciar** (ou **Atualizar status** + **Iniciar** se aparecer parado). Não presuma que a pilha LAN está up só porque o Docker está verde.

Fechar o Manager **não** encerra automaticamente Caddy/Supabase iniciados pelo runtime (processos/scripts ficam no SO até parar na UI ou reboot).

### Runtime **process** (apps com comando Node/npm validado)

- **Iniciar:** processo filho **detached** com logs em `logs\stdout.log` / `stderr.log`; estado em `runtime-state.json` + PID.
- **Parar:** árvore de processos pelo PID armazenado.
- **GET /status:** `reconcileAliveState` — se o PID morreu (inclui reboot), corrige para **parado** e grava `lastError` (“Processo encerrado inesperadamente” quando aplicável).
- **Serviço Windows opcional** (só este perfil): `sc create` apontando para `service-host.cjs --system-id=…`; com **inicialização automática** (`start= auto`), o SCM pode subir o app após reboot **se** o serviço foi instalado pelo operador **como administrador**. Isso **não** existe por padrão na instalação do Manager — só após ação explícita na UI (e **não** para manifest-lan).

Ao subir o `local-service`, `reconcileAllSystemServices()` alinha `runtime-state.json` com `sc query` para pastas que tenham `service-config.json` com `installed: true`.

### Interface após reboot

| Situação | Comportamento |
|----------|----------------|
| **Catálogo de sistemas** | Persistido no navegador (`localStorage`) e mesclado com pastas em `C:\ServidorManager\systems` ao abrir **Meus Sistemas**. |
| **Runtime em cache** | Pode mostrar brevemente o último estado salvo (ex.: “executando”) até o refresh da API. |
| **Refresh real** | Ao carregar **Meus Sistemas**, a UI faz **uma** rodada de `refreshStatus` / serviço / banco por sistema **instalado** (se **47831** estiver no ar). **Não** há polling contínuo de runtime. |
| **Manager fechado** | Nada atualiza — operador vê cache antigo até reabrir o atalho e a página consultar de novo. |
| **Checklist operacional (12b)** | Depois do reboot, espere o refresh ou clique **Atualizar status**; essencial LAN só fica OK após **Iniciar** + HTTP local responder. |
### Procedimento operacional pós-reboot (AcompSolemp)

1. Ligar o PC → abrir **Docker Desktop** se não subir sozinho (bootstrap Dashboard **Verificar de novo** se necessário).
2. Abrir atalho **Servidor Manager** → `http://127.0.0.1:5199/`.
3. **Meus Sistemas** → aguardar refresh automático ou **Atualizar status**.
4. **Iniciar** o sistema manifest-lan → confirmar **HTTP local** e URL LAN no painel **Execução** / **Checklist**.

### Tabela resumo

| Componente | Após reboot |
|------------|-------------|
| **Manager (47831 / 5199)** | Parado até atalho ou `ServidorManager.exe` |
| **AcompSolemp manifest-lan** | Parado até **Iniciar** (+ Docker Engine) — **sem** serviço Windows suportado |
| **App runtime process + serviço instalado** | SCM pode reiniciar **só o comando process** se `automatic` foi configurado |
| **Dados `C:\ServidorManager`** | Persistem (instalações, logs, `config\network.json`) |

### Lacuna conhecida (Etapa 13)

Não há política implementada de **auto-start da pilha Supabase+Caddy** após reboot. Exigir isso implicaria desenho novo (ex.: tarefa agendada ou serviço dedicado), fora do escopo atual e **incompatível** com reutilizar o serviço Windows por-app (bloqueado para manifest-lan). Tratar como decisão de produto antes de codificar.

---

## 7. Logs e recuperação

| Situação | Onde ver / o que fazer |
|----------|-------------------------|
| Bootstrap falhou | `C:\ServidorManager\logs\bootstrap-*.log` + mensagem do job no Dashboard |
| Instalação manifest falhou | `C:\ServidorManager\systems\<systemId>\logs\phase-*.log` |
| Runtime / último erro | Painel **Execução** → **Último erro**; snapshot em `C:\ServidorManager\systems\<systemId>\runtime-state.json` |
| manifest-lan (Caddy/Supabase) | Fases de instalação: `...\logs\phase-*.log`; runtime process: `stdout.log` / `stderr.log` (principalmente perfil **process**) |
| Serviço Windows por sistema | `...\service-config.json`, `service.log`, `application.pid` — **só** se instalado (não AcompSolemp LAN) |
| Serviço 47831 indisponível | Fechar Manager; atalho reinicia processos; script mata listener na 47831 antes de subir |
| Docker parado | Código 3 do bootstrap — abrir Docker Desktop, **Verificar de novo** |
| PATH após winget | Script pode pedir reabrir o Manager |
| SAC bloqueia `.exe` | Usar atalho navegador (padrão pós-NSIS) — `docs/WINDOWS-SMART-APP-CONTROL.md` |
| Firewall LAN | Regras opcionais — `scripts/Ensure-LanFirewallRules.ps1` (admin); **47831 não** é exposta |
| PostgreSQL winget | Pode falhar — instalação manual de `psql` |

---

## 8. Gerar o instalador (desenvolvimento)

```powershell
cd <pasta-do-repositorio-Servidor>
npm run package:servidor-exe
```

Artefato: `servidor.exe` ( também em `release\` ). Copiar para a máquina destino.

Atualizar instalação local de desenvolvimento (**sem** gerar `servidor.exe`):

```powershell
npm run refresh:installed
```

Equivalente manual: `npm run package:dir` e depois `npm run update:installed`. Ver [DEV-WORKFLOW.md](DEV-WORKFLOW.md).

---

## 9. Testes automatizados (smoke)

```powershell
npm run build
npm run acceptance:server-bootstrap
npm run acceptance:manifest-lan
```

Incluem contratos de API e fluxos manifest quando Docker/local-service estão disponíveis. **Não** substituem VM Windows limpa + Docker funcional nem teste LAN real com segundo dispositivo.

---

## 10. Checklist operacional (máquina limpa)

1. Instalar `servidor.exe` → atalho → **`http://127.0.0.1:5199/`**.
2. **Preparar este computador** → Docker Engine OK.
3. Cadastrar URL AcompSolemp → **Analisar** → **Instalar** → **Iniciar**.
4. Modo **LAN** → abrir URL LAN no painel/Checklist; confirmar **HTTP local**.
5. Reiniciar Windows → reabrir atalho; validar runtime e URLs.

---

## Scripts e documentação relacionados

| Caminho | Uso |
|---------|-----|
| `scripts/Invoke-ServerBootstrap.ps1` | Bootstrap (também em `resources\server-bootstrap\` no instalador) |
| `scripts/Start-ServidorManager-NoElectron.ps1` | Launcher atalho (:5199 + :47831, segundo plano) |
| `scripts/Stop-ServidorManager-Installed.ps1` | Encerra PIDs/sessão do Manager instalado |
| `scripts/ManagerLauncherSession.ps1` | Sessão/PIDs em `C:\ServidorManager\logs` |
| `scripts/Setup-ServidorMachine.ps1` | Automação opcional (rede + bootstrap) |
| `scripts/Install-ProjectViaApi.ps1` | Instalação headless via API |
| `docs/ACESSO-REDE-E-INTERNET.md` | LAN, `network.json`, firewall |
| `docs/WINDOWS-SMART-APP-CONTROL.md` | SAC / atalho navegador |
