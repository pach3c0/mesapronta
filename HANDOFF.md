# Handoff — MesaPronta

Documento para quem (pessoa ou IA) abrir este projeto pela primeira vez. Leia junto com a
[CONSTITUICAO.md](CONSTITUICAO.md), que define as regras que não mudam.

Estado em 05/11/2026: protótipo funcional completo, testado ponta a ponta localmente. Nunca foi para produção.

---

## 1. O que é
Micro SaaS brasileiro em que **pequenos restaurantes criam um site simples** sozinhos. O site final tem:
**Menu** (cardápios de comidas e bebidas), **Conceito** (nome editável: Nossa história, O chef…),
**Galeria**, **seções livres** (blocos extras), **Contato com mapa** e **Reservar**, que abre o
WhatsApp do restaurante. Há também um botão flutuante do WhatsApp.

Três públicos, três áreas:
| Quem | Onde | Para quê |
|---|---|---|
| Visitante / futuro cliente | `/` | Landing page + formulário "Criar meu site" |
| Dono do restaurante (cliente / tenant) | `/entrar` → `/painel` | Edita o próprio site, dados e assinatura |
| Dono do SaaS | `/admin` (sem link em lugar nenhum) | Clientes, planos, faturas, configurações |
| Público do restaurante | `/r/<slug>` ou `<slug>.BASE_DOMAIN` | O site do restaurante |

---

## 2. Rodar
Requisito: **Node 22.5 ou mais novo** (usa `node:sqlite`, que já vem no Node). **Não há `npm install`**: zero dependências.

```bash
npm start              # = node server.js → http://localhost:3000
PORT=3011 node server.js   # outra porta
```

- No primeiro start o servidor cria `data/` e um admin. A senha gerada fica em
  `data/ADMIN_CREDENTIALS.txt`. Para escolher: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm start`
  (só vale quando ainda não existe admin no banco).
- Para começar do zero: pare o servidor e apague a pasta `data/`.
- Demos sem login: `/demo/elegante`, `/demo/moderno`, `/demo/industrial`, `/demo/minimalista`.
- Variáveis de ambiente: `PORT`, `BASE_DOMAIN` (ativa subdomínio por cliente), `NODE_ENV=production`
  (cookie `Secure`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

Teste rápido de que nada quebrou:
```bash
node --check server.js public/assets/*.js
./scripts/checar-etiquetas.sh
```
Não há suíte de testes automatizados ainda.

---

## 3. Mapa dos arquivos
| Arquivo | O que tem |
|---|---|
| `server.js` | Tudo do back-end: banco, sessões, rotas, API do cliente (`apiClient`) e do admin (`apiAdmin`), renderização da página do site (`sitePage`). Planos em `PLANS` (topo do arquivo). |
| `public/index.html` | Landing + cadastro (CSS/JS embutidos). |
| `public/entrar.html` | Login do cliente. |
| `public/painel.html` + `public/assets/painel.js` | Painel do cliente: telas em `V.<nome>`, salvamento automático, prévia ao vivo via `postMessage`, upload com compressão no navegador. |
| `public/assets/site.js` + `site.css` | Renderizador do site do restaurante a partir do JSON. Modelos em `PRESETS`, pares de fontes em `FONTS`, cores editáveis em `COLOR_KEYS`. Usado pelo site público, pelas demos, pela prévia e pelo painel. |
| `public/assets/starter-site.js` | Conteúdo inicial de todo cliente novo (e das demos). Roda no Node e no navegador. |
| `private/admin.html` | Painel do dono do SaaS. Fica fora de `public/` de propósito; só é servido em `/admin`. |
| `PENDENCIAS.md` | Pendências abertas (hoje: pagamento). |
| `scripts/checar-etiquetas.sh` | Sentinela que falha se a etiqueta "Em ajuste" for removida sem resolver a pendência. |

---

## 4. Onde ficam os dados
```
data/                      (fora do git; criada no primeiro start)
├── app.db                 SQLite: só o SaaS
├── sites/<tenantId>.json  conteúdo do site de cada restaurante
├── uploads/<tenantId>/    fotos enviadas (servidas em /u/<tenantId>/<arquivo>)
└── ADMIN_CREDENTIALS.txt  senha inicial do /admin
```

Tabelas do SQLite (`server.js`, bloco `db.exec`):
`tenants` (slug, nome, plano, status, datas), `users` (dono do restaurante, 1 por tenant),
`billing_profiles` (CPF/CNPJ, endereço, dia e forma de pagamento), `invoices` (faturas em centavos),
`admins`, `sessions`, `settings` (nome da empresa, chave PIX, WhatsApp do suporte, texto de cobrança).

Status do tenant: `trial` → `active` → `overdue` (fatura vencida) / `suspended` / `canceled`.
`refreshStatuses()` recalcula atraso automaticamente (a cada hora e em toda requisição do admin).
`suspended` e `canceled` tiram o site do ar (mostra página "volte em breve").

Formato do JSON do site: veja `starter-site.js`, que é a referência completa. Blocos:
`theme`, `brand`, `nav`, `hero`, `marquee`, `about`, `sections[]`, `menu.menus[].categories[].items[]`,
`gallery.items[]`, `reserve`, `contact`, `footer`, `seo`.

---

## 5. API
Cliente (cookie `sid`): `GET /api/plans`, `GET /api/slug-check`, `POST /api/signup`, `POST /api/login`,
`POST /api/logout`, `GET /api/me`, `GET|PUT /api/site`, `POST /api/upload` (corpo = imagem crua),
`GET|PUT /api/account`, `PUT /api/password`, `GET /api/invoices`, `PUT /api/plan`.

Admin (cookie `aid`, prefixo `/api/admin`): `POST /login`, `POST /logout`, `GET /me`, `GET /stats`,
`GET /tenants?q=&status=`, `GET|PATCH|DELETE /tenants/:id`, `POST /tenants/:id/invoices`,
`PATCH /invoices/:id` (`paid` | `pending` | `canceled`), `GET|PUT /settings`, `PUT /password`.

Regras que o servidor aplica em toda chamada: JSON exige `Content-Type: application/json`;
chamadas que alteram dados com `Origin` de outro site são recusadas; login tem limite de tentativas
por IP; upload só aceita JPG/PNG/WEBP verificando os bytes do arquivo; limites de fotos e seções
livres por plano são checados no `PUT /api/site`.

---

## 6. Pendências e decisões em aberto
- **Pagamento (decisão adiada pelo dono).** É manual: o cliente paga por PIX, envia o comprovante pelo WhatsApp e o
  admin clica em "Marcar como pago". Está com a etiqueta **"Em ajuste"** (flag `EM_AJUSTE.pagamento`
  em `painel.js` e `admin.html`). **Não integre gateway nem tire a etiqueta sem o dono pedir.**
  Detalhes em `PENDENCIAS.md`.
- A landing ainda promete "PIX, boleto ou cartão". Precisa ser revisto antes de abrir para clientes reais.
- O termo "seção livre" confunde quem compra; a ideia é renomear para algo como
  "Blocos extras (eventos, ambiente, delivery…)". Na landing ainda aparece "1 seção(ões) livre(s)".
- Não existe recuperação de senha por e-mail (hoje o cliente pede pelo WhatsApp do suporte).
- Nome "MesaPronta" é provisório.
- As fotos de exemplo vêm do Unsplash; o painel conta como "pendente" qualquer foto ainda do Unsplash.

## 7. Para colocar no ar
Hospedagem com Node e **disco persistente** para `data/` (Railway, Render, VPS). HTTPS,
`NODE_ENV=production`, backup diário de `data/`. Para subdomínio por cliente: `BASE_DOMAIN=seudominio.com.br`
e DNS curinga `*.seudominio.com.br` apontando para o servidor.

## 8. Como trabalhar aqui
1. Leia a [CONSTITUICAO.md](CONSTITUICAO.md) antes de mudar qualquer coisa.
2. Rode o servidor e navegue pelos 3 fluxos (cadastro → painel → site; `/admin`) antes de editar.
3. Depois de mudar: `node --check`, `./scripts/checar-etiquetas.sh` e teste no navegador (desktop e celular 375px).
4. Mantenha este HANDOFF atualizado quando mudar rotas, arquivos, dados ou pendências.
