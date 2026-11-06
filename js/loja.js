/* DA RUA — vitrine, carrinho, frete, pagamento (Pix ou na entrega) e envio do pedido */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const { TAMANHOS, CATEGORIAS, brl, esc } = DR;

  const filtro = { modo: 'pronta', cat: 'Todas', tam: '', busca: '', ordem: 'destaque' };   // modo: 'pronta' ou 'encomenda'
  let carrinho = DR.loadCart();
  let endereco = null;   // resposta do ViaCEP
  let freteId = null;
  let pedidoFeito = null;
  let cliNome = '', cliTel = '', cliRua = '';   // mantém o que o cliente digitou entre redesenhos
  let pagamento = 'pix';
  let enviando = false;
  let preenchidoDaConta = false;   // dados da conta entram no carrinho uma vez por compra

  let catalogo = [];   // vem da planilha do Google
  const db = () => ({ produtos: catalogo, config: DR.config });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 2800);
  }

  function precoHTML(p) {
    const final = DR.precoFinal(p);
    const parc = DR.config.parcelasSemJuros || 0;   // só mostra parcelamento se a loja aceitar cartão parcelado
    return `${DR.emPromo(p) ? `<s>${brl(p.preco)}</s>` : ''}<b>${brl(final)}</b>
      ${parc > 1 ? `<span class="parcela">ou ${parc}x de ${brl(final / parc)} sem juros</span>` : ''}`;
  }

  // quanto ainda dá para colocar no carrinho daquele tamanho
  function disponivel(p, t) {
    const noCarrinho = carrinho.filter(i => i.id === p.id && i.t === t).reduce((s, i) => s + i.qtd, 0);
    return DR.estoqueDe(p, t) - noCarrinho;
  }

  // ---------------- catálogo ----------------
  function montarFiltros() {
    // a aba "Sob encomenda" só aparece quando a planilha tem alguma camisa marcada como encomenda
    const temEncomenda = db().produtos.some(p => p.ativo && p.encomenda);
    if (!temEncomenda) filtro.modo = 'pronta';
    $('#abasLoja').hidden = !temEncomenda;
    $('#abasLoja').querySelectorAll('[data-modo]').forEach(b => {
      const on = b.dataset.modo === filtro.modo;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    $('#avisoEncomenda').hidden = filtro.modo !== 'encomenda';
    $('#prazoEncomendaTxt').textContent = DR.prazoEncomenda();
    $('#filtroTamanho').hidden = filtro.modo === 'encomenda';   // na encomenda todos os tamanhos estão disponíveis
    $('#filtroCategoria').innerHTML = ['Todas', ...CATEGORIAS]
      .map(c => `<button class="chip${c === filtro.cat ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('');
    $('#filtroTamanho').innerHTML = '<option value="">Todos os tamanhos</option>' +
      TAMANHOS.map(t => `<option value="${t}">Tamanho ${t}</option>`).join('');
  }

  function renderFaixa() {
    const cfg = db().config;
    const partes = [];
    if (cfg.freteGratisAcima > 0) partes.push(`Frete grátis acima de ${brl(cfg.freteGratisAcima)}`);
    partes.push('Envio para todo o Brasil');
    if (cfg.personalizacaoAtiva) partes.push('Personalize com nome e número');
    $('#faixa').textContent = partes.join('  ·  ');
  }

  function renderGrade() {
    const termo = DR.normalizar(filtro.busca);
    const ordens = {
      destaque: (a, b) => ((b.destaque ? 1 : 0) - (a.destaque ? 1 : 0)) || a.ordem - b.ordem,
      menor: (a, b) => DR.precoFinal(a) - DR.precoFinal(b),
      maior: (a, b) => DR.precoFinal(b) - DR.precoFinal(a),
      novos: (a, b) => b.ordem - a.ordem   // linhas mais abaixo na planilha = mais novas
    };
    const lista = db().produtos
      .filter(p => p.ativo)
      .filter(p => (filtro.modo === 'encomenda') === p.encomenda)
      .filter(p => filtro.cat === 'Todas' || p.categoria === filtro.cat)
      .filter(p => !filtro.tam || p.encomenda || (p.estoque[filtro.tam] || 0) > 0)
      .filter(p => !termo || DR.normalizar(`${p.nome} ${p.time} ${p.temporada} ${p.categoria}`).includes(termo))
      .sort((a, b) => (DR.temEstoque(b) - DR.temEstoque(a)) || ordens[filtro.ordem](a, b));

    $('#grade').innerHTML = lista.map(p => {
      const total = DR.totalEstoque(p);
      let selo = '';
      if (p.encomenda) selo = DR.emPromo(p) ? '<span class="selo promo">Promo</span>' : '<span class="selo encomenda">Encomenda</span>';
      else if (total === 0) selo = '<span class="selo esgotado">Esgotado</span>';
      else if (DR.emPromo(p)) selo = '<span class="selo promo">Promo</span>';
      else if (total <= 5) selo = '<span class="selo ultimas">Últimas unidades</span>';
      return `<button class="card${DR.temEstoque(p) ? '' : ' off'}" data-id="${p.id}">
        ${selo}
        <img src="${DR.imagemDe(p)}" alt="${esc(p.nome)}" loading="lazy">
        <div class="card-info">
          <div class="card-time">${esc(p.time)}</div>
          <div class="card-nome">${esc(p.nome)}</div>
          <div class="preco">${precoHTML(p)}</div>
        </div>
      </button>`;
    }).join('');
    $('#vazio').hidden = lista.length > 0;
  }

  // ---------------- detalhe do produto ----------------
  function abrirProduto(id) {
    const { produtos, config: cfg } = db();
    const p = produtos.find(x => x.id === id);
    if (!p) return;
    let tam = null, qtd = 1;

    const corpo = $('#produtoCorpo');
    corpo.innerHTML = `
      <div class="mp-img"><img src="${DR.imagemDe(p)}" alt="${esc(p.nome)}"></div>
      <div class="mp-info">
        <span class="mp-cat">${esc(p.categoria)} · ${esc(p.tipo)} · ${esc(p.temporada)}</span>
        <h2>${esc(p.nome)}</h2>
        <div class="preco">${precoHTML(p)}</div>
        <p class="mp-desc">${esc(p.descricao)}</p>
        ${p.encomenda ? `<p class="mp-encomenda"><b>Sob encomenda:</b> chega em ${esc(DR.prazoEncomenda())} dias depois do pagamento, mais o prazo do frete. Pagamento só por Pix.</p>` : ''}
        <div class="rotulo">Tamanho</div>
        <div class="tamanhos">${TAMANHOS.map(t =>
          `<button class="tam" data-t="${t}" ${disponivel(p, t) <= 0 ? 'disabled' : ''}>${t}</button>`).join('')}
        </div>
        <p class="aviso-estoque" id="avisoEstoque"></p>
        ${cfg.personalizacaoAtiva ? `
          <label class="check"><input type="checkbox" id="perso"> Personalizar com nome e número <b>+ ${brl(cfg.personalizacaoPreco)}</b></label>
          <div class="perso-campos" id="persoCampos" hidden>
            <input type="text" id="persoNome" maxlength="12" placeholder="NOME">
            <input type="number" id="persoNum" min="0" max="99" placeholder="Nº">
          </div>` : ''}
        <div class="linha-compra">
          <div class="qtd"><button data-q="-1" aria-label="Menos">−</button><span id="qtdProd">1</span><button data-q="1" aria-label="Mais">+</button></div>
          <button class="btn primario" id="addCarrinho" ${DR.temEstoque(p) ? '' : 'disabled'}>
            ${!DR.temEstoque(p) ? 'Esgotado' : p.encomenda ? 'Encomendar' : 'Adicionar ao carrinho'}
          </button>
        </div>
      </div>`;

    const aviso = $('#avisoEstoque');
    corpo.querySelectorAll('.tam').forEach(b => b.onclick = () => {
      tam = b.dataset.t;
      corpo.querySelectorAll('.tam').forEach(x => x.classList.toggle('on', x === b));
      const d = disponivel(p, tam);
      qtd = Math.min(qtd, d);
      $('#qtdProd').textContent = qtd;
      aviso.textContent = !p.encomenda && d <= cfg.estoqueBaixo ? `Restam só ${d} no tamanho ${tam}!` : '';
    });
    corpo.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      const max = tam ? disponivel(p, tam) : 10;
      qtd = Math.max(1, Math.min(max, qtd + Number(b.dataset.q)));
      $('#qtdProd').textContent = qtd;
    });
    const perso = $('#perso');
    if (perso) perso.onchange = () => { $('#persoCampos').hidden = !perso.checked; };

    $('#addCarrinho').onclick = () => {
      if (!tam) { aviso.textContent = 'Escolha um tamanho.'; return; }
      let pers = null;
      if (perso?.checked) {
        const nome = $('#persoNome').value.trim().toUpperCase();
        const num = $('#persoNum').value.trim();
        if (!nome && !num) { aviso.textContent = 'Preencha o nome e/ou o número da personalização.'; return; }
        if (num && (Number(num) < 0 || Number(num) > 99)) { aviso.textContent = 'Número deve ser de 0 a 99.'; return; }
        pers = { nome, num };
      }
      if (qtd > disponivel(p, tam)) {
        aviso.textContent = p.encomenda ? `Encomenda de até ${DR.estoqueDe(p, tam)} por tamanho. Para mais, fale com a gente.` : 'Quantidade maior que o estoque disponível.';
        return;
      }

      const key = `${p.id}|${tam}|${pers ? pers.nome + '#' + pers.num : ''}`;
      const existente = carrinho.find(i => i.key === key);
      if (existente) existente.qtd += qtd;
      else carrinho.push({ key, id: p.id, t: tam, qtd, perso: pers });
      DR.saveCart(carrinho);
      fecharProduto();
      atualizarContador();
      toast(`${p.nome} (${tam}) adicionada ao carrinho`);
    };

    $('#modalProduto').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fecharProduto() {
    $('#modalProduto').hidden = true;
    document.body.style.overflow = '';
  }

  // ---------------- carrinho ----------------
  function linhas() {
    const { produtos, config: cfg } = db();
    carrinho = carrinho.filter(i => produtos.some(p => p.id === i.id && p.ativo));
    return carrinho.map(i => {
      const p = produtos.find(x => x.id === i.id);
      const unit = DR.precoFinal(p) + (i.perso ? cfg.personalizacaoPreco : 0);
      return { ...i, p, unit, total: unit * i.qtd };
    });
  }

  function atualizarContador() {
    $('#qtdCarrinho').textContent = carrinho.reduce((s, i) => s + i.qtd, 0);
  }

  function abrirCarrinho() {
    renderCarrinho();
    $('#carrinho').hidden = false;
    $('#carrinhoFundo').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function fecharCarrinho() {
    $('#carrinho').hidden = true;
    $('#carrinhoFundo').hidden = true;
    document.body.style.overflow = '';
  }

  const temEncomendaNoCarrinho = () => linhas().some(l => l.p.encomenda);

  // encomenda é paga antes (Pix integral), porque a loja compra a camisa do fornecedor
  function pagamentoNaEntregaPermitido(frete) {
    return DR.config.pagamentoNaEntrega && !!frete && (frete.id === 'retirada' || frete.local) && !temEncomendaNoCarrinho();
  }

  // Código Pix "copia e cola" + QR Code em SVG para um pedido
  function pixQR(total, numero) {
    const codigo = DR.pixPayload(total, 'DARUA' + numero);
    let qr = '';
    if (window.qrcode) {
      const q = qrcode(0, 'M');
      q.addData(codigo);
      q.make();
      qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    }
    return { codigo, qr };
  }

  async function copiar(texto, campo) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) { campo.select(); document.execCommand('copy'); }
    toast('Código Pix copiado!');
  }

  function telaSucesso(corpo, rodape) {
    const p = pedidoFeito;
    if (p.pagamento === 'pix') {
      const { codigo, qr } = pixQR(p.total, p.numero);
      corpo.innerHTML = `<div class="sucesso">
        <div class="ok">✓</div>
        <h4>Pedido #${p.numero} recebido!</h4>
        <p>Pague <b>${brl(p.total)}</b> com Pix para confirmar. Escaneie o QR Code ou copie o código:</p>
        <div class="pix-qr">${qr}</div>
        <textarea class="pix-codigo" id="pixCodigo" readonly rows="4">${esc(codigo)}</textarea>
        <button class="btn primario largo" id="copiarPix">Copiar código Pix</button>
        <p class="cep-info">Recebedor: ${esc(DR.config.pix.nome)}. Assim que o pagamento for confirmado, separamos seu pedido e entramos em contato pelo telefone informado.</p>
        ${p.encomenda ? `<p class="cep-info">Seu pedido tem camisa sob encomenda: ela chega em ${esc(DR.prazoEncomenda())} dias depois do pagamento e então enviamos tudo junto.</p>` : ''}
        <p class="cep-info"><b>Pague em até ${DR.config.pixPrazoHoras} horas.</b> Depois disso o pedido é cancelado automaticamente e as camisas voltam para a loja.</p>
      </div>`;
      $('#copiarPix').onclick = () => copiar(codigo, $('#pixCodigo'));
    } else {
      corpo.innerHTML = `<div class="sucesso">
        <div class="ok">✓</div>
        <h4>Pedido #${p.numero} recebido!</h4>
        <p>Total de <b>${brl(p.total)}</b> a pagar na ${p.retirada ? 'retirada' : 'entrega'} (dinheiro, Pix ou cartão).
        Vamos entrar em contato pelo telefone informado para combinar. Obrigado por comprar na DA RUA!</p>
      </div>`;
    }
    corpo.querySelector('.sucesso').insertAdjacentHTML('beforeend',
      '<p class="cep-info">Acompanhe o andamento em <b>Meus pedidos</b>, no topo da loja.</p>');
    rodape.innerHTML = `<button class="btn largo" id="continuar">Continuar comprando</button>`;
    $('#continuar').onclick = () => { pedidoFeito = null; fecharCarrinho(); };
  }

  function renderCarrinho() {
    const corpo = $('#carrinhoCorpo'), rodape = $('#carrinhoRodape');
    const cfg = db().config;

    if (pedidoFeito) { telaSucesso(corpo, rodape); return; }

    const L = linhas();
    DR.saveCart(carrinho);
    atualizarContador();

    const pf = DRConta.perfil();
    if (pf && !preenchidoDaConta) {
      preenchidoDaConta = true;
      cliNome = cliNome || pf.nome;
      cliTel = cliTel || pf.telefone;
      if (!endereco && pf.cep && pf.cidade) {
        endereco = { cep: pf.cep, localidade: pf.cidade, uf: pf.uf };
        cliRua = cliRua || pf.endereco;
        freteId = 'entrega';
      }
    }

    if (!L.length) {
      corpo.innerHTML = '<p class="vazio">Seu carrinho está vazio.</p>';
      rodape.innerHTML = '<button class="btn primario largo" id="continuar">Ver camisas</button>';
      $('#continuar').onclick = fecharCarrinho;
      return;
    }

    const subtotal = L.reduce((s, l) => s + l.total, 0);
    const qtdItens = L.reduce((s, l) => s + l.qtd, 0);
    const ops = DR.opcoesFrete(endereco, subtotal, qtdItens);
    if (!ops.some(o => o.id === freteId)) freteId = ops[0]?.id || null;
    const frete = ops.find(o => o.id === freteId);
    const falta = cfg.freteGratisAcima - subtotal;
    const podeNaEntrega = pagamentoNaEntregaPermitido(frete);
    const pixAtivo = !!cfg.pix.chave;   // sem chave cadastrada, o Pix nem aparece
    if (!podeNaEntrega) pagamento = 'pix';
    else if (!pixAtivo) pagamento = 'entrega';

    corpo.innerHTML = `
      ${L.map(l => `
        <div class="item">
          <img src="${DR.imagemDe(l.p)}" alt="">
          <div>
            <div class="item-nome">${esc(l.p.nome)}</div>
            ${l.p.encomenda ? `<div class="item-det item-enc">Sob encomenda · chega em ${esc(DR.prazoEncomenda())} dias</div>` : ''}
            <div class="item-det">Tamanho ${l.t}${l.perso ? ` · ${esc([l.perso.nome, l.perso.num].filter(Boolean).join(' '))}` : ''}</div>
            <div class="item-det">${brl(l.unit)} cada</div>
          </div>
          <div class="item-dir">
            <b>${brl(l.total)}</b>
            <div class="qtd mini"><button data-menos="${esc(l.key)}">−</button><span>${l.qtd}</span><button data-mais="${esc(l.key)}" ${disponivel(l.p, l.t) <= 0 ? 'disabled' : ''}>+</button></div>
            <button class="remover" data-remover="${esc(l.key)}">remover</button>
          </div>
        </div>`).join('')}

      <div class="bloco">
        <h4>Entrega</h4>
        <div class="cep-linha">
          <input type="text" id="cep" inputmode="numeric" maxlength="9" placeholder="Seu CEP" value="${esc(endereco?.cep || '')}">
          <button class="btn pequeno" id="calcFrete">Calcular</button>
        </div>
        <p class="erro" id="erroCep" hidden></p>
        ${endereco ? `<p class="cep-info">${esc(endereco.localidade)}/${esc(endereco.uf)}</p>` : ''}
        ${ops.map(o => `
          <label class="opcao-frete">
            <input type="radio" name="frete" value="${o.id}" ${o.id === freteId ? 'checked' : ''}>
            <span>${esc(o.titulo)}<small>${esc(o.prazo)}</small></span>
            <span class="valor ${o.valor === 0 ? 'gratis' : ''}">${o.valor === 0 ? 'Grátis' : brl(o.valor)}</span>
          </label>`).join('')}
        ${freteId === 'entrega' ? `<input type="text" id="cliEndereco" placeholder="Rua, número e complemento"
            value="${esc(cliRua)}">` : ''}
        ${cfg.freteGratisAcima > 0 && falta > 0 ? `<div class="falta-gratis">Faltam <b>${brl(falta)}</b> para ganhar frete grátis 🚚</div>` : ''}
      </div>

      <div class="bloco">
        <h4>Seus dados</h4>
        ${pf ? `<p class="cep-info">Comprando como <b>${esc(pf.email)}</b></p>` : '<p class="cep-info">Tem conta? <button type="button" class="link" data-entrar>Entre</button> para preencher seus dados e acompanhar os pedidos.</p>'}
        <input type="text" id="cliNome" placeholder="Nome completo" autocomplete="name" value="${esc(cliNome)}">
        <input type="tel" id="cliTel" placeholder="WhatsApp com DDD" autocomplete="tel" inputmode="tel" value="${esc(cliTel)}">
      </div>

      <div class="bloco">
        <h4>Pagamento</h4>
        ${pixAtivo ? `
          <label class="opcao-frete">
            <input type="radio" name="pagamento" value="pix" ${pagamento === 'pix' ? 'checked' : ''}>
            <span>Pix<small>QR Code e código copia e cola na hora</small></span>
          </label>` : ''}
        ${!pixAtivo && !podeNaEntrega ? '<p class="erro">Por enquanto só atendemos retirada e entregas na nossa cidade. Escolha "Retirar com o vendedor".</p>' : ''}
        ${podeNaEntrega ? `
          <label class="opcao-frete">
            <input type="radio" name="pagamento" value="entrega" ${pagamento === 'entrega' ? 'checked' : ''}>
            <span>Pagar na ${frete.id === 'retirada' ? 'retirada' : 'entrega'}<small>Dinheiro, Pix ou cartão</small></span>
          </label>`
        : cfg.pagamentoNaEntrega && L.some(l => l.p.encomenda) ? '<p class="cep-info">Pedidos com camisa sob encomenda são pagos por Pix na hora.</p>'
        : cfg.pagamentoNaEntrega ? '<p class="cep-info">Pagamento na entrega disponível só para retirada e entregas na nossa cidade.</p>' : ''}
      </div>`;

    rodape.innerHTML = `
      <div class="linha-total"><span>Subtotal</span><span>${brl(subtotal)}</span></div>
      <div class="linha-total"><span>Frete</span><span>${frete ? (frete.valor === 0 ? 'Grátis' : brl(frete.valor)) : 'Informe o CEP'}</span></div>
      <div class="linha-total grande"><span>Total</span><span>${brl(subtotal + (frete?.valor || 0))}</span></div>
      <p class="aceite">Ao finalizar, você concorda com os <a href="politicas.html#termos" target="_blank">Termos de uso</a>, a <a href="politicas.html#trocas" target="_blank">política de trocas</a> e a <a href="politicas.html#privacidade" target="_blank">Política de privacidade</a>.</p>
      <button class="btn verde largo" id="finalizar" ${enviando ? 'disabled' : ''}>${enviando ? 'Enviando pedido...' : 'Finalizar pedido'}</button>`;

    // eventos do carrinho
    corpo.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => alterarQtd(b.dataset.mais, 1));
    corpo.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => alterarQtd(b.dataset.menos, -1));
    corpo.querySelectorAll('[data-remover]').forEach(b => b.onclick = () => {
      carrinho = carrinho.filter(i => i.key !== b.dataset.remover);
      renderCarrinho();
    });
    corpo.querySelectorAll('input[name=frete]').forEach(r => r.onchange = () => { freteId = r.value; renderCarrinho(); });
    corpo.querySelectorAll('input[name=pagamento]').forEach(r => r.onchange = () => { pagamento = r.value; });

    const cep = $('#cep');
    cep.oninput = () => {
      const d = cep.value.replace(/\D/g, '').slice(0, 8);
      cep.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    };
    cep.onkeydown = e => { if (e.key === 'Enter') calcularFrete(); };
    $('#calcFrete').onclick = calcularFrete;
    $('#cliNome').oninput = e => { cliNome = e.target.value; };
    $('#cliTel').oninput = e => { cliTel = e.target.value; };
    const rua = $('#cliEndereco');
    if (rua) rua.oninput = e => { cliRua = e.target.value; };
    $('#finalizar').onclick = finalizar;
    corpo.querySelector('[data-entrar]')?.addEventListener('click', () => { fecharCarrinho(); abrirPedidos(); });
  }

  function alterarQtd(key, delta) {
    const item = carrinho.find(i => i.key === key);
    if (!item) return;
    if (delta > 0) {
      const p = db().produtos.find(x => x.id === item.id);
      if (!p || disponivel(p, item.t) <= 0) { toast(p?.encomenda ? 'Limite de encomenda desse tamanho. Fale com a gente para mais.' : 'Sem mais unidades desse tamanho.'); return; }
    }
    item.qtd += delta;
    if (item.qtd <= 0) carrinho = carrinho.filter(i => i !== item);
    renderCarrinho();
  }

  async function calcularFrete() {
    const btn = $('#calcFrete'), erro = $('#erroCep');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      endereco = await DR.buscarCEP($('#cep').value);
      cliRua = [endereco.logradouro, endereco.bairro].filter(Boolean).join(', ');
      freteId = 'entrega';
      renderCarrinho();
    } catch (e) {
      erro.textContent = e.message || 'Erro ao consultar CEP.';
      erro.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Calcular';
    }
  }

  async function finalizar() {
    const L = linhas();
    if (!L.length || enviando) return;
    const nome = cliNome.trim();
    const tel = cliTel.trim();
    const rua = cliRua.trim();

    const subtotal = L.reduce((s, l) => s + l.total, 0);
    const qtdItens = L.reduce((s, l) => s + l.qtd, 0);
    const frete = DR.opcoesFrete(endereco, subtotal, qtdItens).find(o => o.id === freteId);

    if (!frete) { toast('Informe seu CEP para calcular o frete.'); $('#cep').focus(); return; }
    if (frete.id === 'entrega' && !/\d/.test(rua)) { toast('Informe rua e número para a entrega.'); $('#cliEndereco').focus(); return; }
    if (!nome) { toast('Informe seu nome.'); $('#cliNome').focus(); return; }
    if (tel.replace(/\D/g, '').length < 10) { toast('Informe seu WhatsApp com DDD.'); $('#cliTel').focus(); return; }
    if (pagamento === 'pix' && !DR.config.pix.chave) { toast('A loja ainda não configurou a chave Pix.'); return; }
    if (pagamento === 'entrega' && !pagamentoNaEntregaPermitido(frete)) pagamento = 'pix';

    enviando = true;
    renderCarrinho();
    try {
      // a API confere o estoque na planilha, recalcula os preços e dá baixa
      const pf = DRConta.perfil();
      const r = await DR.api('pedido', {
        conta: DRConta.token(),
        cliente: { nome, telefone: tel, email: pf?.email || '' },
        pagamento,
        itens: L.map(l => ({ id: l.id, t: l.t, qtd: l.qtd, perso: l.perso })),
        frete: {
          tipo: frete.titulo, valor: frete.valor,
          cep: endereco?.cep || '', cidade: endereco?.localidade || '', uf: endereco?.uf || '',
          endereco: frete.id === 'entrega' ? rua : ''
        }
      });
      pedidoFeito = { numero: r.numero, total: r.total, pagamento, retirada: frete.id === 'retirada', encomenda: L.some(l => l.p.encomenda) };
      DR.guardarPedido(r.numero, tel);
      if (pf) DRConta.lembrarEntrega({
        nome, telefone: tel, cep: endereco?.cep || '', cidade: endereco?.localidade || '', uf: endereco?.uf || '',
        endereco: frete.id === 'entrega' ? rua : ''
      });
      preenchidoDaConta = false;
      carrinho = [];
      DR.saveCart(carrinho);
      endereco = null;
      freteId = null;
      cliRua = '';
      atualizarCatalogo();
    } catch (e) {
      toast(e.message || 'Não foi possível enviar o pedido. Tente de novo.');
    }
    enviando = false;
    atualizarContador();
    renderCarrinho();
  }

  // ---------------- meus pedidos (acompanhamento) ----------------
  let acompanhados = [];
  let carregandoPedidos = false;

  function etapasDo(p) {
    const retirada = /retir/i.test(p.frete_tipo);
    return [
      'Pedido recebido',
      p.pagamento === 'Pix' ? 'Pagamento confirmado' : 'Pedido confirmado',
      retirada ? 'Pronto para retirada' : 'Enviado',
      retirada ? 'Retirado' : 'Entregue'
    ];
  }
  const PASSO = { 'Aguardando Pix': 0, Novo: 0, Pago: 1, Enviado: 2, Entregue: 3 };

  const prazoPix = data => new Date(new Date(data).getTime() + DR.config.pixPrazoHoras * 3600 * 1000)
    .toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function cartaoPedido(p) {
    const cancelado = p.status === 'Cancelado';
    const passo = PASSO[p.status] ?? 0;
    const data = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '';
    return `<div class="meu-pedido" data-num="${p.numero}">
      <div class="mp-topo"><b>Pedido #${p.numero}</b><small>${data}</small></div>
      ${cancelado
        ? '<p class="erro">Pedido cancelado. Em caso de dúvida, fale conosco.</p>'
        : `<ol class="linha-tempo">${etapasDo(p).map((e, i) =>
            `<li class="${i < passo ? 'feito' : i === passo ? 'atual' : ''}">${e}</li>`).join('')}</ol>`}
      ${p.status === 'Aguardando Pix' ? `<p class="cep-info">Aguardando a confirmação do seu Pix.${p.data ? ` Pague até <b>${prazoPix(p.data)}</b> ou o pedido é cancelado.` : ''}</p>` : ''}
      <ul class="mp-itens">${p.itens.map(i => `<li>${i.qtd}x ${esc(i.nome)} — ${esc(i.t)}${i.enc ? ' · sob encomenda' : ''}${i.perso ? ` · ${esc([i.perso.nome, i.perso.num].filter(Boolean).join(' '))}` : ''}</li>`).join('')}</ul>
      <div class="linha-total"><span>${esc(p.pagamento)} · ${esc(p.frete_tipo)}</span><b>${brl(p.total)}</b></div>
      ${p.status === 'Aguardando Pix' ? `<button class="btn primario largo" data-pagar="${p.numero}">Pagar com Pix</button><div class="mp-pix" hidden></div>` : ''}
    </div>`;
  }

  function renderPedidos(erro) {
    const corpo = $('#pedidosCorpo');
    const logado = !!DRConta.perfil();
    $('#tituloPedidos').textContent = logado ? 'Minha conta' : 'Entrar';
    corpo.innerHTML = `
      <div id="contaBox"></div>
      <h4 class="titulo-secao">${logado ? 'Seus pedidos' : 'Pedidos feitos neste aparelho'}</h4>
      ${carregandoPedidos ? '<p class="vazio">Carregando seus pedidos...</p>' : ''}
      ${!carregandoPedidos && !acompanhados.length ? `<p class="vazio">${logado ? 'Você ainda não fez pedidos com esta conta.' : 'Nenhum pedido feito neste aparelho ainda.'}</p>` : ''}
      ${acompanhados.map(cartaoPedido).join('')}
      <form class="bloco" id="formConsulta">
        <h4>${logado ? 'Consultar outro pedido' : 'Comprou sem conta? Consulte pelo número'}</h4>
        <input type="number" id="consNum" placeholder="Número do pedido (ex: 1001)" required>
        <input type="tel" id="consTel" placeholder="WhatsApp usado na compra" required>
        ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
        <button class="btn largo">Consultar</button>
      </form>`;

    DRConta.render($('#contaBox'), recarregar => { atualizarBotaoConta(); recarregar ? abrirPedidos() : renderPedidos(); });

    corpo.querySelectorAll('[data-pagar]').forEach(b => b.onclick = () => {
      const p = acompanhados.find(x => String(x.numero) === b.dataset.pagar);
      const box = b.nextElementSibling;
      if (!box.hidden) { box.hidden = true; return; }
      const { codigo, qr } = pixQR(p.total, p.numero);
      box.innerHTML = `<div class="pix-qr">${qr}</div>
        <textarea class="pix-codigo" readonly rows="4">${esc(codigo)}</textarea>
        <button class="btn largo" type="button">Copiar código Pix</button>`;
      box.querySelector('button').onclick = () => copiar(codigo, box.querySelector('textarea'));
      box.hidden = false;
    });

    $('#formConsulta').onsubmit = async e => {
      e.preventDefault();
      const numero = Number($('#consNum').value), telefone = $('#consTel').value;
      try {
        const r = await DR.api('acompanhar', { consultas: [{ numero, telefone }] });
        DR.guardarPedido(numero, telefone);
        acompanhados = [r.pedidos[0], ...acompanhados.filter(p => p.numero !== numero)];
        renderPedidos();
      } catch (er) {
        renderPedidos(er.message);
      }
    };
  }

  async function abrirPedidos() {
    $('#pedidosGaveta').hidden = false;
    $('#pedidosFundo').hidden = false;
    document.body.style.overflow = 'hidden';
    const consultas = DR.meusPedidos();
    const logado = !!DRConta.token();
    carregandoPedidos = logado || consultas.length > 0;
    if (!carregandoPedidos) acompanhados = [];   // ex.: acabou de sair da conta
    renderPedidos();
    if (!carregandoPedidos) return;
    try {
      // logado: pedidos da conta + os feitos neste aparelho sem conta; sem login: só os do aparelho
      const daConta = logado ? ((await DRConta.carregar())?.pedidos || []) : [];
      const doAparelho = consultas.length ? (await DR.api('acompanhar', { consultas })).pedidos : [];
      acompanhados = [...daConta, ...doAparelho.filter(p => !daConta.some(c => c.numero === p.numero))]
        .sort((a, b) => b.numero - a.numero);
      atualizarBotaoConta();
      carregandoPedidos = false;
      renderPedidos();
    } catch (e) {
      carregandoPedidos = false;
      renderPedidos(e.message);
    }
  }
  function fecharPedidos() {
    $('#pedidosGaveta').hidden = true;
    $('#pedidosFundo').hidden = true;
    document.body.style.overflow = '';
  }

  // ---------------- eventos gerais ----------------
  $('#filtroCategoria').onclick = e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    filtro.cat = b.dataset.cat;
    montarFiltros();
    $('#filtroTamanho').value = filtro.tam;
    renderGrade();
  };
  $('#abasLoja').onclick = e => {
    const b = e.target.closest('[data-modo]');
    if (!b || b.dataset.modo === filtro.modo) return;
    filtro.modo = b.dataset.modo;
    filtro.cat = 'Todas';
    filtro.tam = '';
    montarFiltros();
    renderGrade();
  };
  $('#filtroTamanho').onchange = e => { filtro.tam = e.target.value; renderGrade(); };
  $('#ordenar').onchange = e => { filtro.ordem = e.target.value; renderGrade(); };
  $('#busca').oninput = e => { filtro.busca = e.target.value; renderGrade(); };
  $('#grade').onclick = e => { const c = e.target.closest('[data-id]'); if (c) abrirProduto(c.dataset.id); };

  $('#modalProduto').onclick = e => { if (e.target.id === 'modalProduto' || e.target.closest('[data-fechar]')) fecharProduto(); };
  $('#abrirCarrinho').onclick = abrirCarrinho;
  $('#abrirPedidos').onclick = abrirPedidos;
  $('#fecharPedidos').onclick = fecharPedidos;
  $('#pedidosFundo').onclick = fecharPedidos;
  $('#fecharCarrinho').onclick = fecharCarrinho;
  $('#carrinhoFundo').onclick = fecharCarrinho;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { fecharProduto(); fecharCarrinho(); fecharPedidos(); } });

  // carrinho aberto em outra aba do mesmo navegador
  window.addEventListener('storage', () => {
    carrinho = DR.loadCart();
    atualizarContador();
    if (!$('#carrinho').hidden) renderCarrinho();
  });

  // Mostra a última cópia salva na hora e depois troca pela planilha atualizada
  async function atualizarCatalogo() {
    try {
      catalogo = await DR.carregarCatalogo();
      $('#vazio').textContent = 'Nenhuma camisa encontrada com esses filtros.';
    } catch (e) {
      if (!catalogo.length) {
        $('#vazio').textContent = location.protocol === 'file:'
          ? 'O navegador bloqueia a planilha quando o site é aberto direto do arquivo. Rode "python3 -m http.server" na pasta do site e acesse http://localhost:8000'
          : 'Não foi possível carregar as camisas. Verifique sua internet e recarregue a página.';
        $('#vazio').hidden = false;
        return;
      }
    }
    montarFiltros();
    $('#filtroTamanho').value = filtro.tam;
    renderGrade();
    if (!$('#carrinho').hidden) renderCarrinho();
  }

  function atualizarBotaoConta() {
    const nome = DRConta.primeiroNome();
    $('#abrirPedidos').textContent = nome ? `Olá, ${nome}` : 'Entrar';
    $('#abrirPedidos').setAttribute('aria-label', nome ? 'Minha conta e pedidos' : 'Entrar ou acompanhar pedidos');
  }
  atualizarBotaoConta();

  $('#ano').textContent = new Date().getFullYear();
  const emp = DR.config.empresa || {};
  const dadosLoja = [emp.nome, emp.documento && ((emp.documento.replace(/\D/g, '').length > 11 ? 'CNPJ ' : 'CPF ') + emp.documento), emp.endereco, emp.email].filter(Boolean);
  if (dadosLoja.length) {
    $('#rodapeEmpresa').textContent = dadosLoja.join(' · ');
    $('#rodapeEmpresa').hidden = false;
  }
  if (DR.config.whatsapp) {
    $('#contato').href = `https://wa.me/${DR.config.whatsapp.replace(/\D/g, '')}`;
    $('#contato').hidden = false;
  }
  catalogo = DR.catalogoEmCache() || [];
  montarFiltros();
  renderFaixa();
  atualizarContador();
  if (catalogo.length) renderGrade();
  else { $('#vazio').textContent = 'Carregando camisas...'; $('#vazio').hidden = false; }
  atualizarCatalogo();
  setInterval(atualizarCatalogo, 5 * 60 * 1000);
})();
