/* DA RUA — página de políticas: preenche prazos e dados da loja a partir do js/config.js */
(() => {
  const cfg = DARUA_CONFIG;
  const emp = cfg.empresa || {};

  document.querySelectorAll('[data-cfg]').forEach(el => { el.textContent = cfg[el.dataset.cfg] ?? ''; });
  document.querySelectorAll('[data-cfg-encomenda]').forEach(el => { el.textContent = (cfg.encomenda && cfg.encomenda.prazo) || '20 a 35'; });

  // e-mail: some o trecho inteiro se a loja ainda não cadastrou
  document.querySelectorAll('[data-se="email"]').forEach(el => { el.hidden = !emp.email; });
  document.querySelectorAll('[data-cfg-email]').forEach(a => {
    a.textContent = emp.email;
    a.href = 'mailto:' + emp.email;
  });

  // WhatsApp com a mensagem já escrita
  const zap = String(cfg.whatsapp || '').replace(/\D/g, '');
  document.querySelectorAll('[data-zap]').forEach(a => {
    a.href = `https://wa.me/${zap}?text=${encodeURIComponent(a.dataset.zap)}`;
    a.target = '_blank';
    a.rel = 'noopener';
  });

  // bloco "dados da loja" no topo (Decreto 7.962/2013, art. 2º)
  const linhas = [
    emp.nome && ['Loja', emp.nome],
    emp.documento && [emp.documento.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF', emp.documento],
    emp.endereco && ['Endereço', emp.endereco],
    emp.email && ['E-mail', emp.email],
    zap && ['WhatsApp', '+' + zap]
  ].filter(Boolean);
  const box = document.getElementById('empresa');
  linhas.forEach(([rotulo, valor]) => {
    const p = document.createElement('p');
    const b = document.createElement('b');
    b.textContent = rotulo + ': ';
    p.append(b, valor);
    box.append(p);
  });
  box.hidden = !linhas.length;

  document.getElementById('ano').textContent = new Date().getFullYear();
})();
