/* DA RUA — cadastro de camisa por foto: a IA (Gemini, pelo Apps Script) sugere os dados,
   o vendedor confere, completa preço e estoque e salva direto na planilha */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const form = $('#formCamisa');
  const TIPOS = ['Torcedor', 'Jogador', 'Retrô', 'Treino'];
  let foto = null;   // { base64, mime }

  // ---------------- abas Pedidos / + Camisa ----------------
  document.querySelectorAll('[data-aba]').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
      $('#abaPedidos').hidden = b.dataset.aba !== 'pedidos';
      $('#abaSolicitacoes').hidden = b.dataset.aba !== 'solicitacoes';
      $('#abaCadastro').hidden = b.dataset.aba !== 'cadastro';
      if (b.dataset.aba === 'solicitacoes' && window.DRSolicitacoes) DRSolicitacoes.carregar();
    };
  });

  form.categoria.innerHTML = '<option value="">Escolha...</option>' + DR.CATEGORIAS.map(c => `<option>${c}</option>`).join('');
  form.tipo.innerHTML = TIPOS.map(t => `<option>${t}</option>`).join('');
  $('#estoqueCampos').innerHTML = DR.TAMANHOS.map(t =>
    `<label>${t} <input type="number" name="${t}" min="0" max="999" value="0" inputmode="numeric"></label>`).join('');

  // ---------------- sob encomenda ----------------
  // sem estoque: some o quadro de tamanhos e o preço vem da tabela do js/config.js (dá para mudar)
  const precosEncomenda = (DR.config.encomenda && DR.config.encomenda.precos) || {};
  const precoTxt = n => (n ? Number(n).toFixed(2).replace('.', ',') : '');
  let precoAuto = '';   // último preço preenchido sozinho; se o vendedor digitou outro, não mexe
  function precoSugerido() {
    if (!form.encomenda.checked) return;
    const novo = precoTxt(precosEncomenda[form.tipo.value]);
    if (novo && (!form.preco.value.trim() || form.preco.value.trim() === precoAuto)) {
      form.preco.value = novo;
      precoAuto = novo;
    }
  }
  function modoEncomenda() {
    const enc = form.encomenda.checked;
    $('#estoqueBox').hidden = enc;
    $('#fornecedorCampo').hidden = !enc;
    if (enc) precoSugerido();
    else if (form.preco.value.trim() === precoAuto) { form.preco.value = ''; precoAuto = ''; }
  }
  form.encomenda.onchange = modoEncomenda;
  form.tipo.onchange = precoSugerido;

  // ---------------- foto ----------------
  $('#fotoInput').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const r = await DR.reduzirImagem(arq);
      foto = { base64: r.base64, mime: r.mime };
      $('#fotoPrevia').src = r.url;
      $('#fotoPrevia').hidden = false;
      $('#fotoTexto').textContent = 'Trocar foto';
      $('#identificar').disabled = false;
    } catch (er) {
      DRVendedor.toast(er.message);
    }
  };

  function aviso(msg, tipo) {
    const a = $('#avisoIA');
    a.textContent = msg;
    a.className = 'aviso-ia ' + (tipo || '');
    a.hidden = !msg;
  }

  // ---------------- IA ----------------
  $('#identificar').onclick = async () => {
    const btn = $('#identificar');
    btn.disabled = true;
    btn.textContent = 'Identificando... (pode levar 1 min)';
    aviso('');
    try {
      const r = await DR.api('identificar', { senha: DRVendedor.senha(), imagem: foto.base64, mime: foto.mime });
      const c = r.camisa;
      ['nome', 'time', 'temporada', 'descricao'].forEach(k => { if (c[k]) form[k].value = c[k]; });
      if (c.categoria) form.categoria.value = c.categoria;
      if (c.tipo) form.tipo.value = c.tipo;
      precoSugerido();
      if (c.cor1) form.cor1.value = c.cor1;
      if (c.cor2) form.cor2.value = c.cor2;
      form.listras.checked = c.listras === 'SIM';
      const duvida = r.confianca !== 'alta' || r.observacao;
      if (r.demo) aviso('ℹ️ ' + r.observacao, 'duvida');
      else aviso(duvida
        ? `⚠️ A IA ficou em dúvida${r.observacao ? ': ' + r.observacao : '.'} Confira com atenção.`
        : form.encomenda.checked ? '✓ Camisa identificada. Confira os dados e o preço.' : '✓ Camisa identificada. Confira os dados e complete preço e estoque.', duvida ? 'duvida' : 'ok');
      form.preco.focus();
    } catch (er) {
      aviso(er.message, 'duvida');
    }
    btn.disabled = false;
    btn.textContent = 'Identificar com IA';
  };

  // ---------------- salvar ----------------
  form.onsubmit = async e => {
    e.preventDefault();
    const camisa = Object.fromEntries(['nome', 'time', 'temporada', 'categoria', 'tipo', 'preco', 'preco_promo', 'cor1', 'cor2', 'descricao', ...DR.TAMANHOS]
      .map(k => [k, form[k].value.trim()]));
    camisa.listras = form.listras.checked ? 'SIM' : 'NAO';
    camisa.destaque = form.destaque.checked ? 'SIM' : 'NAO';
    camisa.ativo = form.ativo.checked ? 'SIM' : 'NAO';
    camisa.encomenda = form.encomenda.checked ? 'SIM' : 'NAO';
    camisa.fornecedor = form.encomenda.checked ? form.fornecedor.value.trim() : '';

    const btn = $('#salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const r = await DR.api('cadastrar', { senha: DRVendedor.senha(), camisa, foto: foto && foto.base64, mime: foto && foto.mime });
      DRVendedor.toast(`Camisa salva na planilha (${r.id})!`);
      form.reset();
      precoAuto = '';
      modoEncomenda();
      foto = null;
      $('#fotoInput').value = '';
      $('#fotoPrevia').hidden = true;
      $('#fotoTexto').textContent = '📷 Tirar foto ou escolher da galeria';
      $('#identificar').disabled = true;
      aviso('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (er) {
      DRVendedor.toast(er.message);
    }
    btn.disabled = false;
    btn.textContent = 'Salvar na loja';
  };
})();
