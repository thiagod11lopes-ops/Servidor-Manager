# Windows — Controle Inteligente de Aplicativos (Smart App Control)

O **Servidor Manager** gerado localmente (`ServidorManager.exe`) **não é assinado** com certificado Authenticode. Com o **Controle Inteligente de Aplicativos** ativo, o Windows pode bloquear:

- `ServidorManager.exe` (instalado ou portable)
- `ServidorManagerSetup.exe`
- Até `Start-Process` / atalhos que apontam para esses arquivos

`Unblock-File` remove apenas o bloqueio de download (Mark of the Web); **não contorna** o Smart App Control.

## Opção 1 — Desativar o Controle Inteligente (uso em servidor próprio)

1. **Configurações** → **Privacidade e segurança** → **Segurança do Windows** → **Controle de aplicativos e do navegador**
2. **Configurações do Controle Inteligente de Aplicativos**
3. Selecione **Desativado**

A Microsoft pode exigir **reinstalação do Windows** para reativar depois. Use só se aceitar isso no PC servidor.

## Opção 2 — Atalho **Servidor Manager** (navegador, recomendado com SAC)

Após `npm run package:dir && npm run update:installed`, o atalho na área de trabalho executa o launcher em **segundo plano** (PowerShell oculto). O runtime preferido é **`node.exe` do sistema** (assinado); **`ServidorManager.exe` só é usado se Node não estiver disponível** (pode ser bloqueado pelo SAC).

- UI: **http://127.0.0.1:5199**
- API: **http://127.0.0.1:47831**
- Dados: `C:\ServidorManager\`
- Sessão/PIDs: `C:\ServidorManager\logs\manager-launcher-session.json`

Manualmente (segundo plano):

```powershell
& "$env:LOCALAPPDATA\Programs\ServidorManager\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1"
```

Modo interativo (janela PowerShell aberta, encerra ao fechar):

```powershell
& "$env:LOCALAPPDATA\Programs\ServidorManager\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1" -Interactive
```

Encerrar processos do Manager instalado:

```powershell
& "$env:LOCALAPPDATA\Programs\ServidorManager\resources\manager-launcher\Stop-ServidorManager-Installed.ps1"
```

## Opção 3 — Rodar a partir do código-fonte

Na pasta do projeto, com Node.js instalado:

```powershell
npm run build
npm run start:browser
```

Ou `.\scripts\Start-ServidorManager-Browser.ps1` (Vite preview na 5199).

## Opção 4 — Produção assinada (recomendado para Electron com SAC)

Empacotar com **certificado de assinatura de código** (OV/EV) e Authenticode válido. Detalhes, variáveis de ambiente e scripts: **[WINDOWS-CODE-SIGNING.md](WINDOWS-CODE-SIGNING.md)**.

Sem certificado, **`ServidorManager.exe` permanece `NotSigned`** e o SAC pode bloquear o atalho Electron após cada `package:dir` que substitui o binário.
