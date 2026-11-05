# Pendências em aberto

| Item | Desde | Situação | Causa |
|---|---|---|---|
| **Pagamento da mensalidade** (painel do cliente → Assinatura / Meus dados; `/admin` → Cobranças) | 05/11/2026 | Etiqueta **"Em ajuste"** na tela. A cobrança é manual: o cliente paga por PIX e manda o comprovante pelo WhatsApp, e o admin clica em "Marcar como pago". Não há gateway, pagamento online, baixa automática, boleto nem cartão. | Decisão de produto adiada pelo dono ("não é algo que vamos definir agora"). Nenhuma solução foi escolhida. |

Para tirar a etiqueta: mude `EM_AJUSTE.pagamento` para `false` em `public/assets/painel.js` e `private/admin.html`, apague esta linha e a checagem em `scripts/checar-etiquetas.sh`.

Fora da etiqueta (de propósito): a landing page (`public/index.html`) ainda diz que a mensalidade pode ser paga "por PIX, boleto ou cartão". Isso deve ser revisto antes de abrir para clientes reais.
