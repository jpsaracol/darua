# DA RUA — Loja de camisas de time

Loja virtual de camisas de time com catálogo, controle de estoque por tamanho, cálculo de frete por CEP, pagamento por Pix (QR Code) ou na entrega e área do vendedor para gerenciar os pedidos.

**Site:** https://jpsaracol.github.io/darua/

## Funcionalidades

- Catálogo com filtros por categoria (Brasileirão, Europeu, Seleções, Retrô), tamanho, busca e ordenação
- Estoque por tamanho (P ao XGG) com bloqueio automático de tamanhos esgotados e aviso de últimas unidades
- Personalização com nome e número
- Frete calculado pelo CEP (API ViaCEP) com tabela por região, frete grátis acima de um valor e opção de retirada
- Checkout com Pix (QR Code e copia e cola gerados no padrão BR Code do Banco Central) ou pagamento na entrega/retirada
- Pedidos salvos na planilha por uma API em Google Apps Script, com baixa automática de estoque, preços recalculados no servidor e trava contra venda simultânea da mesma peça
- Área do vendedor com senha: lista de pedidos, busca, filtros, mudança de status e devolução ao estoque no cancelamento
- **Google Sheets como banco de dados:** o vendedor atualiza camisas, preços e estoque pela planilha (inclusive pelo celular) e o site atualiza sozinho
- Layout responsivo para celular

## Tecnologias

HTML, CSS e JavaScript puro (sem frameworks) · Google Sheets + Google Apps Script (API) · Pix BR Code · API ViaCEP · GitHub Pages

## Estrutura

```
index.html          página da loja
vendedor.html       área do vendedor (pedidos)
css/style.css       estilos
js/config.js        configurações: planilha, API, Pix, frete, personalização
js/data.js          leitura da planilha, cálculo de frete e carrinho
js/loja.js          vitrine, detalhe do produto, carrinho, pagamento e envio do pedido
js/vendedor.js      área do vendedor
apps-script/        API de pedidos (Google Apps Script) que roda dentro da planilha
fotos/              fotos das camisas (nome do arquivo vai na coluna "foto" da planilha)
darua_camisas.xlsx  modelo da planilha de camisas e estoque
```

## Como rodar localmente

O navegador bloqueia a leitura da planilha quando o arquivo é aberto direto (`file://`), então use um servidor local:

```
python3 -m http.server
```

e acesse http://localhost:8000
