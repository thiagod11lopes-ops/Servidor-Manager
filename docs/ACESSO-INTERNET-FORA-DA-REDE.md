# Acesso fora deste PC

O Servidor Manager suporta apenas:

1. **Local** — neste computador servidor (`127.0.0.1`).
2. **Rede local (LAN)** — outros dispositivos na mesma Wi‑Fi ou cabo Ethernet (IPv4 privado + Caddy, em geral `:8080`).

Não há modo Internet, VPN integrada ou MagicDNS no Manager.

Para aceder a partir de outro telemóvel ou PC **na mesma casa/escritório**, use o endereço LAN exibido no painel **Acesso ao sistema** ou no **Checklist** (modo LAN).

Para aceder **de fora da rede local**, use soluções de rede à parte (VPN site-to-site, túnel reverso, etc.) — fora do escopo deste produto.

Consulte também `docs/ACESSO-REDE-E-INTERNET.md` e `scripts/Ensure-LanFirewallRules.ps1` (Admin).
