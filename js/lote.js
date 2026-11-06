/* DA RUA — cadastro em lote de camisas sob encomenda: o vendedor escolhe várias fotos do catálogo do fornecedor,
   a IA identifica uma por vez e cada camisa vai para a planilha como encomenda, com o preço do tipo (js/config.js).
   Uma por vez de propósito: a cota grátis da IA não aguenta muitas chamadas ao mesmo tempo. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const { esc } = DR;
  const precos = (DR.config.encomenda && DR.config.encomenda.precos) || {};
  const PAUSA_MS = 3000;   // folga entre uma camisa e outra para não estourar o limite por minuto da IA

  let fila = [];          // { url, base64, mime, status: 'fila'|'trabalhando'|'ok'|'oculta'|'erro', msg }
  let rodando = false;
  let parar = false;

  const icone = { fila: '⏳', trabalhando: '🔎', ok: '✅', oculta: '⚠️', erro: '❌' };

  function render() {
    $('#loteLista').innerHTML = fila.map((it, i) => `
      <li class="lote-item ${it.status}">
        <img src="${it.url}" alt="">
        <div>
          <b>${icone[it.status]} ${esc(it.titulo || `Foto ${i + 1}`)}</b>
          <small>${esc(it.msg || (it.status === 'fila' ? 'Na fila' : ''))}</small>
        </div>
        ${!rodando && it.status !== 'ok' && it.status !== 'oculta' ? `<button type="button" class="remover" data-tirar="${i}" aria-label="Tirar da lista">×</button>` : ''}
      </li>`).join('');
    const pendentes = fila.filter(it => it.status === 'fila' || it.status === 'erro').length;
    const btn = $('#loteIniciar');
    btn.hidden = !fila.length;
    btn.disabled = !rodando && !pendentes;
    btn.textContent = rodando ? 'Parar depois desta' : pendentes ? `Cadastrar ${pendentes} camisa${pendentes > 1 ? 's' : ''}` : 'Tudo cadastrado';
    btn.classList.toggle('primario', !rodando);
  }

  $('#loteInput').onchange = async e => {
    const arquivos = [...e.target.files].slice(0, 40);
    e.target.value = '';
    for (const arq of arquivos) {
      try {
        const r = await DR.reduzirImagem(arq);
        fila.push({ url: r.url, base64: r.base64, mime: r.mime, status: 'fila' });
      } catch (er) {
        DRVendedor.toast(`${arq.name}: ${er.message}`);
      }
      render();
    }
  };

  $('#loteLista').onclick = e => {
    const b = e.target.closest('[data-tirar]');
    if (!b || rodando) return;
    fila.splice(Number(b.dataset.tirar), 1);
    render();
  };

  async function processar(it) {
    it.status = 'trabalhando';
    it.msg = 'A IA está identificando...';
    render();
    const id = await DR.api('identificar', { senha: DRVendedor.senha(), imagem: it.base64, mime: it.mime });
    const c = id.camisa;
    if (!c.nome || !c.categoria) throw new Error('A IA não reconheceu a camisa. Use o cadastro normal (abaixo).');
    it.titulo = c.nome;
    const preco = precos[c.tipo] || precos.Torcedor;
    if (!preco) throw new Error('Falta o preço do tipo ' + c.tipo + ' em js/config.js (encomenda.precos).');
    // em dúvida: salva escondida para o vendedor conferir antes de aparecer na loja
    const certeza = id.confianca === 'alta' && !id.observacao;
    it.msg = 'Salvando...';
    render();
    const camisa = {
      ...c, preco: String(preco).replace('.', ','), preco_promo: '',
      encomenda: 'SIM', fornecedor: $('#loteLink').value.trim(),
      ativo: certeza || id.demo ? 'SIM' : 'NAO', destaque: 'NAO'
    };
    const r = await DR.api('cadastrar', { senha: DRVendedor.senha(), camisa, foto: it.base64, mime: it.mime });
    const precoTxt = DR.brl(preco);
    if (camisa.ativo === 'SIM') {
      it.status = 'ok';
      it.msg = `Na loja por ${precoTxt} (${r.id})`;
    } else {
      it.status = 'oculta';
      it.msg = `Salva escondida: a IA ficou em dúvida${id.observacao ? ` (${id.observacao})` : ''}. Confira na planilha (${r.id}).`;
    }
  }

  $('#loteIniciar').onclick = async () => {
    if (rodando) { parar = true; $('#loteIniciar').textContent = 'Parando...'; return; }
    rodando = true;
    parar = false;
    render();
    const pendentes = fila.filter(it => it.status === 'fila' || it.status === 'erro');
    for (let i = 0; i < pendentes.length && !parar; i++) {
      const it = pendentes[i];
      try {
        await processar(it);
      } catch (er) {
        it.status = 'erro';
        it.msg = er.message;
        // cota da IA acabou: não adianta continuar agora
        if (/limite/i.test(er.message)) { parar = true; DRVendedor.toast('A IA atingiu o limite grátis. Continue mais tarde.'); }
      }
      render();
      if (i < pendentes.length - 1 && !parar) await new Promise(r => setTimeout(r, PAUSA_MS));
    }
    rodando = false;
    const ok = fila.filter(it => it.status === 'ok').length;
    const ocultas = fila.filter(it => it.status === 'oculta').length;
    DRVendedor.toast(`${ok} na loja${ocultas ? `, ${ocultas} escondida(s) para conferir` : ''}. Aparecem no site em até ~5 min.`);
    render();
  };
})();
