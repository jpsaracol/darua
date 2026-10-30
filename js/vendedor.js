/* DA RUA — área do vendedor: lista os pedidos da planilha e muda o status */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const { brl, esc } = DR;
  const STATUS = ['Aguardando Pix', 'Novo', 'Pago', 'Enviado', 'Entregue', 'Cancelado'];
  const CHAVE = 'darua_vendedor';

  let senha = '';
  let pedidos = [];
  window.DRVendedor = { senha: () => senha, toast: m => toast(m) };   // usado pelo cadastro de camisas

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  const guardar = s => { try { s ? sessionStorage.setItem(CHAVE, s) : sessionStorage.removeItem(CHAVE); } catch (e) { } };
  const lembrada = () => { try { return sessionStorage.getItem(CHAVE) || ''; } catch (e) { return ''; } };

  // ---------------- login ----------------
  async function entrar(s) {
    const r = await DR.api('listar', { senha: s });
    senha = s;
    guardar(s);
    pedidos = r.pedidos;
    $('#login').hidden = true;
    $('#painel').hidden = false;
    render();
  }

  $('#formLogin').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#entrar'), erro = $('#erroLogin');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    erro.hidden = true;
    try {
      await entrar($('#senha').value);
    } catch (er) {
      erro.textContent = er.message;
      erro.hidden = false;
    }
    btn.disabled = false;
    btn.textContent = 'Entrar';
  };

  $('#sair').onclick = () => { guardar(''); location.reload(); };

  // ---------------- lista ----------------
  async function recarregar(avisar) {
    try {
      const antes = pedidos.length;
      pedidos = (await DR.api('listar', { senha })).pedidos;
      render();
      if (avisar) toast('Pedidos atualizados.');
      else if (pedidos.length > antes) toast(`${pedidos.length - antes} pedido(s) novo(s)!`);
    } catch (e) {
      toast(e.message);
    }
  }

  const classeStatus = s => ({ 'Aguardando Pix': 'pix', Novo: 'novo', Pago: 'ok', Enviado: 'ok', Entregue: 'cinza', Cancelado: 'zero' }[s] || 'cinza');
  const dataBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const zap = tel => {
    const d = String(tel).replace(/\D/g, '');
    return `https://wa.me/${d.startsWith('55') ? d : '55' + d}`;
  };

  function render() {
    const conta = s => pedidos.filter(p => p.status === s).length;
    const vendido = pedidos.filter(p => ['Pago', 'Enviado', 'Entregue'].includes(p.status)).reduce((s, p) => s + Number(p.total || 0), 0);
    $('#kpis').innerHTML = `
      <div class="kpi ${conta('Aguardando Pix') ? 'alerta' : ''}"><span>Aguardando Pix</span><b>${conta('Aguardando Pix')}</b></div>
      <div class="kpi ${conta('Novo') ? 'alerta' : ''}"><span>Novos (pagar na entrega)</span><b>${conta('Novo')}</b></div>
      <div class="kpi"><span>Pagos — a enviar</span><b>${conta('Pago')}</b></div>
      <div class="kpi"><span>Vendas confirmadas</span><b>${brl(vendido)}</b></div>`;

    const st = $('#filtroStatus').value;
    const termo = DR.normalizar($('#busca').value);
    const lista = pedidos
      .filter(p => !st || p.status === st)
      .filter(p => !termo || DR.normalizar(`${p.numero} ${p.cliente} ${p.telefone}`).includes(termo));

    $('#lista').innerHTML = lista.map(p => `
      <div class="pedido ${p.status === 'Cancelado' ? 'cancelado' : ''}" data-num="${esc(p.numero)}">
        <div class="pedido-topo">
          <h3>#${esc(p.numero)} — ${esc(p.cliente)}</h3>
          <small>${dataBR(p.data)}</small>
          <span class="pill ${classeStatus(p.status)}">${esc(p.status)}</span>
          <select data-status aria-label="Mudar status">${STATUS.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="pedido-dados">
          <span>📱 <a href="${zap(p.telefone)}" target="_blank" rel="noopener">${esc(p.telefone)}</a></span>
          <span>💳 ${esc(p.pagamento)}</span>
          <span>🚚 ${esc(p.frete_tipo)} — ${Number(p.frete_valor) ? brl(p.frete_valor) : 'Grátis'}</span>
          ${p.endereco ? `<span>📍 ${esc(p.endereco)} — ${esc(p.cidade)}/${esc(p.uf)}, CEP ${esc(p.cep)}</span>` : ''}
        </div>
        <ul>${(p.itens_json || []).map(i => `<li>${i.qtd}x ${esc(i.nome)} — Tam. <b>${esc(i.t)}</b>${i.perso ? ` · Personalização: <b>${esc([i.perso.nome, i.perso.num].filter(Boolean).join(' '))}</b>` : ''} — ${brl(i.unit * i.qtd)}</li>`).join('')}</ul>
        <div class="pedido-rodape">
          <span>Subtotal ${brl(p.subtotal)} + frete ${brl(p.frete_valor)}</span>
          <b>Total: ${brl(p.total)}</b>
        </div>
      </div>`).join('') || '<p class="vazio">Nenhum pedido por aqui ainda.</p>';

    $('#atualizadoEm').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { timeStyle: 'short' }) + ' · atualiza sozinho a cada minuto';
  }

  $('#lista').onchange = async e => {
    if (!e.target.matches('[data-status]')) return;
    const sel = e.target;
    const numero = sel.closest('.pedido').dataset.num;
    const status = sel.value;
    if (status === 'Cancelado' && !confirm(`Cancelar o pedido #${numero}? As camisas voltam para o estoque.`)) { render(); return; }
    sel.disabled = true;
    try {
      await DR.api('status', { senha, numero, status });
      toast(`Pedido #${numero}: ${status}${status === 'Cancelado' ? ' — estoque devolvido' : ''}`);
      await recarregar();
    } catch (er) {
      toast(er.message);
      render();
    }
  };

  $('#filtroStatus').innerHTML = '<option value="">Todos os pedidos</option>' + STATUS.map(s => `<option>${s}</option>`).join('');
  $('#filtroStatus').onchange = render;
  $('#busca').oninput = render;
  $('#atualizar').onclick = () => recarregar(true);
  setInterval(() => { if (senha) recarregar(); }, 60 * 1000);

  const s = lembrada();
  if (s) entrar(s).catch(() => guardar(''));
})();
