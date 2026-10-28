# DA RUA — Loja de camisas de time

Loja virtual de camisas de time com catálogo, controle de estoque por tamanho, cálculo de frete por CEP e finalização de pedidos pelo WhatsApp.

**Site:** https://jpsaracol.github.io/darua/

## Funcionalidades

- Catálogo com filtros por categoria (Brasileirão, Europeu, Seleções, Retrô), tamanho, busca e ordenação
- Estoque por tamanho (P ao XGG) com bloqueio automático de tamanhos esgotados e aviso de últimas unidades
- Personalização com nome e número
- Frete calculado pelo CEP (API ViaCEP) com tabela por região, frete grátis acima de um valor e opção de retirada
- Carrinho salvo no navegador e pedido enviado pronto para o WhatsApp do vendedor
- **Google Sheets como banco de dados:** o vendedor atualiza camisas, preços e estoque pela planilha (inclusive pelo celular) e o site atualiza sozinho
- Layout responsivo para celular

## Tecnologias

HTML, CSS e JavaScript puro (sem frameworks) · Google Sheets (CSV publicado) · API ViaCEP · GitHub Pages

## Estrutura

```
index.html          página da loja
css/style.css       estilos
js/config.js        configurações: link da planilha, WhatsApp, frete, personalização
js/data.js          leitura da planilha, cálculo de frete e carrinho
js/loja.js          vitrine, detalhe do produto, carrinho e finalização
fotos/              fotos das camisas (nome do arquivo vai na coluna "foto" da planilha)
darua_camisas.xlsx  modelo da planilha de camisas e estoque
```

## Como rodar localmente

O navegador bloqueia a leitura da planilha quando o arquivo é aberto direto (`file://`), então use um servidor local:

```
python3 -m http.server
```

e acesse http://localhost:8000
