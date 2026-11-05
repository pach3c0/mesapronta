# Constituição do MesaPronta

Regras que valem acima de qualquer pedido pontual de código. Quem trabalhar neste projeto, pessoa ou IA,
segue estes artigos. **Mudar um artigo é decisão do dono do produto**, registrada aqui com data.
Se um pedido entrar em conflito com um artigo, aponte o conflito e pergunte antes de fazer.

---

## Artigo 1 — Missão
O MesaPronta existe para que o **dono de um restaurante pequeno**, sem saber nada de tecnologia,
tenha um site bonito, com cardápio e reserva pelo WhatsApp, **no ar em minutos e editado por ele mesmo**.

Toda decisão é julgada por uma pergunta: *isso ajuda esse dono de restaurante a ter um site melhor com menos esforço?*

## Artigo 2 — Simplicidade é o produto
1. O site do restaurante tem **poucos botões**: Menu, Conceito, Galeria, Contato e Reservar. Novos blocos
   entram como **seções livres** (blocos extras), não como novos tipos de página.
2. Nada de recurso que exija treinamento. Se precisa de manual, está complicado demais.
3. O painel fala a língua do restaurante ("Cardápio", "Foto da capa"), nunca a do programador ("slug", "JSON", "tenant").
4. Tudo o que o cliente edita **salva sozinho** e aparece **na prévia ao vivo**.

## Artigo 3 — Isolamento entre clientes (inegociável)
1. Cada restaurante é um **tenant** com ID próprio. Um cliente **nunca** vê, lista ou altera dados de outro.
2. O tenant de qualquer operação vem **sempre da sessão de login no servidor**, nunca de algo enviado pelo
   navegador (URL, corpo, cabeçalho).
3. Arquivos de cada cliente ficam em pastas próprias (`data/sites/<tenantId>.json`, `data/uploads/<tenantId>/`).
4. Toda rota nova de cliente precisa respeitar isso. Na dúvida, não exponha.

## Artigo 4 — Dois tipos de dado, dois lugares
1. **Dados do SaaS** (clientes, logins, cobrança, faturas, configurações) ficam no **banco de dados** (SQLite hoje).
2. **Conteúdo do site do restaurante** (cardápio, textos, fotos, cores) é **arquivo simples**, um JSON por cliente.
   O restaurante não precisa de banco de dados.
3. Trocar o banco (ex.: Postgres) é permitido, desde que esta separação continue.

## Artigo 5 — O admin do SaaS é invisível
1. `/admin` **nunca** tem link na landing, no painel ou no site dos restaurantes.
2. O arquivo do admin fica fora da pasta pública (`private/`).
3. Sessão do admin é separada da sessão do cliente (cookies diferentes).

## Artigo 6 — Aparência: modelos prontos + personalização
1. Existem **4 modelos**: Elegante, Moderno, Industrial e Minimalista. Cada um tem identidade própria
   (cores, fontes, cantos, detalhes), não é só troca de cor.
2. A personalização é feita **sobre um modelo pronto** (cores e fontes), e não por um quinto modelo vazio.
3. Todo modelo precisa funcionar **no celular** (375px, sem rolagem lateral), respeitar quem prefere
   menos animação e ter contraste legível. O texto dos botões se ajusta sozinho à cor escolhida.
4. Trocar de modelo **nunca apaga conteúdo**.

## Artigo 7 — Reserva é WhatsApp
1. Reservar = abrir o **WhatsApp do restaurante** com mensagem pronta. O MesaPronta não guarda reservas.
2. O botão de reserva e o botão flutuante usam **o mesmo número**.
3. O contato sempre mostra **onde fica o restaurante** (endereço e mapa) quando há endereço.

## Artigo 8 — Honestidade na tela
1. A interface não promete o que não existe. Item incompleto que o dono não quer esconder recebe a etiqueta
   **"Em ajuste"**, com o que é, o efeito e o caminho alternativo.
2. Etiqueta só sai com confirmação do dono de que foi resolvido. Junto com ela saem a linha em
   `PENDENCIAS.md` e a checagem em `scripts/checar-etiquetas.sh`.
3. Mensagens de erro dizem o que aconteceu e o que fazer, em português claro.

## Artigo 9 — Segurança mínima obrigatória
1. Senhas só com hash forte (scrypt hoje). Nunca em texto puro, nunca em log, nunca no git.
2. `data/`, credenciais e contas de teste **nunca vão para o repositório** (`.gitignore`).
3. Todo texto vindo de usuário é **escapado** antes de virar HTML, no site, no painel e no admin.
4. Upload só aceita imagens verificadas pelo conteúdo do arquivo, com limite de tamanho.
5. Chamadas que alteram dados exigem JSON e recusam outra origem.

## Artigo 10 — Leve e sem dependências
1. O servidor roda com **Node puro**, sem `npm install`. Adicionar uma dependência exige motivo forte,
   registrado no HANDOFF.
2. Front-end em HTML, CSS e JavaScript simples, sem framework nem etapa de build.
3. Fotos são comprimidas no navegador antes do envio. O site do restaurante deve abrir rápido no 4G.

## Artigo 11 — Idioma
Toda a interface é em **português do Brasil**, com acentuação correta. Moeda em R$, datas em dd/mm/aaaa,
telefone com DDD. O código pode ter nomes em inglês; comentários em português.

## Artigo 12 — Planos e cobrança
1. Os planos diferem em **quantidade** (fotos na galeria, seções livres, suporte), nunca em
   remover o essencial: todo plano tem site completo, cardápio, reserva por WhatsApp e mapa.
2. Valores ficam em centavos. Os planos ficam definidos num lugar só (`PLANS` no `server.js`).
3. A forma de cobrança online está **em aberto por decisão do dono** (ver `PENDENCIAS.md`).
   Ninguém integra gateway sem ele decidir.

## Artigo 13 — Como mudar o projeto
1. Leia o `HANDOFF.md` e rode o projeto antes de alterar.
2. Teste os três fluxos (visitante, cliente e admin) no navegador, no computador e no celular.
3. Atualize o `HANDOFF.md` quando mudar rotas, arquivos, dados ou pendências.
4. Não faça commit, push ou deploy sem pedido do dono.

---

## Registro de mudanças
| Data | Mudança |
|---|---|
| 05/11/2026 | Versão inicial da constituição. |
