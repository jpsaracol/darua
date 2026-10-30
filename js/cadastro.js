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
      $('#abaCadastro').hidden = b.dataset.aba !== 'cadastro';
    };
  });

  form.categoria.innerHTML = '<option value="">Escolha...</option>' + DR.CATEGORIAS.map(c => `<option>${c}</option>`).join('');
  form.tipo.innerHTML = TIPOS.map(t => `<option>${t}</option>`).join('');
  $('#estoqueCampos').innerHTML = DR.TAMANHOS.map(t =>
    `<label>${t} <input type="number" name="${t}" min="0" max="999" value="0" inputmode="numeric"></label>`).join('');

  // ---------------- foto ----------------
  // Reduz para no máximo 1280px em JPEG: a foto do celular cai de ~4 MB para ~250 KB,
  // o envio fica rápido e cabe folgado no limite do Apps Script e da IA
  function reduzir(arquivo) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k);
        cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        const url = cv.toDataURL('image/jpeg', 0.85);
        ok({ url, base64: url.split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = () => falha(new Error('Não deu para abrir essa imagem.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  $('#fotoInput').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const r = await reduzir(arq);
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
    btn.textContent = 'Identificando... (até 30s)';
    aviso('');
    try {
      const r = await DR.api('identificar', { senha: DRVendedor.senha(), imagem: foto.base64, mime: foto.mime });
      const c = r.camisa;
      ['nome', 'time', 'temporada', 'descricao'].forEach(k => { if (c[k]) form[k].value = c[k]; });
      if (c.categoria) form.categoria.value = c.categoria;
      if (c.tipo) form.tipo.value = c.tipo;
      if (c.cor1) form.cor1.value = c.cor1;
      if (c.cor2) form.cor2.value = c.cor2;
      form.listras.checked = c.listras === 'SIM';
      const duvida = r.confianca !== 'alta' || r.observacao;
      aviso(duvida
        ? `⚠️ A IA ficou em dúvida${r.observacao ? ': ' + r.observacao : '.'} Confira com atenção.`
        : '✓ Camisa identificada. Confira os dados e complete preço e estoque.', duvida ? 'duvida' : 'ok');
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

    const btn = $('#salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const r = await DR.api('cadastrar', { senha: DRVendedor.senha(), camisa, foto: foto && foto.base64, mime: foto && foto.mime });
      DRVendedor.toast(`Camisa salva na planilha (${r.id})!`);
      form.reset();
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
