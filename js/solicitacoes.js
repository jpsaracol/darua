/* DA RUA — área do vendedor: solicitações "Peça a sua" (camisas que os clientes pediram com imagem) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const { esc } = DR;
  const STATUS = ['Nova', 'Respondida', 'Virou pedido', 'Recusada'];
  const classe = { Nova: 'novo', Respondida: 'pix', 'Virou pedido': 'ok', Recusada: 'zero' };

  let lista = [];
  let carregou = false;

  const dataBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  function zap(s) {
    const d = String(s.telefone).replace(/\D/g, '');
    const nome = String(s.cliente || '').split(' ')[0];
    const msg = `Oi, ${nome}! Aqui é da DA RUA, sobre a camisa que você pediu no site (${s.id}).`;
    return `https://wa.me/${d.startsWith('55') ? d : '55' + d}?text=${encodeURIComponent(msg)}`;
  }
  // só links do Drive (lh3) ou imagens da demo viram <img>
  const fotoSegura = u => /^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]+$/.test(u) || /^data:image\/(jpeg|png);base64,/.test(u) || (DR.config.demo && /^fotos\/[\w-]+\.jpg$/.test(u));

  function render() {
    const novas = lista.filter(s => s.status === 'Nova').length;
    $('#contSolic').textContent = novas;
    $('#contSolic').hidden = !novas;

    const st = $('#filtroSolic').value;
    const vis = lista.filter(s => !st || s.status === st);
    $('#listaSolic').innerHTML = vis.map(s => `
      <div class="pedido solicitacao ${s.status === 'Recusada' ? 'cancelado' : ''}" data-id="${esc(s.id)}">
        ${s.foto && fotoSegura(s.foto)
          ? `<a href="${esc(s.foto)}" target="_blank" rel="noopener" class="solic-foto"><img src="${esc(s.foto)}" alt="Imagem enviada pelo cliente" loading="lazy"></a>`
          : '<div class="solic-foto sem">sem imagem</div>'}
        <div class="solic-info">
          <div class="pedido-topo">
            <h3>${esc(s.id)} — ${esc(s.cliente)}</h3>
            <small>${dataBR(s.data)}</small>
            <span class="pill ${classe[s.status] || 'cinza'}">${esc(s.status)}</span>
            <select data-status aria-label="Mudar status">${STATUS.map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </div>
          <p>${s.descricao ? esc(s.descricao) : '<i>Sem descrição: veja a imagem.</i>'}</p>
          <div class="pedido-dados">
            <span>📏 Tamanho: <b>${esc(s.tamanho || 'não informado')}</b></span>
            <span>📱 <a href="${zap(s)}" target="_blank" rel="noopener">${esc(s.telefone)} — responder no WhatsApp</a></span>
          </div>
        </div>
      </div>`).join('') || `<p class="vazio">${carregou ? 'Nenhuma solicitação por aqui ainda.' : 'Carregando...'}</p>`;
  }

  async function carregar(avisar) {
    if (!DRVendedor.senha()) return;
    try {
      const antes = lista.filter(s => s.status === 'Nova').length;
      lista = (await DR.api('solicitacoes', { senha: DRVendedor.senha() })).solicitacoes;
      carregou = true;
      render();
      const novas = lista.filter(s => s.status === 'Nova').length;
      if (avisar) DRVendedor.toast('Solicitações atualizadas.');
      else if (novas > antes && antes >= 0 && carregou) DRVendedor.toast(`${novas - antes} solicitação(ões) nova(s) de cliente!`);
    } catch (e) {
      if (avisar) DRVendedor.toast(e.message);
    }
  }
  window.DRSolicitacoes = { carregar };

  $('#listaSolic').onchange = async e => {
    if (!e.target.matches('[data-status]')) return;
    const sel = e.target;
    const id = sel.closest('.solicitacao').dataset.id;
    sel.disabled = true;
    try {
      await DR.api('statusSolicitacao', { senha: DRVendedor.senha(), id, status: sel.value });
      DRVendedor.toast(`${id}: ${sel.value}`);
      await carregar();
    } catch (er) {
      DRVendedor.toast(er.message);
      render();
    }
  };

  $('#filtroSolic').innerHTML = '<option value="">Todas</option>' + STATUS.map(s => `<option>${s}</option>`).join('');
  $('#filtroSolic').onchange = render;
  $('#atualizarSolic').onclick = () => carregar(true);

  // contador na aba: confere logo depois do login e a cada minuto
  const espera = setInterval(() => { if (DRVendedor.senha()) { clearInterval(espera); carregar(); } }, 500);
  setInterval(() => carregar(), 60 * 1000);
})();
