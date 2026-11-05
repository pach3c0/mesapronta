# MesaPronta — micro SaaS de sites para restaurantes

## Rodar
Precisa do Node 22.5 ou mais novo (usa o SQLite que já vem no Node, sem instalar nada).

```bash
npm start            # http://localhost:3000
```

| Endereço | O que é |
|---|---|
| `/` | Landing page + cadastro de novo cliente |
| `/entrar` | Login do cliente (restaurante) |
| `/painel` | Dashboard do cliente |
| `/r/<endereco>` | Site público do restaurante |
| `/demo/<modelo>` | Demonstração dos modelos: elegante, moderno, industrial, minimalista |
| `/admin` | Painel do dono do SaaS (não tem link em lugar nenhum) |

O primeiro acesso do `/admin` é criado ao iniciar o servidor e fica em `data/ADMIN_CREDENTIALS.txt`.
Troque a senha em Configurações e apague o arquivo. Em produção, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## Onde ficam os dados
- **Banco SQLite** (`data/app.db`), só para o SaaS: clientes (tenants), usuários, sessões, dados de cobrança, faturas e configurações.
- **Conteúdo de cada site**: um JSON por cliente em `data/sites/<tenantId>.json`, com fotos em `data/uploads/<tenantId>/`.

Cada cliente é um tenant com ID próprio. O servidor sempre pega o tenant pela sessão de login, nunca pelo que vem
na requisição, então um cliente não consegue ver nem alterar dados de outro.

## Arquivos
- `server.js`: servidor, API do cliente (`/api/*`) e do admin (`/api/admin/*`).
- `public/index.html`, `public/entrar.html`: landing e login.
- `public/painel.html` + `public/assets/painel.js`: dashboard do cliente.
- `public/assets/site.js` + `site.css`: monta o site do restaurante (4 modelos + cores/fontes personalizadas).
- `public/assets/starter-site.js`: conteúdo inicial que todo novo cliente recebe.
- `private/admin.html`: painel admin.

## Para colocar no ar
- Hospedagem com Node (Railway, Render, VPS…) e disco persistente para a pasta `data/`. Faça backup dela.
- `NODE_ENV=production` (cookies seguros) e HTTPS.
- `BASE_DOMAIN=mesapronta.com.br` + DNS curinga `*.mesapronta.com.br` para cada cliente ter `restaurante.mesapronta.com.br`.
- Cobrança hoje é manual (admin marca a fatura como paga). O próximo passo natural é integrar Asaas ou Mercado Pago (PIX/boleto/cartão) e dar baixa automática por webhook.
- Ainda não existe recuperação de senha por e-mail (hoje o cliente pede pelo WhatsApp do suporte).
