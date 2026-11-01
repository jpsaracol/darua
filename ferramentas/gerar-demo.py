#!/usr/bin/env python3
"""Gera a loja de demonstração (pasta demo/) a partir da loja real.

Rode depois de mudar index.html, vendedor.html, politicas.html ou js/config.js:
    python3 ferramentas/gerar-demo.py

As páginas da demo usam o mesmo CSS e JS da loja (../css, ../js), com duas diferenças:
  - demo/config.js: sem planilha, sem API, Pix e WhatsApp de mentira;
  - demo/demo.js (escrito à mão): troca a planilha e a API por dados no navegador de quem testa.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DEMO = RAIZ / 'demo'
PAGINAS = ['index.html', 'vendedor.html', 'politicas.html']
VERSAO = __import__('time').strftime('%Y%m%d%H%M')   # evita que o navegador use um demo.js antigo


def gerar_config():
    s = (RAIZ / 'js/config.js').read_text(encoding='utf-8')
    s = re.sub(r'^/\*.*?\*/', '/* DA RUA — configurações da LOJA DE DEMONSTRAÇÃO. Gerado por ferramentas/gerar-demo.py a partir\n'
               '   de js/config.js: não edite aqui. Os pedidos ficam só no navegador de quem testa (demo/demo.js). */', s, count=1, flags=re.S)
    s = s.replace('const DARUA_CONFIG = {', 'const DARUA_CONFIG = {\n  demo: true,', 1)
    trocas = {
        r"planilha: '[^']*'": "planilha: ''",
        r"api: '[^']*'": "api: ''",
        r"chave: '[^']*'": "chave: 'demonstracao@exemplo.com'",
        r"whatsapp: '[^']*'": "whatsapp: ''",
        r"enderecoRetirada: '[^']*'": "enderecoRetirada: 'Combinar local (demonstração)'",
    }
    for de, para in trocas.items():
        s = re.sub(de, para, s)
    # dados da empresa: na demo não aparece nada da loja real
    s = re.sub(r'empresa: \{.*?\n  \}', "empresa: {\n    nome: 'DA RUA — loja de demonstração (portfólio)',\n"
               "    documento: '',\n    endereco: '',\n    email: ''\n  }", s, flags=re.S)
    (DEMO / 'config.js').write_text(s, encoding='utf-8')


def gerar_pagina(nome):
    s = (RAIZ / nome).read_text(encoding='utf-8')
    s = re.sub(r'(href|src)="(css/|js/|logodarua\.png)', r'\1="../\2', s)
    s = re.sub(r'src="\.\./js/config\.js(\?v=\d+)?"', r'src="config.js\1"', s)
    # demo.js entra logo depois de data.js, antes da loja/área do vendedor
    # (a página de políticas não usa data.js, então fica sem demo.js)
    s = re.sub(r'(<script src="\.\./js/data\.js[^"]*"></script>)', r'\1\n  <script src="demo.js?v=' + VERSAO + '"></script>', s)
    s = re.sub(r'<title>(.*?)</title>', r'<title>\1 (demonstração)</title>', s, count=1)
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex">', 1)
    s = s.replace('<!doctype html>', '<!doctype html>\n<!-- Gerado por ferramentas/gerar-demo.py a partir de ../' + nome + ': não edite aqui. -->', 1)
    (DEMO / nome).write_text(s, encoding='utf-8')


if __name__ == '__main__':
    DEMO.mkdir(exist_ok=True)
    gerar_config()
    for p in PAGINAS:
        gerar_pagina(p)
    print('Demo gerada em', DEMO)
