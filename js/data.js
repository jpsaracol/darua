/* DA RUA — dados da loja. As camisas e o estoque vêm da planilha do Google;
   os pedidos vão para a planilha pela API (apps-script/Codigo.gs);
   as configurações vêm de js/config.js; o carrinho fica no navegador do cliente. */
const DR = (() => {
  const config = DARUA_CONFIG;
  // a demonstração fica no mesmo endereço (/darua/demo/), então guarda tudo com outro prefixo
  const PREFIXO = config.demo ? 'darua_demo_' : 'darua_';
  const CART_KEY = PREFIXO + 'carrinho_v1';
  const CACHE_KEY = PREFIXO + 'catalogo_cache_v1';

  const TAMANHOS = ['P', 'M', 'G', 'GG', 'XGG'];
  const CATEGORIAS = ['Brasileirão', 'Sul-Americano', 'Europeu', 'Seleções', 'Retrô'];

  const UF_REGIAO = {
    RS: 'Sul', SC: 'Sul', PR: 'Sul',
    SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
    DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
    BA: 'Nordeste', SE: 'Nordeste', AL: 'Nordeste', PE: 'Nordeste', PB: 'Nordeste',
    RN: 'Nordeste', CE: 'Nordeste', PI: 'Nordeste', MA: 'Nordeste',
    AM: 'Norte', PA: 'Norte', AC: 'Norte', RO: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte'
  };

  // ---------- utilidades ----------
  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const emPromo = p => p.precoPromo > 0 && p.precoPromo < p.preco;
  const precoFinal = p => (emPromo(p) ? p.precoPromo : p.preco);
  const totalEstoque = p => TAMANHOS.reduce((s, t) => s + (p.estoque[t] || 0), 0);
  // sob encomenda não tem estoque na loja: todos os tamanhos ficam disponíveis
  const MAX_ENCOMENDA = 10;
  const estoqueDe = (p, t) => (p.encomenda ? MAX_ENCOMENDA : (p.estoque[t] || 0));
  const temEstoque = p => p.encomenda || totalEstoque(p) > 0;
  const prazoEncomenda = () => (config.encomenda && config.encomenda.prazo) || '20 a 35';

  // Camisa desenhada em SVG, usada quando o produto ainda não tem foto.
  // padrao: 'lisa', 'listras' (verticais), 'aros' (horizontais), 'faixa' (diagonal) ou 'metade'
  function camisaSVG(c1 = '#111111', c2 = '#ffffff', padrao = 'lisa') {
    if (padrao === true) padrao = 'listras';
    if (!padrao) padrao = 'lisa';
    const corpo = 'M150 62 C130 66 112 72 98 80 L44 128 L78 190 L118 166 L120 330 C120 340 128 346 138 346 L262 346 C272 346 280 340 280 330 L282 166 L322 190 L356 128 L302 80 C288 72 270 66 250 62 Q200 104 150 62Z';
    let desenho = '';
    if (padrao === 'listras') for (let x = 60; x < 360; x += 44) desenho += `<rect x='${x}' y='40' width='22' height='320' fill='${c2}'/>`;
    if (padrao === 'aros') for (let y = 96; y < 350; y += 46) desenho += `<rect x='30' y='${y}' width='340' height='23' fill='${c2}'/>`;
    if (padrao === 'faixa') desenho = `<path d='M96 84 L150 66 L304 346 L246 346Z' fill='${c2}'/>`;
    if (padrao === 'metade') desenho = `<rect x='200' y='40' width='170' height='320' fill='${c2}'/>`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
      <defs>
        <radialGradient id='bg' cx='50%' cy='42%' r='70%'><stop offset='0' stop-color='#fafaf8'/><stop offset='1' stop-color='#e6e6e1'/></radialGradient>
        <linearGradient id='luz' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='.22'/><stop offset='.45' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.16'/></linearGradient>
        <linearGradient id='base' y1='0' y2='1' x1='0' x2='0'><stop offset='.6' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.12'/></linearGradient>
        <pattern id='trama' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='1.2' height='5' fill='#000' fill-opacity='.045'/></pattern>
        <clipPath id='c'><path d='${corpo}'/></clipPath>
        <filter id='sombra' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='7'/></filter>
      </defs>
      <rect width='400' height='400' fill='url(#bg)'/>
      <ellipse cx='200' cy='356' rx='118' ry='9' fill='#000' opacity='.16' filter='url(#sombra)'/>
      <path d='${corpo}' fill='${c1}'/>
      <g clip-path='url(#c)'>
        ${desenho}
        <path d='M44 128 L78 190 L84 177 L50 115Z M356 128 L322 190 L316 177 L350 115Z' fill='${c2}'/>
        <rect width='400' height='400' fill='url(#trama)'/>
        <path d='M150 210 C160 260 156 300 150 346 M262 190 C252 240 258 290 254 346' stroke='#000' stroke-opacity='.07' stroke-width='6' fill='none'/>
        <rect width='400' height='400' fill='url(#luz)'/>
        <rect width='400' height='400' fill='url(#base)'/>
      </g>
      <path d='M150 62 Q200 106 250 62 L240 56 Q200 92 160 56Z' fill='${c2}'/>
      <path d='M160 56 Q200 70 240 56' stroke='#000' stroke-opacity='.25' stroke-width='3' fill='none'/>
      <circle cx='244' cy='132' r='13' fill='${c2}' stroke='#000' stroke-opacity='.18' stroke-width='2'/>
      <path d='M150 128 l8 7 l8 -7' stroke='${c2}' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
      <path d='${corpo}' fill='none' stroke='#000' stroke-opacity='.2' stroke-width='2.5'/>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function imagemDe(p) {
    if (!p.foto) return camisaSVG(p.cores[0], p.cores[1], p.padrao);
    return /^(https?:\/\/|data:)/i.test(p.foto) ? p.foto : 'fotos/' + p.foto;
  }

  // ---------- leitura da planilha ----------
  // CSV com aspas (o Google coloca "249,90" e descrições com vírgula entre aspas)
  function lerCSV(texto) {
    const linhas = [];
    let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  // aceita "249,90", "1.249,90", "R$ 249,90" e "249.90"
  function numero(v) {
    let s = String(v || '').replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s) || 0;
  }
  const sim = v => normalizar(v) === 'sim';

  function paraProdutos(texto) {
    const [cab, ...linhas] = lerCSV(texto);
    const col = Object.fromEntries(cab.map((nome, i) => [nome.trim(), i]));
    if (col.id === undefined || col.nome === undefined) throw new Error('Planilha sem as colunas "id" e "nome" na linha 1.');
    const v = (l, nome) => (l[col[nome]] ?? '').trim();

    return linhas
      .filter(l => v(l, 'id') && v(l, 'nome'))
      .map((l, ordem) => ({
        id: v(l, 'id'),
        nome: v(l, 'nome'),
        time: v(l, 'time'),
        categoria: v(l, 'categoria'),
        temporada: v(l, 'temporada'),
        tipo: v(l, 'tipo') || 'Torcedor',
        preco: numero(v(l, 'preco')),
        precoPromo: numero(v(l, 'preco_promo')),
        foto: v(l, 'foto'),
        cores: [v(l, 'cor1') || '#111111', v(l, 'cor2') || '#ffffff'],
        listras: sim(v(l, 'listras')),
        // coluna "listras": SIM = listras verticais; também aceita FAIXA, AROS ou METADE
        padrao: ({ sim: 'listras', faixa: 'faixa', aros: 'aros', metade: 'metade' })[normalizar(v(l, 'listras'))] || 'lisa',
        descricao: v(l, 'descricao'),
        estoque: Object.fromEntries(TAMANHOS.map(t => [t, Math.max(0, parseInt(v(l, t), 10) || 0)])),
        ativo: v(l, 'ativo') === '' || sim(v(l, 'ativo')),
        destaque: sim(v(l, 'destaque')),
        encomenda: sim(v(l, 'encomenda')),
        ordem
      }));
  }

  // Busca a planilha atualizada; guarda uma cópia para abrir rápido na próxima visita
  async function carregarCatalogo() {
    const url = config.planilha + (config.planilha.includes('?') ? '&' : '?') + 't=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Não foi possível carregar a planilha.');
    const produtos = paraProdutos(await r.text());
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(produtos)); } catch (e) { }
    return produtos;
  }
  function catalogoEmCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch (e) { return null; }
  }

  // ---------- carrinho ----------
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
  }
  function saveCart(c) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { }
  }

  // ---------- pedidos feitos neste aparelho (para "Meus pedidos") ----------
  const PEDIDOS_KEY = PREFIXO + 'meus_pedidos_v1';
  function meusPedidos() {
    try { return JSON.parse(localStorage.getItem(PEDIDOS_KEY)) || []; } catch (e) { return []; }
  }
  function guardarPedido(numero, telefone) {
    const lista = meusPedidos().filter(p => Number(p.numero) !== Number(numero));
    lista.unshift({ numero: Number(numero), telefone });
    try { localStorage.setItem(PEDIDOS_KEY, JSON.stringify(lista.slice(0, 20))); } catch (e) { }
  }

  // ---------- frete ----------
  async function buscarCEP(cep) {
    const d = String(cep).replace(/\D/g, '');
    if (d.length !== 8) throw new Error('CEP deve ter 8 números.');
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) throw new Error('Não foi possível consultar o CEP.');
    const j = await r.json();
    if (j.erro) throw new Error('CEP não encontrado.');
    return j; // { cep, logradouro, bairro, localidade, uf, ... }
  }

  function opcoesFrete(end, subtotal, qtdItens) {
    const cfg = config;
    const ops = [];
    if (end) {
      const local = normalizar(end.localidade) === normalizar(cfg.cidadeOrigem) && end.uf === cfg.ufOrigem;
      const regiao = local ? 'local' : UF_REGIAO[end.uf];
      const tab = cfg.frete[regiao];
      if (tab) {
        const gratis = cfg.freteGratisAcima > 0 && subtotal >= cfg.freteGratisAcima;
        const valor = gratis ? 0 : tab.valor + Math.max(0, qtdItens - 1) * cfg.adicionalPorItem;
        ops.push({
          id: 'entrega',
          titulo: local ? 'Entrega local' : `Entrega — ${regiao}`,
          prazo: `${tab.prazo} dias úteis`,
          valor, gratis, local
        });
      }
    }
    if (cfg.retirada) ops.push({ id: 'retirada', titulo: 'Retirar com o vendedor', prazo: cfg.enderecoRetirada, valor: 0 });
    return ops;
  }

  // ---------- API de pedidos (Google Apps Script) ----------
  // Sem cabeçalho Content-Type o navegador manda text/plain, o que o Apps Script aceita sem bloqueio de CORS
  async function api(acao, dados = {}) {
    if (!config.api) throw new Error('A loja ainda não configurou o recebimento de pedidos.');
    const r = await fetch(config.api, { method: 'POST', body: JSON.stringify({ acao, ...dados }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  }

  // ---------- Pix "copia e cola" (padrão BR Code do Banco Central) ----------
  function crc16(s) {
    let crc = 0xFFFF;
    for (const b of new TextEncoder().encode(s)) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function pixPayload(valor, txid) {
    const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
    const limpo = (s, n) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);
    const p = campo('00', '01') +
      campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', config.pix.chave.trim())) +
      campo('52', '0000') + campo('53', '986') +
      campo('54', Number(valor).toFixed(2)) +
      campo('58', 'BR') + campo('59', limpo(config.pix.nome, 25)) + campo('60', limpo(config.pix.cidade, 15)) +
      campo('62', campo('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) +
      '6304';
    return p + crc16(p);
  }

  return {
    TAMANHOS, CATEGORIAS, config, api, pixPayload, meusPedidos, guardarPedido,
    brl, esc, normalizar, emPromo, precoFinal, totalEstoque, estoqueDe, temEstoque, prazoEncomenda, camisaSVG, imagemDe,
    paraProdutos, carregarCatalogo, catalogoEmCache, loadCart, saveCart, buscarCEP, opcoesFrete
  };
})();
