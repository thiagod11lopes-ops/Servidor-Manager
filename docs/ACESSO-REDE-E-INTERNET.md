# Acesso na rede e na Internet

## Rede local (Wi‑Fi / LAN) — suportado

Com `C:\ServidorManager\config\network.json`:

```json
{ "allowLanAccess": true }
```

(padrão ao criar o arquivo)

- Apps manifest LAN escutam via **Caddy** (em geral **:8080**); preview Vite **:4173** é legado.
- Manager (Plano B) em **`http://<IP-do-servidor>:5199/sistemas`**.
- Outros celulares/PCs na **mesma rede** usam o **IP IPv4 do servidor** (ex.: `192.168.0.15`), não `127.0.0.1`.
- A UI do Manager mostra **“Acesso na rede”** quando o sistema está executando.
- Variáveis **`VITE_*`** no `.env` do projeto têm `localhost` / `127.0.0.1` substituídos pelo IP da LAN ao **Iniciar** (APIs locais que substituem Supabase).

### Firewall Windows

Execute **como Administrador**:

```powershell
cd C:\Users\User\Desktop\Thiago\Projetos\Servidor
powershell -ExecutionPolicy Bypass -File scripts\Ensure-LanFirewallRules.ps1
```

A porta **47831** (API interna) **não** é exposta na rede — só via proxy da UI na 5199.

## PostgreSQL

O banco fica **neste servidor**. Clientes **não** acessam o Postgres diretamente pelo navegador; o **frontend** chama APIs configuradas no `.env`. Garanta que o **backend/API** (PostgREST, Node, etc.) também escute na LAN se o app depender dele.

## Fora da rede local (Internet / 4G)

**Não está incluído** no Manager (sem domínio, HTTPS público ou VPN integrada). Use apenas **Local** ou **LAN** conforme este documento. Acesso remoto exige solução de rede externa ao produto.

Desativar acesso LAN:

```json
{ "allowLanAccess": false }
```

Apps voltam a escutar só em `127.0.0.1`.
