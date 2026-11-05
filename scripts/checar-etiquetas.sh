#!/bin/sh
# Sentinela: garante que a etiqueta "Em ajuste" do pagamento continua no lugar enquanto a pendência existir (ver PENDENCIAS.md).
cd "$(dirname "$0")/.." || exit 1
falhou=0
grep -q "EM_AJUSTE = { pagamento: true }" public/assets/painel.js || { echo "FALTA etiqueta de pagamento no painel do cliente"; falhou=1; }
grep -q "EM_AJUSTE = { pagamento: true }" private/admin.html      || { echo "FALTA etiqueta de pagamento no /admin"; falhou=1; }
grep -q "Pagamento da mensalidade" PENDENCIAS.md                   || { echo "FALTA a linha em PENDENCIAS.md"; falhou=1; }
[ $falhou -eq 0 ] && echo "Etiquetas OK"
exit $falhou
