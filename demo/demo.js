/* DA RUA — modo demonstração (portfólio).
   Substitui a planilha e a API do Google por dados guardados no navegador de quem está testando:
   nenhum pedido chega à loja real e nada é cobrado. Carregado depois de js/data.js. */
(() => {
  const ESTADO_KEY = 'darua_demo_estado_v1';
  const SENHA_DEMO = 'demo123';
  const espera = ms => new Promise(r => setTimeout(r, ms));

  const desc = (time, extra) => `Camisa ${time} com ${extra}. Ilustração do modelo; na loja real entra a foto da peça.`;
  const BASE = [
    ['gremio-2026-home', 'Grêmio 2026 Home', 'Grêmio', 'Brasileirão', '2026', 'Torcedor', 279.9, 0, '#0d80bf', '#111111', 'listras', 'listras tricolores em azul, preto e branco', [3, 6, 5, 2, 1], true],
    ['inter-2026-home', 'Internacional 2026 Home', 'Internacional', 'Brasileirão', '2026', 'Torcedor', 279.9, 249.9, '#d10a11', '#ffffff', 'lisa', 'vermelho tradicional e detalhes brancos na gola e nas mangas', [2, 5, 6, 3, 0], true],
    ['brasil-2026-home', 'Brasil 2026 Home', 'Seleção Brasileira', 'Seleções', '2026', 'Torcedor', 329.9, 0, '#ffd700', '#009c3b', 'lisa', 'o amarelo clássico e acabamento verde, temporada de Copa do Mundo', [4, 8, 8, 5, 2], true],
    ['flamengo-2026-home', 'Flamengo 2026 Home', 'Flamengo', 'Brasileirão', '2026', 'Torcedor', 299.9, 0, '#c4161c', '#111111', 'aros', 'faixas horizontais rubro-negras', [0, 4, 6, 3, 1], true],
    ['vasco-2026-away', 'Vasco 2026 Away', 'Vasco da Gama', 'Brasileirão', '2026', 'Torcedor', 279.9, 0, '#ffffff', '#111111', 'faixa', 'a tradicional faixa diagonal preta sobre o branco', [1, 3, 2, 1, 0], false],
    ['palmeiras-2026-home', 'Palmeiras 2026 Home', 'Palmeiras', 'Brasileirão', '2026', 'Torcedor', 299.9, 0, '#006437', '#ffffff', 'lisa', 'verde intenso e gola branca', [2, 5, 5, 2, 1], false],
    ['barcelona-26-home', 'Barcelona 26/27 Home', 'Barcelona', 'Europeu', '26/27', 'Torcedor', 349.9, 0, '#1b2a6b', '#a50044', 'listras', 'listras azul-grená', [2, 4, 4, 2, 0], true],
    ['celtic-26-home', 'Celtic 26/27 Home', 'Celtic', 'Europeu', '26/27', 'Torcedor', 329.9, 0, '#ffffff', '#00843d', 'aros', 'os aros horizontais verdes e brancos', [1, 2, 3, 1, 0], false],
    ['argentina-2026-home', 'Argentina 2026 Home', 'Seleção Argentina', 'Seleções', '2026', 'Torcedor', 329.9, 299.9, '#75aadb', '#ffffff', 'listras', 'listras celestes e brancas', [2, 3, 4, 2, 1], false],
    ['portugal-2026-home', 'Portugal 2026 Home', 'Seleção Portuguesa', 'Seleções', '2026', 'Torcedor', 329.9, 0, '#b40d1e', '#046a38', 'metade', 'vermelho e verde divididos ao meio', [1, 2, 2, 1, 0], false],
    ['gremio-1983-retro', 'Grêmio 1983 Retrô', 'Grêmio', 'Retrô', '1983', 'Retrô', 259.9, 0, '#0d80bf', '#111111', 'listras', 'o visual da temporada do título mundial de 1983', [0, 2, 3, 1, 0], true],
    ['brasil-1970-retro', 'Brasil 1970 Retrô', 'Seleção Brasileira', 'Retrô', '1970', 'Retrô', 259.9, 0, '#ffd700', '#009c3b', 'lisa', 'gola redonda verde no estilo dos anos 70', [1, 3, 3, 2, 1], false]
  ].map(([id, nome, time, categoria, temporada, tipo, preco, precoPromo, c1, c2, padrao, extra, est, destaque], ordem) => ({
    id, nome, time, categoria, temporada, tipo, preco, precoPromo, foto: '', cores: [c1, c2],
    listras: padrao === 'listras', padrao, descricao: desc(time, extra),
    estoque: Object.fromEntries(DR.TAMANHOS.map((t, i) => [t, est[i]])), ativo: true, destaque, ordem
  }));

  // ---------------- estado no navegador ----------------
  function pedidosExemplo() {
    const h = horas => new Date(Date.now() - horas * 3600 * 1000).toISOString();
    const item = (id, t, qtd, perso) => {
      const p = BASE.find(x => x.id === id);
      return { id, nome: p.nome, t, qtd, unit: DR.precoFinal(p) + (perso ? DR.config.personalizacaoPreco : 0), perso: perso || null };
    };
    const pedido = (numero, horas, status, pagamento, cliente, cidade, uf, itens, freteTipo, freteValor) => {
      const subtotal = itens.reduce((s, i) => s + i.unit * i.qtd, 0);
      return {
        numero, data: h(horas), status, pagamento, cliente, telefone: '(54) 99999-00' + String(numero).slice(-2), email: '',
        itens: itens.map(i => `${i.qtd}x ${i.nome} (${i.t})`).join('; '), subtotal, frete_tipo: freteTipo, frete_valor: freteValor,
        total: subtotal + freteValor, cep: '', endereco: freteValor ? 'Rua de Exemplo, 100' : '', cidade, uf, itens_json: itens
      };
    };
    return [
      pedido(1001, 70, 'Entregue', 'Pix', 'Ana (exemplo)', 'Porto Alegre', 'RS', [item('gremio-2026-home', 'M', 1)], 'Entrega — Sul', 22),
      pedido(1002, 30, 'Enviado', 'Pix', 'Bruno (exemplo)', 'Caxias do Sul', 'RS', [item('brasil-2026-home', 'G', 1, { nome: 'BRUNO', num: '10' })], 'Entrega — Sul', 22),
      pedido(1003, 5, 'Pago', 'Na entrega', 'Carla (exemplo)', '', '', [item('inter-2026-home', 'P', 1), item('argentina-2026-home', 'M', 1)], 'Retirar com o vendedor', 0),
      pedido(1004, 1, 'Aguardando Pix', 'Pix', 'Diego (exemplo)', 'São Paulo', 'SP', [item('barcelona-26-home', 'GG', 1)], 'Entrega — Sudeste', 28)
    ];
  }

  function ler() {
    try {
      const e = JSON.parse(localStorage.getItem(ESTADO_KEY));
      if (e && e.estoque) return e;
    } catch (er) { }
    const novo = {
      estoque: Object.fromEntries(BASE.map(p => [p.id, { ...p.estoque }])),
      extras: [],
      pedidos: pedidosExemplo()
    };
    salvar(novo);
    return novo;
  }
  function salvar(e) {
    try { localStorage.setItem(ESTADO_KEY, JSON.stringify(e)); } catch (er) { }
  }

  function catalogo(e) {
    const base = BASE.map(p => ({ ...p, estoque: { ...(e.estoque[p.id] || p.estoque) } }));
    return base.concat(e.extras.map((p, i) => ({ ...p, ordem: BASE.length + i })));
  }

  function movimentar(e, itens, sinal) {
    itens.forEach(it => {
      const extra = e.extras.find(p => p.id === it.id);
      const est = extra ? extra.estoque : e.estoque[it.id];
      if (est) est[it.t] = Math.max(0, (est[it.t] || 0) + sinal * it.qtd);
    });
  }

  function cancelarPixVencidos(e) {
    const limite = Date.now() - DR.config.pixPrazoHoras * 3600 * 1000;
    e.pedidos.forEach(p => {
      if (p.status === 'Aguardando Pix' && new Date(p.data).getTime() < limite) {
        movimentar(e, p.itens_json, +1);
        p.status = 'Cancelado';
      }
    });
  }

  const slug = s => DR.normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

  // ---------------- API de mentira (mesmas respostas do Apps Script) ----------------
  const rotas = {
    pedido(req) {
      const e = ler();
      cancelarPixVencidos(e);
      const prods = catalogo(e);
      const itens = req.itens.map(it => {
        const p = prods.find(x => x.id === it.id);
        if (!p) throw new Error('Uma camisa do carrinho não existe mais. Atualize a página.');
        if ((p.estoque[it.t] || 0) < it.qtd) throw new Error(`Estoque insuficiente: ${p.nome} tamanho ${it.t}.`);
        const unit = DR.precoFinal(p) + (it.perso ? DR.config.personalizacaoPreco : 0);
        return { id: p.id, nome: p.nome, t: it.t, qtd: it.qtd, unit, perso: it.perso || null };
      });
      movimentar(e, itens, -1);
      const subtotal = itens.reduce((s, i) => s + i.unit * i.qtd, 0);
      const freteValor = Number(req.frete.valor) || 0;
      const numero = Math.max(1000, ...e.pedidos.map(p => p.numero)) + 1;
      e.pedidos.push({
        numero, data: new Date().toISOString(), status: req.pagamento === 'pix' ? 'Aguardando Pix' : 'Novo',
        pagamento: req.pagamento === 'pix' ? 'Pix' : 'Na entrega', cliente: req.cliente.nome, telefone: req.cliente.telefone, email: '',
        itens: itens.map(i => `${i.qtd}x ${i.nome} (${i.t})`).join('; '), subtotal,
        frete_tipo: req.frete.tipo, frete_valor: freteValor, total: subtotal + freteValor,
        cep: req.frete.cep, endereco: req.frete.endereco, cidade: req.frete.cidade, uf: req.frete.uf, itens_json: itens
      });
      salvar(e);
      return { ok: true, numero, total: subtotal + freteValor };
    },

    acompanhar(req) {
      const e = ler();
      cancelarPixVencidos(e);
      salvar(e);
      const fim = t => String(t || '').replace(/\D/g, '').slice(-8);
      const pedidos = (req.consultas || []).map(q => e.pedidos.find(p => p.numero === Number(q.numero) && fim(p.telefone) === fim(q.telefone)))
        .filter(Boolean).map(p => ({ ...p, itens: p.itens_json }));
      if ((req.consultas || []).length === 1 && !pedidos.length) throw new Error('Pedido não encontrado. Confira o número e o WhatsApp usados na compra.');
      return { ok: true, pedidos };
    },

    listar(req) {
      if (req.senha !== SENHA_DEMO) throw new Error(`Senha incorreta. Nesta demonstração a senha é ${SENHA_DEMO}.`);
      const e = ler();
      cancelarPixVencidos(e);
      salvar(e);
      return { ok: true, pedidos: e.pedidos.slice().reverse() };
    },

    status(req) {
      if (req.senha !== SENHA_DEMO) throw new Error('Senha incorreta.');
      const e = ler();
      const p = e.pedidos.find(x => x.numero === Number(req.numero));
      if (!p) throw new Error('Pedido não encontrado.');
      if (req.status === 'Cancelado' && p.status !== 'Cancelado') movimentar(e, p.itens_json, +1);
      if (p.status === 'Cancelado' && req.status !== 'Cancelado') movimentar(e, p.itens_json, -1);
      p.status = req.status;
      salvar(e);
      return { ok: true };
    },

    // Na loja real a IA (Gemini) analisa a foto. Na demo não há servidor, então devolve um exemplo e avisa.
    async identificar(req) {
      if (req.senha !== SENHA_DEMO) throw new Error('Senha incorreta.');
      await espera(2500);
      return {
        ok: true,
        camisa: {
          nome: 'Botafogo 2026 Home', time: 'Botafogo', temporada: '2026', categoria: 'Brasileirão', tipo: 'Torcedor',
          cor1: '#111111', cor2: '#ffffff', listras: 'SIM',
          descricao: 'Camisa Botafogo com listras verticais pretas e brancas e gola redonda. Temporada 2026.'
        },
        confianca: 'alta',
        demo: true,
        observacao: 'Demonstração: na loja real, a IA analisa a sua foto e preenche os dados dela. Aqui o resultado é sempre este exemplo.'
      };
    },

    cadastrar(req) {
      if (req.senha !== SENHA_DEMO) throw new Error('Senha incorreta.');
      const c = req.camisa;
      const e = ler();
      const usados = new Set(catalogo(e).map(p => p.id));
      let id = slug(c.nome) || 'camisa', n = 2;
      while (usados.has(id)) id = slug(c.nome) + '-' + n++;
      const num = v => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
      e.extras.push({
        id, nome: c.nome, time: c.time, categoria: c.categoria, temporada: c.temporada, tipo: c.tipo || 'Torcedor',
        preco: num(c.preco), precoPromo: num(c.preco_promo),
        foto: req.foto ? `data:${req.mime || 'image/jpeg'};base64,${req.foto}` : '',
        cores: [c.cor1 || '#111111', c.cor2 || '#ffffff'], listras: c.listras === 'SIM', padrao: c.listras === 'SIM' ? 'listras' : 'lisa',
        descricao: c.descricao, estoque: Object.fromEntries(DR.TAMANHOS.map(t => [t, parseInt(c[t], 10) || 0])),
        ativo: c.ativo !== 'NAO', destaque: c.destaque === 'SIM'
      });
      salvar(e);
      return { ok: true, id };
    }
  };

  DR.api = async (acao, dados = {}) => {
    await espera(400);   // simula a ida ao servidor
    if (!rotas[acao]) throw new Error('Ação inválida.');
    return rotas[acao](dados);
  };
  DR.carregarCatalogo = async () => catalogo(ler());
  DR.catalogoEmCache = () => catalogo(ler());
  DR.recomecarDemo = () => {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('darua_demo_')).forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem('darua_demo_vendedor');
    } catch (er) { }
    location.reload();
  };

  // ---------------- faixa "loja de demonstração" ----------------
  const naAreaVendedor = /vendedor\.html/.test(location.pathname);
  const faixa = document.createElement('div');
  faixa.className = 'demo-faixa';
  faixa.innerHTML = naAreaVendedor
    ? `<b>Demonstração</b> · senha da área do vendedor: <code>${SENHA_DEMO}</code> · <a href="index.html">ver a loja</a> · <button type="button" id="demoRecomecar">recomeçar demo</button>`
    : `<b>Loja de demonstração</b> · os pedidos não são reais e nada é cobrado · <a href="vendedor.html">área do vendedor</a> (senha <code>${SENHA_DEMO}</code>)`;
  document.body.prepend(faixa);
  const dicaCadastro = document.querySelector('#formCamisa .dica');
  if (dicaCadastro) dicaCadastro.textContent = 'Na demonstração, a camisa aparece na loja na hora (só no seu navegador).';
  const rec = document.getElementById('demoRecomecar');
  if (rec) rec.onclick = DR.recomecarDemo;
})();
