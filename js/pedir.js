/* DA RUA — "Peça a sua": o cliente manda a imagem de uma camisa que não está no site.
   A solicitação vai para a aba "solicitacoes" da planilha (o vendedor vê no painel) e o cliente
   pode abrir o WhatsApp com a mensagem já escrita. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const { esc } = DR;
  const modal = $('#modalPedir');
  const form = $('#formPedir');
  const original = form.innerHTML;   // para voltar ao formulário depois da tela de "recebido"
  let imagem = null;                 // { base64, mime }

  function montar() {
    form.innerHTML = original;
    imagem = null;
    $('#pedirTam').insertAdjacentHTML('beforeend', DR.TAMANHOS.map(t => `<option>${t}</option>`).join(''));
    const pf = window.DRConta?.perfil();
    if (pf) {
      $('#pedirNome').value = pf.nome || '';
      $('#pedirTel').value = pf.telefone || '';
    }
    $('#pedirFoto').onchange = async e => {
      const arq = e.target.files[0];
      if (!arq) return;
      try {
        // 1024 px basta para o vendedor reconhecer a camisa e deixa o envio leve
        const r = await DR.reduzirImagem(arq, 1024);
        imagem = { base64: r.base64, mime: r.mime };
        $('#pedirPrevia').src = r.url;
        $('#pedirPrevia').hidden = false;
        $('#pedirFotoTxt').textContent = 'Trocar imagem';
      } catch (er) {
        erro(er.message);
      }
    };
  }

  function erro(msg) {
    const e = $('#pedirErro');
    e.textContent = msg;
    e.hidden = !msg;
  }

  function abrir() {
    montar();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function fechar() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  function recebido(id, dados) {
    const zap = String(DR.config.whatsapp || '').replace(/\D/g, '');
    const msg = `Oi! Fiz a solicitação ${id} no site da DA RUA: ${dados.descricao || 'mandei a imagem da camisa'}${dados.tamanho ? `, tamanho ${dados.tamanho}` : ''}.`;
    form.innerHTML = `<div class="sucesso">
      <div class="ok">✓</div>
      <h4>Solicitação ${esc(id)} recebida!</h4>
      <p>Vamos procurar a camisa e responder no seu WhatsApp com preço e prazo. Se preferir, chame a gente agora:</p>
      ${zap ? `<a class="btn verde largo" target="_blank" rel="noopener" href="https://wa.me/${zap}?text=${encodeURIComponent(msg)}">Falar no WhatsApp</a>` : ''}
      <button type="button" class="btn largo" data-fechar style="margin-top:8px">Voltar para a loja</button>
    </div>`;
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const dados = {
      nome: $('#pedirNome').value.trim(),
      telefone: $('#pedirTel').value.trim(),
      descricao: $('#pedirDesc').value.trim(),
      tamanho: $('#pedirTam').value
    };
    if (!imagem && dados.descricao.length < 3) return erro('Mande a imagem ou escreva qual camisa você quer.');
    if (!dados.nome) return erro('Informe seu nome.');
    if (dados.telefone.replace(/\D/g, '').length < 10) return erro('Informe seu WhatsApp com DDD.');
    erro('');
    const btn = $('#pedirEnviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const r = await DR.api('solicitar', { ...dados, imagem: imagem?.base64 || '', mime: imagem?.mime || '' });
      recebido(r.id, dados);
    } catch (er) {
      erro(er.message || 'Não foi possível enviar. Tente de novo.');
      btn.disabled = false;
      btn.textContent = 'Enviar solicitação';
    }
  };

  modal.onclick = e => { if (e.target === modal || e.target.closest('[data-fechar]')) fechar(); };
  window.DRPedir = { abrir, fechar };
})();
