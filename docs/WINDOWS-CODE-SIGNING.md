# Assinatura de código — Servidor Manager (Windows)

## Por que o Smart App Control bloqueia o `.exe`

Evidências no ambiente de build atual (sem certificado configurado):

- `release\win-unpacked\ServidorManager.exe` → **Authenticode: `NotSigned`**
- `package.json` → `"win.signAndEditExecutable": false` (evita cache winCodeSign com symlinks darwin; assinatura via `CSC_*` / `Sign-ManagerWindowsRelease.ps1`)
- `npm run update:installed` copia **`release\win-unpacked` inteiro** (`robocopy /MIR`), incluindo um **Electron recém-gerado** (~201 MB, versão shell 35.7.5) sempre que `package:dir` roda.

O **Controle Inteligente de Aplicativos (SAC)** trata binários **não assinados** (ou com reputação insuficiente) como não confiáveis. Após as atualizações que passaram a remontar `win-unpacked` com frequência, o atalho **Servidor Manager (Electron).lnk** aponta para um **`.exe` novo e sem assinatura** — o bloqueio é esperado **sem certificado EV/OV**.

Isso **não** é contornado por `Unblock-File` (Mark of the Web). **Não** desative SAC/Defender como “correção”.

## Atalho recomendado com SAC ativo

O atalho principal **Servidor Manager** (sem “Electron”) usa **Node embarcado + UI :5199** e **não** depende de `ServidorManager.exe`. Veja [WINDOWS-SMART-APP-CONTROL.md](WINDOWS-SMART-APP-CONTROL.md).

O atalho **Servidor Manager (Electron)** existe para janela Electron (ex.: seletor de pasta nativo). Com SAC e **sem assinatura**, esse atalho pode continuar bloqueado até existir certificado confiável.

## Atualização local e frequência do `.exe`

`Update-InstalledManager.ps1` distingue:

| Modo | Quando | Efeito |
|------|--------|--------|
| **ResourceOnly** | Só `dist/` ou `dist-local-service/` mudaram | Atualiza `resources\ui-dist` e `resources\local-service` **sem** substituir `ServidorManager.exe` |
| **FullPack** | Falta `win-unpacked`, `app.asar`/preload desatualizado, etc. | `npm run package:dir` + cópia completa (inclui `.exe` novo) |

Isso reduz trocas desnecessárias do shell Electron em atualizações só de UI/serviço, mas **não substitui** assinatura de código para SAC.

## Configurar assinatura (produção)

**Requisitos:** certificado de **assinatura de código** Windows (OV ou EV de emissor confiável). Chaves **fora** do repositório.

### Variáveis de ambiente (electron-builder + script opcional)

| Variável | Uso |
|----------|-----|
| `CSC_LINK` ou `WIN_CSC_LINK` | Caminho absoluto para `.pfx` |
| `CSC_KEY_PASSWORD` ou `WIN_CSC_KEY_PASSWORD` | Senha do PFX |
| `SIGNTOOL_PATH` | (Opcional) caminho para `signtool.exe` |
| `SERVIDOR_MANAGER_TIMESTAMP_URL` | (Opcional) RFC 3161; padrão Digicert |

### Fluxo de release assinado

```powershell
npm run build
npm run package:dir
# Se CSC_* estiver definido, electron-builder assina automaticamente.
# Assinatura adicional/explicita (DLLs, validação):
powershell -NoProfile -File scripts/Sign-ManagerWindowsRelease.ps1 -IfConfigured
powershell -NoProfile -File scripts/Test-ManagerWindowsReleaseSignature.ps1 -RequireValidSignature
npm run update:installed
```

Para **exigir** assinatura válida antes de copiar para instalação local:

```powershell
$env:SERVIDOR_MANAGER_REQUIRE_SIGNED_EXE = '1'
npm run update:installed
```

### Instalador NSIS

`npm run package:installer` gera `servidor.exe` / setup — também deve ser assinado com o **mesmo certificado** em pipeline de release (configuração `CSC_*` no `electron-builder`).

### OMPS Usuário e Servidor OMPS (distribuição `release/omps-unified`)

**Sintoma SAC (evidência):** log `Microsoft-Windows-CodeIntegrity/Operational`, eventos **3033** / **3077** — `explorer.exe` tentou carregar `AcompOPMS.exe` (ou `ServidorManager.exe`) que **não atendeu ao nível de assinatura Enterprise** (Smart App Control). Aba **Assinaturas digitais** vazia → `Get-AuthenticodeSignature` = **`NotSigned`**.

**Empacotamento:** Electron 35 + electron-builder (NSIS). `signAndEditExecutable: false` evita falha do cache **winCodeSign** em Windows sem privilégio de symlink (Modo de Desenvolvedor/admin). Metadados PE são aplicados via `node scripts/apply-omps-exe-metadata.mjs` após `--dir`. **Authenticode** exige `CSC_*` + `npm run sign:omps-release` no `win-unpacked` **antes** do NSIS `--prepackaged`. Assinar só o setup `.exe` **não** assina o `AcompOPMS.exe` extraído na instalação.

**Pipeline sustentável (implementado):**

1. `electron-builder --win --dir` → `release/.../win-unpacked`
2. `npm run sign:omps-release -- -Variant omps-usuario|servidor-omps -Stage win-unpacked -IfConfigured` (ou `CSC_*` durante o passo 1 via electron-builder)
3. `electron-builder --win nsis --prepackaged release/.../win-unpacked` → instalador contém **binários já assinados**
4. `npm run sign:omps-release -- -Stage nsis -IfConfigured` → Authenticode no setup NSIS

Scripts: `scripts/Sign-OmpsWindowsRelease.ps1`, `scripts/Invoke-AuthenticodeSignBatch.ps1`.

**Sem certificado:** os artefatos continuam `NotSigned`; SAC **continuará bloqueando** o atalho Electron / `AcompOPMS.exe`. Não há correção de empacotamento que substitua certificado confiável.

**Com certificado:** OV ou EV de emissor reconhecido pela Microsoft; EV acelera reputação no SAC. Variáveis iguais à tabela acima (`CSC_LINK`, `CSC_KEY_PASSWORD`).

```powershell
$env:CSC_LINK = 'C:\caminho\seu-certificado.pfx'
$env:CSC_KEY_PASSWORD = '***'
npm run package:omps-usuario
npm run package:servidor-omps
npm run package:omps-unified-dist
npm run verify:omps-authenticode
# Exigir Valid em CI/release:
$env:SERVIDOR_MANAGER_REQUIRE_SIGNED_EXE = '1'
npm run verify:omps-authenticode
```

## Verificação

```powershell
powershell -NoProfile -File scripts/Test-ManagerWindowsReleaseSignature.ps1
powershell -NoProfile -File scripts/Test-ManagerWindowsReleaseSignature.ps1 -ExePath "$env:LOCALAPPDATA\Programs\ServidorManager\ServidorManager.exe"
```

`SignatureStatus: Valid` → Authenticode aceito pelo Windows (SAC ainda pode exigir reputação EV em alguns cenários).

## O que ainda depende do operador

- Adquirir e proteger certificado (sem commitar PFX).
- Assinar builds de release antes de distribuir.
- Para SAC estrito em produção, preferir **instalador assinado** ou política corporativa de allowlist — não há bypass seguro no repositório.
