# DA RUA — Loja de camisas de time

Loja virtual de camisas de time com catálogo, controle de estoque por tamanho, cálculo de frete por CEP, pagamento por Pix (QR Code) ou na entrega e área do vendedor para gerenciar os pedidos.

**Site:** https://jpsaracol.github.io/darua/

**Demonstração (portfólio):** https://jpsaracol.github.io/darua/demo/ — área do vendedor com a senha `demo123`; os pedidos ficam só no navegador de quem testa

## Funcionalidades

- Catálogo com filtros por categoria (Brasileirão, Europeu, Seleções, Retrô), tamanho, busca e ordenação
- Estoque por tamanho (P ao XGG) com bloqueio automático de tamanhos esgotados e aviso de últimas unidades
- Personalização com nome e número
- Aba **Sob encomenda**: camisas do catálogo do fornecedor sem estoque na loja (coluna `encomenda` = SIM na planilha), todos os tamanhos disponíveis, prazo informado antes da compra e pagamento só por Pix; o vendedor vê o link do álbum do fornecedor no pedido
- **Cadastro em lote** de camisas sob encomenda: o vendedor escolhe várias fotos do catálogo do fornecedor e a IA cadastra uma por uma (as duvidosas entram escondidas para conferir)
- **Peça a sua**: o cliente manda a imagem da camisa que não achou; a solicitação aparece no painel do vendedor (aba Solicitações) com atalho para responder no WhatsApp
- Frete calculado pelo CEP (API ViaCEP) com tabela por região, frete grátis acima de um valor e opção de retirada
- Checkout com Pix (QR Code e copia e cola gerados no padrão BR Code do Banco Central) ou pagamento na entrega/retirada
- Pedidos salvos na planilha por uma API em Google Apps Script, com baixa automática de estoque, preços recalculados no servidor e trava contra venda simultânea da mesma peça
- Área do vendedor com senha: lista de pedidos, busca, filtros, mudança de status e devolução ao estoque no cancelamento
- Cadastro de camisa por foto: a IA (Google Gemini, plano gratuito, com busca no Google) identifica time, temporada, tipo, cores e escreve a descrição; o vendedor confere, completa preço e estoque e a camisa vai direto para a planilha, com a foto salva no Google Drive
- **Google Sheets como banco de dados:** o vendedor atualiza camisas, preços e estoque pela planilha (inclusive pelo celular) e o site atualiza sozinho
- Layout responsivo para celular

## Tecnologias

HTML, CSS e JavaScript puro (sem frameworks) · Google Sheets + Google Apps Script (API) · Google Gemini (IA) · Pix BR Code · API ViaCEP · GitHub Pages

## Estrutura

```
index.html          página da loja
vendedor.html       área do vendedor (pedidos)
css/style.css       estilos
js/config.js        configurações: planilha, API, Pix, frete, personalização
js/data.js          leitura da planilha, cálculo de frete e carrinho
js/loja.js          vitrine, detalhe do produto, carrinho, pagamento e envio do pedido
js/vendedor.js      área do vendedor
js/cadastro.js      cadastro de camisa por foto com IA
js/lote.js          cadastro em lote de camisas sob encomenda
js/solicitacoes.js  painel das solicitações "Peça a sua"
js/pedir.js         formulário "Peça a sua" na loja
apps-script/        API de pedidos (Google Apps Script) que roda dentro da planilha
demo/               loja de demonstração (gerada por ferramentas/gerar-demo.py + demo/demo.js)
ferramentas/        scripts de apoio
fotos/              fotos das camisas (nome do arquivo vai na coluna "foto" da planilha)
darua_camisas.xlsx  modelo da planilha de camisas e estoque
```

## Como rodar localmente

O navegador bloqueia a leitura da planilha quando o arquivo é aberto direto (`file://`), então use um servidor local:

```
python3 -m http.server
```

e acesse http://localhost:8000
