/* DA RUA — conta do cliente: entrar, criar conta, esqueci a senha e "minha conta".
   Fica dentro da gaveta "Meus pedidos" (a loja chama DRConta.render). A sessão é um token
   assinado pelo Apps Script, guardado no navegador; a senha nunca é guardada aqui. */
const DRConta = (() => {
  const CHAVE = (DR.config.demo ? 'darua_demo_' : 'darua_') + 'sessao_v1';
  const { esc } = DR;
  let tela = 'entrar';   // entrar | criar | recuperar | redefinir
  let emailRec = '';
  let erro = '', aviso = '';
  let ocupado = false;
  let editandoEndereco = false;

  function sessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch (e) { return null; }
  }
  function guardar(s) {
    try { s ? localStorage.setItem(CHAVE, JSON.stringify(s)) : localStorage.removeItem(CHAVE); } catch (e) { }
  }
  const perfil = () => sessao()?.perfil || null;
  const token = () => sessao()?.token || '';
  const primeiroNome = () => String(perfil()?.nome || '').split(' ')[0];

  function sair() {
    guardar(null);
    tela = 'entrar';
    erro = aviso = '';
  }

  // Busca perfil e pedidos da conta; sessão vencida = sai sem alarde
  async function carregar() {
    if (!token()) return null;
    try {
      const r = await DR.api('conta', { token: token() });
      guardar({ token: token(), perfil: r.perfil });
      return r;
    } catch (e) {
      sair();
      return null;
    }
  }

  // Depois de um pedido, guarda nome, WhatsApp e endereço para a próxima compra
  async function lembrarEntrega(dados) {
    if (!token()) return;
    try {
      const r = await DR.api('salvarEndereco', { token: token(), ...dados });
      guardar({ token: token(), perfil: r.perfil });
    } catch (e) { }
  }

  // Envia o formulário sem redesenhar enquanto espera: assim, se der erro, o que o cliente digitou continua lá
  async function enviar(acao, dados, aoMudar, form) {
    if (ocupado) return;
    ocupado = true;
    erro = aviso = '';
    const btn = form?.querySelector('.btn.primario');
    const txt = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }
    try {
      const r = await DR.api(acao, dados);
      if (r.token) guardar({ token: r.token, perfil: r.perfil });
      if (acao === 'recuperar') {
        emailRec = dados.email;
        tela = 'redefinir';
        aviso = r.aviso || 'Se existir uma conta com esse e-mail, enviamos um código de 6 números. Confira também o spam.';
      }
      if (acao === 'excluirConta') { sair(); aviso = 'Sua conta foi excluída.'; }
      if (acao === 'salvarEndereco') editandoEndereco = false;
      ocupado = false;
      aoMudar(true);
    } catch (e) {
      ocupado = false;
      if (!form) { erro = e.message; aoMudar(false); return; }
      if (btn) { btn.disabled = false; btn.textContent = txt; }
      let el = form.querySelector('.erro');
      if (!el) { el = document.createElement('p'); el.className = 'erro'; el.setAttribute('role', 'alert'); btn ? btn.before(el) : form.append(el); }
      el.textContent = e.message;
    }
  }

  const termos = '<a href="politicas.html#termos" target="_blank">Termos de uso</a> e a <a href="politicas.html#privacidade" target="_blank">Política de privacidade</a>';
  const msg = () => (erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : '') + (aviso ? `<p class="aviso-conta" role="status">${esc(aviso)}</p>` : '');
  const botao = txt => `<button class="btn primario largo">${txt}</button>`;

  // Desenha a parte da conta em "box"; aoMudar(recarregar) pede para a loja redesenhar a gaveta
  function render(box, aoMudar) {
    const p = perfil();
    if (p) return renderConta(box, p, aoMudar);

    const formularios = {
      entrar: `
        <form class="bloco conta-form" data-acao="entrar">
          <h4>Entrar na sua conta</h4>
          <label>E-mail <input type="email" name="email" autocomplete="email" required></label>
          <label>Senha <input type="password" name="senha" autocomplete="current-password" required></label>
          ${msg()}${botao('Entrar')}
          <p class="conta-links"><button type="button" data-tela="recuperar">Esqueci minha senha</button> · <button type="button" data-tela="criar">Criar conta</button></p>
        </form>`,
      criar: `
        <form class="bloco conta-form" data-acao="criarConta">
          <h4>Criar conta</h4>
          <label>Nome completo <input type="text" name="nome" autocomplete="name" required maxlength="80"></label>
          <label>E-mail <input type="email" name="email" autocomplete="email" required></label>
          <label>WhatsApp com DDD <input type="tel" name="telefone" autocomplete="tel" inputmode="tel" required></label>
          <label>Senha (mínimo 6 caracteres) <input type="password" name="senha" autocomplete="new-password" minlength="6" required></label>
          <label class="check"><input type="checkbox" name="aceite" required> <span>Li e aceito os ${termos}.</span></label>
          ${msg()}${botao('Criar conta')}
          <p class="conta-links">Já tem conta? <button type="button" data-tela="entrar">Entrar</button></p>
        </form>`,
      recuperar: `
        <form class="bloco conta-form" data-acao="recuperar">
          <h4>Esqueci minha senha</h4>
          <p class="cep-info">Informe o e-mail da conta. Enviamos um código para você criar uma senha nova.</p>
          <label>E-mail <input type="email" name="email" autocomplete="email" required></label>
          ${msg()}${botao('Enviar código')}
          <p class="conta-links"><button type="button" data-tela="entrar">Voltar</button></p>
        </form>`,
      redefinir: `
        <form class="bloco conta-form" data-acao="redefinir">
          <h4>Criar nova senha</h4>
          ${msg()}
          <label>Código recebido por e-mail <input type="text" name="codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
          <label>Nova senha <input type="password" name="senha" autocomplete="new-password" minlength="6" required></label>
          ${botao('Salvar nova senha')}
          <p class="conta-links"><button type="button" data-tela="recuperar">Reenviar código</button></p>
        </form>`
    };
    box.innerHTML = formularios[tela];

    box.querySelectorAll('[data-tela]').forEach(b => b.onclick = () => {
      tela = b.dataset.tela;
      erro = aviso = '';
      aoMudar(false);
      box.querySelector('input')?.focus();
    });
    const form = box.querySelector('form');
    form.onsubmit = e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (form.dataset.acao === 'criarConta') d.aceite = !!form.aceite.checked;
      if (form.dataset.acao === 'redefinir') d.email = emailRec;
      enviar(form.dataset.acao, d, aoMudar, form);
    };
  }

  function renderConta(box, p, aoMudar) {
    const end = [p.endereco, p.cidade && `${p.cidade}/${p.uf}`, p.cep && `CEP ${p.cep}`].filter(Boolean).join(' — ');
    box.innerHTML = `
      <div class="bloco conta-perfil">
        <div class="conta-ola"><span class="conta-avatar" aria-hidden="true">${esc(primeiroNome().slice(0, 1).toUpperCase())}</span>
          <div><b>Olá, ${esc(primeiroNome())}!</b><small>${esc(p.email)}</small></div></div>
        ${editandoEndereco ? `
          <form class="conta-form" data-acao="salvarEndereco">
            <label>WhatsApp <input type="tel" name="telefone" value="${esc(p.telefone)}" required></label>
            <label>CEP <input type="text" name="cep" inputmode="numeric" maxlength="9" value="${esc(p.cep)}"></label>
            <label>Rua, número e complemento <input type="text" name="endereco" value="${esc(p.endereco)}"></label>
            ${msg()}${botao('Salvar')}
            <p class="conta-links"><button type="button" data-cancelar>Cancelar</button></p>
          </form>`
        : `<p class="cep-info">📱 ${esc(p.telefone)}<br>📍 ${end ? esc(end) : 'Nenhum endereço salvo ainda. Ele é salvo na sua primeira compra.'}</p>
          ${msg()}
          <p class="conta-links"><button type="button" data-editar>Editar dados</button> · <button type="button" data-sair>Sair</button> · <button type="button" data-excluir>Excluir conta</button></p>`}
      </div>`;

    box.querySelector('[data-sair]')?.addEventListener('click', () => { sair(); aoMudar(true); });
    box.querySelector('[data-editar]')?.addEventListener('click', () => { editandoEndereco = true; erro = aviso = ''; aoMudar(false); });
    box.querySelector('[data-cancelar]')?.addEventListener('click', () => { editandoEndereco = false; aoMudar(false); });
    box.querySelector('[data-excluir]')?.addEventListener('click', () => {
      const senha = prompt('Para excluir sua conta e seus dados de cadastro, digite sua senha.\nOs pedidos já feitos continuam registrados, como exige a lei.');
      if (senha) enviar('excluirConta', { token: token(), senha }, aoMudar);
    });
    const form = box.querySelector('form');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      let extra = {};
      // CEP mudou: busca cidade/UF no ViaCEP para o frete funcionar na próxima compra
      if (d.cep && d.cep.replace(/\D/g, '') !== String(p.cep).replace(/\D/g, '')) {
        try { const v = await DR.buscarCEP(d.cep); extra = { cep: v.cep, cidade: v.localidade, uf: v.uf }; }
        catch (er) { erro = er.message; aoMudar(false); return; }
      }
      enviar('salvarEndereco', { token: token(), ...d, ...extra }, aoMudar, form);
    };
  }

  return { sessao, perfil, token, primeiroNome, carregar, lembrarEntrega, render, sair };
})();
