/* DA RUA — API de pedidos (Google Apps Script)
   Cole este código em: Planilha → Extensões → Apps Script, e implante como "App da Web".
   Ele recebe os pedidos do site, salva na aba "pedidos", dá baixa no estoque da aba "camisas"
   e atende a página do vendedor. */

// ⚠️ Troque a senha AQUI no editor do Google (não no GitHub). É a senha da página do vendedor.
const SENHA = 'TROQUE_ESTA_SENHA';

const PERSONALIZACAO_PRECO = 30;   // igual ao js/config.js do site
const PIX_PRAZO_HORAS = 24;        // igual ao js/config.js: pedido Pix não pago nesse prazo é cancelado e o estoque volta
const TAMANHOS = ['P', 'M', 'G', 'GG', 'XGG'];
const CATEGORIAS = ['Brasileirão', 'Sul-Americano', 'Europeu', 'Seleções', 'Retrô'];
const TIPOS = ['Torcedor', 'Jogador', 'Retrô', 'Treino'];
const PASTA_FOTOS = 'DA RUA - fotos';
// Modelos do Gemini, do preferido ao reserva (o Flash-Lite tem mais cota grátis por dia).
// Se o Google aposentar todos, o script pergunta ao Google quais existem e usa um "flash" disponível.
// Para forçar um modelo, crie a propriedade GEMINI_MODELO no script.
const GEMINI_MODELOS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/';

function chamarGemini(modelo, chave, corpo) {
  return UrlFetchApp.fetch(GEMINI_URL + 'models/' + modelo + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': chave }, payload: JSON.stringify(corpo)
  });
}

// Lista de modelos a tentar: o forçado, o último que funcionou, a lista fixa e os "flash" que o Google disser que existem
function modelosGemini(chave) {
  const props = PropertiesService.getScriptProperties();
  const lista = [props.getProperty('GEMINI_MODELO'), props.getProperty('GEMINI_MODELO_OK')].concat(GEMINI_MODELOS);
  try {
    const r = UrlFetchApp.fetch(GEMINI_URL + 'models?pageSize=200', { muteHttpExceptions: true, headers: { 'x-goog-api-key': chave } });
    if (r.getResponseCode() === 200) {
      (JSON.parse(r.getContentText()).models || [])
        .filter(function (m) {
          const n = String(m.name);
          return /flash/.test(n) && !/image|tts|audio|live|preview|exp/.test(n) &&
            (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
        })
        .map(function (m) { return String(m.name).replace('models/', ''); })
        .sort().reverse()   // versão mais nova primeiro
        .forEach(function (n) { lista.push(n); });
    }
  } catch (e) { }
  return lista.filter(function (m, i) { return m && lista.indexOf(m) === i; }).slice(0, 8);
}
const STATUS = ['Aguardando Pix', 'Novo', 'Pago', 'Enviado', 'Entregue', 'Cancelado'];
const ABA_CAMISAS = 'camisas';
const ABA_PEDIDOS = 'pedidos';
const CAB_PEDIDOS = ['numero', 'data', 'status', 'pagamento', 'cliente', 'telefone', 'email', 'itens',
  'subtotal', 'frete_tipo', 'frete_valor', 'total', 'cep', 'endereco', 'cidade', 'uf', 'itens_json'];

// ---------------- entrada ----------------
function doGet() {
  return json({ ok: true, msg: 'API DA RUA funcionando' });
}

function doPost(e) {
  let resp;
  try {
    const req = JSON.parse(e.postData.contents);
    const rotas = {
      pedido: criarPedido, acompanhar: acompanharPedidos, listar: listarPedidos, status: mudarStatus,
      identificar: identificarCamisa, cadastrar: cadastrarCamisa,
      criarConta: criarConta, entrar: entrarConta, conta: verConta, salvarEndereco: salvarEndereco,
      excluirConta: excluirConta, recuperar: recuperarSenha, redefinir: redefinirSenha,
      solicitar: criarSolicitacao, solicitacoes: listarSolicitacoes, statusSolicitacao: mudarStatusSolicitacao
    };
    if (!rotas[req.acao]) throw new Error('Ação inválida.');
    resp = rotas[req.acao](req);
  } catch (err) {
    resp = { ok: false, erro: String(err.message || err) };
  }
  return json(resp);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- utilidades ----------------
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s) || 0;
}

function texto(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 200);
}

function conferirSenha(req) {
  if (!req.senha || req.senha !== SENHA) throw new Error('Senha incorreta.');
}

function lerCamisas() {
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_CAMISAS);
  if (!sh) throw new Error('Aba "camisas" não encontrada.');
  const v = sh.getDataRange().getValues();
  const col = {};
  v[0].forEach(function (c, i) { col[String(c).trim()] = i; });
  const linhaDe = {};
  for (let i = 1; i < v.length; i++) linhaDe[String(v[i][col.id]).trim()] = i;
  return { sh: sh, v: v, col: col, linhaDe: linhaDe };
}

function abaPedidos() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_PEDIDOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_PEDIDOS);
    sh.appendRow(CAB_PEDIDOS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CAB_PEDIDOS.length).setFontWeight('bold').setBackground('#0b0b0b').setFontColor('#ffffff');
  }
  return sh;
}

// soma (sinal +1) ou desconta (sinal -1) o estoque dos itens de um pedido
function movimentarEstoque(itens, sinal) {
  const c = lerCamisas();
  itens.forEach(function (it) {
    if (it.enc) return;   // sob encomenda não tem estoque na loja
    const i = c.linhaDe[it.id];
    if (i === undefined || c.col[it.t] === undefined) return;
    const cel = c.sh.getRange(i + 1, c.col[it.t] + 1);
    cel.setValue(Math.max(0, num(cel.getValue()) + sinal * it.qtd));
  });
}

// ---------------- pedido novo (vem do site) ----------------
function criarPedido(req) {
  const cli = req.cliente || {};
  // cliente logado: o pedido fica ligado ao e-mail da conta
  if (req.conta) { try { cli.email = clienteDoToken(req.conta).email; } catch (e) { } }
  const nome = texto(cli.nome, 80);
  const telefone = texto(cli.telefone, 20);
  if (!nome) throw new Error('Informe seu nome.');
  if (String(telefone).replace(/\D/g, '').length < 10) throw new Error('Informe um telefone com DDD.');
  if (['pix', 'entrega'].indexOf(req.pagamento) < 0) throw new Error('Forma de pagamento inválida.');
  if (!Array.isArray(req.itens) || !req.itens.length) throw new Error('Carrinho vazio.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);   // dois pedidos ao mesmo tempo não vendem a mesma camisa
  try {
    cancelarPixVencidos();   // libera as camisas de Pix vencido antes de conferir o estoque
    const c = lerCamisas();
    const precisa = {};
    const itens = [];
    let subtotal = 0;

    req.itens.forEach(function (it) {
      const qtd = parseInt(it.qtd, 10);
      if (TAMANHOS.indexOf(it.t) < 0 || !(qtd > 0 && qtd <= 20)) throw new Error('Item inválido no carrinho.');
      const i = c.linhaDe[String(it.id)];
      if (i === undefined) throw new Error('Uma camisa do carrinho não existe mais. Atualize a página.');
      const row = c.v[i];
      const nomeCamisa = String(row[c.col.nome]);
      if (String(row[c.col.ativo]).trim().toUpperCase() === 'NAO') throw new Error(nomeCamisa + ' não está mais disponível.');

      // sob encomenda (coluna "encomenda" = SIM): não confere estoque, só exige Pix
      const enc = c.col.encomenda !== undefined && String(row[c.col.encomenda]).trim().toUpperCase() === 'SIM';
      if (enc && req.pagamento !== 'pix') throw new Error('Camisa sob encomenda é paga por Pix na hora do pedido.');
      if (enc && qtd > 10) throw new Error('Encomenda de até 10 camisas por tamanho. Para mais, fale com a gente.');
      const key = it.id + '|' + it.t;
      precisa[key] = (precisa[key] || 0) + qtd;
      if (!enc && num(row[c.col[it.t]]) < precisa[key]) {
        throw new Error('Estoque insuficiente: ' + nomeCamisa + ' tamanho ' + it.t + '. Atualize a página e ajuste o carrinho.');
      }

      // o preço é recalculado pela planilha, não confiamos no valor vindo do navegador
      const preco = num(row[c.col.preco]);
      const promo = num(row[c.col.preco_promo]);
      const perso = it.perso ? { nome: texto(it.perso.nome, 12), num: texto(it.perso.num, 2) } : null;
      const unit = (promo > 0 && promo < preco ? promo : preco) + (perso ? PERSONALIZACAO_PRECO : 0);
      subtotal += unit * qtd;
      const item = { id: String(it.id), nome: nomeCamisa, t: it.t, qtd: qtd, unit: unit, perso: perso };
      if (enc) {
        item.enc = true;
        if (c.col.fornecedor !== undefined) item.forn = texto(row[c.col.fornecedor], 300);   // link do álbum, só o vendedor vê
      }
      itens.push(item);
    });

    const f = req.frete || {};
    const freteValor = Math.max(0, num(f.valor));
    subtotal = Math.round(subtotal * 100) / 100;
    const total = Math.round((subtotal + freteValor) * 100) / 100;

    movimentarEstoque(itens, -1);

    const sh = abaPedidos();
    const ultimo = sh.getLastRow() > 1 ? num(sh.getRange(sh.getLastRow(), 1).getValue()) : 1000;
    const numero = ultimo + 1;
    const resumo = itens.map(function (i) {
      return (i.enc ? '[ENCOMENDA] ' : '') + i.qtd + 'x ' + i.nome + ' (' + i.t + ')' + (i.perso ? ' [' + [i.perso.nome, i.perso.num].join(' ').trim() + ']' : '');
    }).join('; ');

    sh.appendRow([
      numero, new Date(), req.pagamento === 'pix' ? 'Aguardando Pix' : 'Novo',
      req.pagamento === 'pix' ? 'Pix' : 'Na entrega',
      nome, "'" + telefone, texto(cli.email, 80), resumo,
      subtotal, texto(f.tipo, 60), freteValor, total,
      "'" + texto(f.cep, 9), texto(f.endereco, 150), texto(f.cidade, 60), texto(f.uf, 2),
      JSON.stringify(itens)
    ]);

    return { ok: true, numero: numero, total: total };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- acompanhamento (cliente) ----------------
// O cliente prova que o pedido é dele informando o WhatsApp usado na compra.
// Recebe { consultas: [{ numero, telefone }] } e devolve só os pedidos que conferem.
function acompanharPedidos(req) {
  comTrava(cancelarPixVencidos);
  const consultas = Array.isArray(req.consultas) ? req.consultas.slice(0, 20) : [];
  const v = abaPedidos().getDataRange().getValues();
  const col = {};
  v[0].forEach(function (c, i) { col[c] = i; });

  const pedidos = [];
  consultas.forEach(function (q) {
    for (let i = 1; i < v.length; i++) {
      const row = v[i];
      if (num(row[col.numero]) !== num(q.numero)) continue;
      if (!telefoneConfere(String(row[col.telefone]), String(q.telefone || ''))) break;
      let itens = [];
      try { itens = JSON.parse(row[col.itens_json]); } catch (e) { }
      // nada de telefone ou endereço na resposta
      pedidos.push({
        numero: num(row[col.numero]), data: row[col.data], status: row[col.status],
        pagamento: row[col.pagamento], frete_tipo: row[col.frete_tipo], frete_valor: num(row[col.frete_valor]),
        subtotal: num(row[col.subtotal]), total: num(row[col.total]),
        itens: itens.map(function (it) { return { nome: it.nome, t: it.t, qtd: it.qtd, unit: it.unit, perso: it.perso, enc: !!it.enc }; })
      });
      break;
    }
  });
  // consulta única que não confere: mesma mensagem para número inexistente ou telefone errado
  if (consultas.length === 1 && !pedidos.length) throw new Error('Pedido não encontrado. Confira o número e o WhatsApp usados na compra.');
  return { ok: true, pedidos: pedidos };
}

// Decide se o telefone digitado na consulta é o mesmo salvo no pedido.
function telefoneConfere(salvo, informado) {
  const a = salvo.replace(/\D/g, '');
  const b = informado.replace(/\D/g, '');
  if (b.length < 8) return false;
  return a.slice(-8) === b.slice(-8);
}

// ---------------- página do vendedor ----------------
function listarPedidos(req) {
  conferirSenha(req);
  comTrava(cancelarPixVencidos);
  const sh = abaPedidos();
  const v = sh.getDataRange().getValues();
  const cab = v[0];
  const pedidos = v.slice(1).map(function (row) {
    const o = {};
    cab.forEach(function (c, i) { o[c] = row[i]; });
    try { o.itens_json = JSON.parse(o.itens_json); } catch (e) { o.itens_json = []; }
    o.telefone = String(o.telefone);
    o.cep = String(o.cep);
    return o;
  }).reverse();
  return { ok: true, pedidos: pedidos };
}

function mudarStatus(req) {
  conferirSenha(req);
  if (STATUS.indexOf(req.status) < 0) throw new Error('Status inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaPedidos();
    const v = sh.getDataRange().getValues();
    const col = {};
    v[0].forEach(function (c, i) { col[c] = i; });
    for (let i = 1; i < v.length; i++) {
      if (num(v[i][col.numero]) !== num(req.numero)) continue;
      const antes = v[i][col.status];
      const itens = JSON.parse(v[i][col.itens_json] || '[]');
      // cancelar devolve as camisas ao estoque; tirar do cancelado desconta de novo
      if (req.status === 'Cancelado' && antes !== 'Cancelado') movimentarEstoque(itens, +1);
      if (antes === 'Cancelado' && req.status !== 'Cancelado') movimentarEstoque(itens, -1);
      sh.getRange(i + 1, col.status + 1).setValue(req.status);
      return { ok: true };
    }
    throw new Error('Pedido não encontrado.');
  } finally {
    lock.releaseLock();
  }
}

// ---------------- cadastro de camisa por foto (IA Gemini, plano grátis) ----------------
// A chave fica em: Apps Script → Configurações do projeto → Propriedades do script → GEMINI_KEY

const PROMPT_CAMISA = [
  'Você é o assistente de cadastro de uma loja brasileira de camisas de time.',
  'Olhe a foto e identifique a camisa. Use a busca do Google para confirmar time, temporada e se é a camisa 1 (home), 2 (away), 3 (third), de treino ou retrô.',
  'Responda APENAS com um objeto JSON, sem texto antes ou depois, com estes campos:',
  '{',
  '  "nome": "ex.: Grêmio 24/25 Home",',
  '  "time": "nome do time ou seleção em português, ex.: Seleção Brasileira",',
  '  "categoria": "uma de: ' + CATEGORIAS.join(', ') + '",',
  '  "temporada": "ex.: 24/25 para clubes, 2024 para seleções",',
  '  "tipo": "uma de: ' + TIPOS.join(', ') + '",',
  '  "cor1": "cor principal em hexadecimal, ex.: #0d80bf",',
  '  "cor2": "cor secundária em hexadecimal",',
  '  "listras": "SIM se a camisa tem listras verticais, senão NAO",',
  '  "descricao": "2 frases em português sobre a camisa (cores, detalhes do design, temporada)",',
  '  "confianca": "alta, media ou baixa",',
  '  "observacao": "se houver dúvida (ex.: duas temporadas parecidas), explique em uma frase; senão vazio"',
  '}',
  'Regras: Brasileirão = clubes brasileiros; Sul-Americano = clubes da América do Sul fora do Brasil; Europeu = clubes da Europa e do resto do mundo; Seleções = seleções nacionais; Retrô = camisas de temporadas antigas (antes de 2015).',
  'Na descrição, não diga que a camisa é oficial, original ou licenciada, não cite preço e não invente tecnologia de tecido.',
  'Se a foto não for de uma camisa de time, responda {"erro": "explique o motivo"}.'
].join('\n');

function identificarCamisa(req) {
  conferirSenha(req);
  const props = PropertiesService.getScriptProperties();
  const chave = props.getProperty('GEMINI_KEY');
  if (!chave) throw new Error('Falta a chave do Gemini (GEMINI_KEY) nas propriedades do script.');
  if (!req.imagem || String(req.imagem).length > 4e6) throw new Error('Foto inválida ou grande demais.');

  // pensar = false pede raciocínio curto (bem mais rápido); modelos que não aceitam a opção recebem o pedido sem ela
  const corpo = function (comBusca, pensarPouco) {
    const b = { contents: [{ parts: [
      { text: PROMPT_CAMISA },
      { inline_data: { mime_type: req.mime || 'image/jpeg', data: req.imagem } }
    ] }] };
    if (comBusca) b.tools = [{ google_search: {} }];
    if (pensarPouco) b.generationConfig = { thinkingConfig: { thinkingLevel: 'low' } };
    return b;
  };

  // Tenta os modelos em ordem. Modelo aposentado (404) ou cota grátis esgotada (429) passa para o próximo;
  // o primeiro que funcionar fica guardado para as próximas vezes.
  // "tentativas" registra modelo, código e tempo de cada chamada, para achar lentidão.
  let resp = null, ultimo = 0, usado = '';
  const tentativas = [];
  const tentar = function (modelo, comBusca, pensarPouco) {
    const t0 = Date.now();
    const r = chamarGemini(modelo, chave, corpo(comBusca, pensarPouco));
    tentativas.push(modelo + (comBusca ? '+busca' : '') + (pensarPouco ? '+rapido' : '') + ' ' + r.getResponseCode() + ' ' + Math.round((Date.now() - t0) / 1000) + 's');
    return r;
  };
  const modelos = modelosGemini(chave);
  for (let i = 0; i < modelos.length && !resp; i++) {
    // a busca do Google tem cota grátis própria (429 quando acaba): aí identifica só pela foto, ainda com raciocínio curto.
    // 400 = o modelo não aceita a opção de raciocínio curto; repete sem ela.
    let r = tentar(modelos[i], true, true);
    if (r.getResponseCode() === 429) r = tentar(modelos[i], false, true);
    if (r.getResponseCode() === 400) r = tentar(modelos[i], false, false);
    ultimo = r.getResponseCode();
    if (ultimo === 200) {
      resp = r;
      usado = modelos[i];
      if (props.getProperty('GEMINI_MODELO_OK') !== usado) props.setProperty('GEMINI_MODELO_OK', usado);
    }
  }
  console.log('identificar: ' + tentativas.join(' | '));
  if (!resp && ultimo === 429) throw new Error('A IA atingiu o limite grátis por agora. Tente de novo mais tarde ou preencha à mão.');
  if (!resp) throw new Error('A IA não respondeu (erro ' + ultimo + '). Preencha à mão.');

  const cand = (JSON.parse(resp.getContentText()).candidates || [])[0];
  const txt = ((cand && cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('');
  // com a busca do Google ligada o Gemini não aceita "modo JSON", então pegamos o primeiro {...} do texto
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('A IA não conseguiu identificar a camisa. Tente outra foto ou preencha à mão.');
  let d;
  try { d = JSON.parse(m[0]); } catch (e) { throw new Error('A IA respondeu num formato estranho. Tente de novo.'); }
  if (d.erro) throw new Error(texto(d.erro, 200));

  const hex = function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : ''; };
  return {
    ok: true,
    camisa: {
      nome: texto(d.nome, 80), time: texto(d.time, 60), temporada: texto(d.temporada, 10),
      categoria: CATEGORIAS.indexOf(d.categoria) >= 0 ? d.categoria : '',
      tipo: TIPOS.indexOf(d.tipo) >= 0 ? d.tipo : 'Torcedor',
      cor1: hex(d.cor1), cor2: hex(d.cor2),
      listras: String(d.listras).toUpperCase() === 'SIM' ? 'SIM' : 'NAO',
      descricao: texto(d.descricao, 400)
    },
    confianca: texto(d.confianca, 10),
    observacao: texto(d.observacao, 200),
    modelo: usado,
    tentativas: tentativas
  };
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

// Salva a foto numa pasta do Drive aberta para visualização e devolve um link que funciona em <img>
function salvarFoto(base64, mime, nome) {
  const pastas = DriveApp.getFoldersByName(PASTA_FOTOS);
  const pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_FOTOS);
  const ext = mime === 'image/png' ? '.png' : '.jpg';
  const arq = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime, nome + ext));
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + arq.getId();
}

function cadastrarCamisa(req) {
  conferirSenha(req);
  const cm = req.camisa || {};
  const nome = texto(cm.nome, 80);
  if (!nome) throw new Error('Informe o nome da camisa.');
  if (CATEGORIAS.indexOf(cm.categoria) < 0) throw new Error('Escolha a categoria.');
  const preco = num(cm.preco);
  if (!(preco > 0)) throw new Error('Informe o preço.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const c = lerCamisas();
    // id único: nome em minúsculas sem acento; se já existir, ganha -2, -3...
    const base = slug(nome) || 'camisa';
    let id = base, n = 2;
    while (c.linhaDe[id] !== undefined) id = base + '-' + n++;

    const foto = req.foto ? salvarFoto(req.foto, req.mime || 'image/jpeg', id) : '';
    const promo = num(cm.preco_promo);
    const valores = {
      id: id, nome: nome, time: texto(cm.time, 60), categoria: cm.categoria, temporada: texto(cm.temporada, 10),
      tipo: TIPOS.indexOf(cm.tipo) >= 0 ? cm.tipo : 'Torcedor',
      preco: preco, preco_promo: promo > 0 ? promo : '', foto: foto,
      cor1: texto(cm.cor1, 7), cor2: texto(cm.cor2, 7),
      listras: cm.listras === 'SIM' ? 'SIM' : 'NAO', descricao: texto(cm.descricao, 400),
      ativo: cm.ativo === 'NAO' ? 'NAO' : 'SIM', destaque: cm.destaque === 'SIM' ? 'SIM' : 'NAO',
      encomenda: cm.encomenda === 'SIM' ? 'SIM' : 'NAO', fornecedor: texto(cm.fornecedor, 300)
    };
    TAMANHOS.forEach(function (t) { valores[t] = cm.encomenda === 'SIM' ? 0 : Math.max(0, parseInt(cm[t], 10) || 0); });
    // planilha sem as colunas "encomenda" e "fornecedor": cria no fim da linha 1 na primeira camisa sob encomenda
    if (valores.encomenda === 'SIM') {
      ['encomenda', 'fornecedor'].forEach(function (nomeCol) {
        if (c.col[nomeCol] !== undefined) return;
        const n = c.v[0].length + 1;
        c.sh.getRange(1, n).setValue(nomeCol).setFontWeight('bold');
        c.v[0].push(nomeCol);
        c.col[nomeCol] = n - 1;
      });
    }

    const linha = c.v[0].map(function (cab) {
      const k = String(cab).trim();
      return valores[k] !== undefined ? valores[k] : '';
    });
    const nova = c.sh.getLastRow() + 1;
    c.sh.getRange(nova, 1, 1, linha.length).setValues([linha]);
    // a coluna "total" soma os tamanhos, igual às outras linhas
    if (c.col.total !== undefined && c.col.P !== undefined && c.col.XGG !== undefined) {
      const letra = function (i) { return c.sh.getRange(1, i + 1).getA1Notation().replace(/\d+/g, ''); };
      c.sh.getRange(nova, c.col.total + 1).setFormula('=SUM(' + letra(c.col.P) + nova + ':' + letra(c.col.XGG) + nova + ')');
    }
    return { ok: true, id: id, foto: foto };
  } finally {
    lock.releaseLock();
  }
}

// Rode esta função UMA vez pelo editor (botão ▶ Executar) para o Google pedir as permissões novas
// (salvar fotos no Drive e falar com a IA). Depois é só implantar uma nova versão.
function autorizar() {
  DriveApp.getRootFolder();
  const chave = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!chave) { Logger.log('Falta criar a propriedade GEMINI_KEY.'); return; }
  const corpo = { contents: [{ parts: [{ text: 'Responda só: ok' }] }] };
  const modelos = modelosGemini(chave);
  for (let i = 0; i < modelos.length; i++) {
    const r = chamarGemini(modelos[i], chave, corpo);
    Logger.log(modelos[i] + ' → ' + (r.getResponseCode() === 200 ? 'FUNCIONA ✓' : 'erro ' + r.getResponseCode()));
    if (r.getResponseCode() === 200) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_MODELO_OK', modelos[i]);
      Logger.log('Tudo certo! O cadastro por foto vai usar: ' + modelos[i]);
      return;
    }
  }
  Logger.log('Nenhum modelo funcionou. Confira se a chave GEMINI_KEY está certa.');
}

// ---------------- cancelamento automático do Pix não pago ----------------
function comTrava(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Cancela pedidos "Aguardando Pix" com mais de PIX_PRAZO_HORAS e devolve as camisas ao estoque.
// Quem chama precisa estar com a trava (criarPedido já está; os outros usam comTrava).
// Se o cliente pagar depois, é só o vendedor mudar para "Pago": o estoque é descontado de novo.
function cancelarPixVencidos() {
  const sh = abaPedidos();
  const v = sh.getDataRange().getValues();
  const col = {};
  v[0].forEach(function (c, i) { col[c] = i; });
  const limite = Date.now() - PIX_PRAZO_HORAS * 3600 * 1000;
  let n = 0;
  for (let i = 1; i < v.length; i++) {
    if (v[i][col.status] !== 'Aguardando Pix') continue;
    const data = new Date(v[i][col.data]).getTime();
    if (!(data < limite)) continue;
    let itens = [];
    try { itens = JSON.parse(v[i][col.itens_json] || '[]'); } catch (e) { }
    movimentarEstoque(itens, +1);
    sh.getRange(i + 1, col.status + 1).setValue('Cancelado');
    n++;
  }
  return n;
}

// Roda de hora em hora pelo gatilho (veja instalarGatilho), para o estoque voltar mesmo sem ninguém mexer no site
function cancelarPixVencidosAgendado() {
  const n = comTrava(cancelarPixVencidos);
  if (n) console.log(n + ' pedido(s) Pix vencido(s) cancelado(s).');
  const s = comTrava(limparSolicitacoesAntigas);
  if (s) console.log(s + ' solicitação(ões) antiga(s) apagada(s).');
}

// Rode UMA vez pelo editor (▶ Executar) para criar o gatilho de hora em hora
function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cancelarPixVencidosAgendado') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cancelarPixVencidosAgendado').timeBased().everyHours(1).create();
  Logger.log('Pronto: pedidos Pix não pagos em ' + PIX_PRAZO_HORAS + 'h serão cancelados automaticamente.');
}

// ---------------- contas de cliente ----------------
// Aba "clientes": a senha nunca é guardada, só o resultado do embaralhamento (hash SHA-256 com sal).
// A sessão é um token assinado (id.validade.assinatura): não precisa ser guardado na planilha,
// e trocar a senha invalida todas as sessões abertas.
const ABA_CLIENTES = 'clientes';
const CAB_CLIENTES = ['id', 'email', 'nome', 'telefone', 'senha_hash', 'sal', 'cep', 'endereco', 'cidade', 'uf', 'criado'];
const SESSAO_DIAS = 30;

function abaClientes() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_CLIENTES);
  if (!sh) {
    sh = ss.insertSheet(ABA_CLIENTES);
    sh.appendRow(CAB_CLIENTES);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CAB_CLIENTES.length).setFontWeight('bold').setBackground('#0b0b0b').setFontColor('#ffffff');
  }
  return sh;
}

function hex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashSenha(senha, sal) {
  let h = sal + ':' + senha;
  for (let i = 0; i < 300; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}

function segredo() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SEGREDO_SESSAO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SEGREDO_SESSAO', s); }
  return s;
}

function assinar(texto) {
  return hex(Utilities.computeHmacSha256Signature(texto, segredo())).slice(0, 32);
}

function lerClientes() {
  const sh = abaClientes();
  const v = sh.getDataRange().getValues();
  const col = {};
  v[0].forEach(function (c, i) { col[c] = i; });
  return { sh: sh, v: v, col: col };
}

function acharCliente(c, campo, valor) {
  for (let i = 1; i < c.v.length; i++) if (String(c.v[i][c.col[campo]]) === String(valor)) return i;
  return -1;
}

function perfilDe(c, i) {
  const r = c.v[i], col = c.col;
  return {
    nome: r[col.nome], email: r[col.email], telefone: String(r[col.telefone]),
    cep: String(r[col.cep]), endereco: r[col.endereco], cidade: r[col.cidade], uf: r[col.uf]
  };
}

function emitirToken(c, i) {
  const id = c.v[i][c.col.id];
  const validade = Date.now() + SESSAO_DIAS * 86400000;
  const base = id + '.' + validade;
  return base + '.' + assinar(base + '.' + c.v[i][c.col.senha_hash]);
}

// Confere o token e devolve { c, i, email }; erro se for inválido ou vencido
function clienteDoToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || Number(partes[1]) < Date.now()) throw new Error('Sua sessão expirou. Entre de novo.');
  const c = lerClientes();
  const i = acharCliente(c, 'id', partes[0]);
  if (i < 0 || assinar(partes[0] + '.' + partes[1] + '.' + c.v[i][c.col.senha_hash]) !== partes[2]) throw new Error('Sua sessão expirou. Entre de novo.');
  return { c: c, i: i, email: c.v[i][c.col.email] };
}

const emailValido = function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); };

// no máximo 5 senhas erradas por e-mail a cada 15 minutos
function conferirTentativas(email, errou) {
  const cache = CacheService.getScriptCache();
  const chave = 'tent_' + email;
  const n = Number(cache.get(chave) || 0);
  if (n >= 5) throw new Error('Muitas tentativas. Espere 15 minutos ou use "Esqueci minha senha".');
  if (errou) cache.put(chave, String(n + 1), 900);
}

function criarConta(req) {
  const email = texto(req.email, 80).toLowerCase();
  const nome = texto(req.nome, 80);
  const telefone = texto(req.telefone, 20);
  const senha = String(req.senha || '');
  if (!nome) throw new Error('Informe seu nome.');
  if (!emailValido(email)) throw new Error('E-mail inválido.');
  if (telefone.replace(/\D/g, '').length < 10) throw new Error('Informe um WhatsApp com DDD.');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (!req.aceite) throw new Error('Para criar a conta, aceite os Termos e a Política de privacidade.');
  return comTrava(function () {
    const c = lerClientes();
    if (acharCliente(c, 'email', email) >= 0) throw new Error('Já existe uma conta com esse e-mail. Entre ou use "Esqueci minha senha".');
    const sal = Utilities.getUuid();
    c.sh.appendRow([Utilities.getUuid().slice(0, 8), email, nome, "'" + telefone, hashSenha(senha, sal), sal, '', '', '', '', new Date()]);
    const novo = lerClientes();
    const i = acharCliente(novo, 'email', email);
    return { ok: true, token: emitirToken(novo, i), perfil: perfilDe(novo, i) };
  });
}

function entrarConta(req) {
  const email = texto(req.email, 80).toLowerCase();
  conferirTentativas(email, false);
  const c = lerClientes();
  const i = acharCliente(c, 'email', email);
  if (i < 0 || hashSenha(String(req.senha || ''), c.v[i][c.col.sal]) !== c.v[i][c.col.senha_hash]) {
    conferirTentativas(email, true);
    throw new Error('E-mail ou senha incorretos.');
  }
  return { ok: true, token: emitirToken(c, i), perfil: perfilDe(c, i) };
}

// Perfil + pedidos feitos com o e-mail da conta ou com o mesmo WhatsApp
function verConta(req) {
  const k = clienteDoToken(req.token);
  const perfil = perfilDe(k.c, k.i);
  comTrava(cancelarPixVencidos);
  const v = abaPedidos().getDataRange().getValues();
  const col = {};
  v[0].forEach(function (c, i) { col[c] = i; });
  const pedidos = [];
  for (let i = v.length - 1; i >= 1; i--) {
    const row = v[i];
    const doEmail = String(row[col.email]).toLowerCase() === perfil.email;
    if (!doEmail && !telefoneConfere(String(row[col.telefone]), perfil.telefone)) continue;
    let itens = [];
    try { itens = JSON.parse(row[col.itens_json]); } catch (e) { }
    pedidos.push({
      numero: num(row[col.numero]), data: row[col.data], status: row[col.status],
      pagamento: row[col.pagamento], frete_tipo: row[col.frete_tipo], frete_valor: num(row[col.frete_valor]),
      subtotal: num(row[col.subtotal]), total: num(row[col.total]),
      itens: itens.map(function (it) { return { nome: it.nome, t: it.t, qtd: it.qtd, unit: it.unit, perso: it.perso, enc: !!it.enc }; })
    });
  }
  return { ok: true, perfil: perfil, pedidos: pedidos };
}

function salvarEndereco(req) {
  return comTrava(function () {
    const k = clienteDoToken(req.token);
    const linha = k.i + 1, col = k.c.col;
    const campos = { nome: texto(req.nome, 80), telefone: texto(req.telefone, 20), cep: texto(req.cep, 9),
      endereco: texto(req.endereco, 150), cidade: texto(req.cidade, 60), uf: texto(req.uf, 2) };
    Object.keys(campos).forEach(function (c) {
      if (!campos[c]) return;
      k.c.sh.getRange(linha, col[c] + 1).setValue(c === 'telefone' || c === 'cep' ? "'" + campos[c] : campos[c]);
    });
    const c = lerClientes();
    return { ok: true, perfil: perfilDe(c, acharCliente(c, 'email', k.email)) };
  });
}

// LGPD: o cliente pode apagar a própria conta (os pedidos continuam, por obrigação legal e fiscal)
function excluirConta(req) {
  return comTrava(function () {
    const k = clienteDoToken(req.token);
    if (hashSenha(String(req.senha || ''), k.c.v[k.i][k.c.col.sal]) !== k.c.v[k.i][k.c.col.senha_hash]) throw new Error('Senha incorreta.');
    k.c.sh.deleteRow(k.i + 1);
    return { ok: true };
  });
}

function recuperarSenha(req) {
  const email = texto(req.email, 80).toLowerCase();
  const c = lerClientes();
  // mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados
  if (acharCliente(c, 'email', email) >= 0) {
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    CacheService.getScriptCache().put('rec_' + email, codigo, 900);
    MailApp.sendEmail(email, 'DA RUA — código para criar uma nova senha',
      'Seu código é ' + codigo + '. Ele vale por 15 minutos.\n\nSe não foi você que pediu, ignore este e-mail.');
  }
  return { ok: true };
}

function redefinirSenha(req) {
  const email = texto(req.email, 80).toLowerCase();
  const cache = CacheService.getScriptCache();
  conferirTentativas(email, false);
  if (!req.codigo || cache.get('rec_' + email) !== String(req.codigo).trim()) {
    conferirTentativas(email, true);
    throw new Error('Código inválido ou vencido.');
  }
  if (String(req.senha || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  return comTrava(function () {
    const c = lerClientes();
    const i = acharCliente(c, 'email', email);
    if (i < 0) throw new Error('Conta não encontrada.');
    const sal = Utilities.getUuid();
    c.sh.getRange(i + 1, c.col.senha_hash + 1, 1, 2).setValues([[hashSenha(req.senha, sal), sal]]);
    cache.remove('rec_' + email);
    const novo = lerClientes();
    return { ok: true, token: emitirToken(novo, i), perfil: perfilDe(novo, i) };
  });
}


// ---------------- "Peça a sua": o cliente pede uma camisa que não está no site ----------------
// Fica na aba "solicitacoes"; a imagem vai para a pasta do Drive "DA RUA - solicitações".
// Endereço público: tem limite de tamanho da imagem, de envios por telefone e de envios por hora.
const ABA_SOLICITACOES = 'solicitacoes';
const PASTA_SOLICITACOES = 'DA RUA - solicitações';
const CAB_SOLICITACOES = ['id', 'data', 'status', 'cliente', 'telefone', 'tamanho', 'descricao', 'foto'];
const STATUS_SOLICITACAO = ['Nova', 'Respondida', 'Virou pedido', 'Recusada'];
const SOLICITACOES_POR_HORA = 30;

function abaSolicitacoes() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_SOLICITACOES);
  if (!sh) {
    sh = ss.insertSheet(ABA_SOLICITACOES);
    sh.appendRow(CAB_SOLICITACOES);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CAB_SOLICITACOES.length).setFontWeight('bold').setBackground('#0b0b0b').setFontColor('#ffffff');
  }
  return sh;
}

function criarSolicitacao(req) {
  const nome = texto(req.nome, 80);
  const telefone = texto(req.telefone, 20);
  const descricao = texto(req.descricao, 400);
  const tamanho = TAMANHOS.indexOf(req.tamanho) >= 0 ? req.tamanho : '';
  if (!nome) throw new Error('Informe seu nome.');
  const dig = String(telefone).replace(/\D/g, '');
  if (dig.length < 10) throw new Error('Informe seu WhatsApp com DDD.');
  if (!req.imagem && descricao.length < 3) throw new Error('Mande a imagem ou escreva qual camisa você quer.');
  if (req.imagem && (String(req.imagem).length > 1500000 || ['image/jpeg', 'image/png'].indexOf(req.mime) < 0)) {
    throw new Error('Imagem inválida ou grande demais.');
  }

  // freio contra abuso: 3 por telefone a cada 6 horas e no máximo SOLICITACOES_POR_HORA no total
  const cache = CacheService.getScriptCache();
  const chaveTel = 'sol_' + dig.slice(-9);
  const doTel = num(cache.get(chaveTel));
  const hora = 'sol_hora_' + Math.floor(Date.now() / 3600000);
  const naHora = num(cache.get(hora));
  if (doTel >= 3) throw new Error('Você já mandou algumas solicitações. Fale com a gente pelo WhatsApp.');
  if (naHora >= SOLICITACOES_POR_HORA) throw new Error('Muitas solicitações agora. Tente de novo mais tarde ou chame no WhatsApp.');

  return comTrava(function () {
    const sh = abaSolicitacoes();
    // contador guardado à parte: apagar solicitações antigas não faz um número se repetir
    const props = PropertiesService.getScriptProperties();
    const naPlanilha = sh.getLastRow() > 1 ? num(String(sh.getRange(sh.getLastRow(), 1).getValue()).replace(/\D/g, '')) : 0;
    const proximo = Math.max(num(props.getProperty('SOL_ULTIMO')), naPlanilha) + 1;
    props.setProperty('SOL_ULTIMO', String(proximo));
    const id = 'S' + proximo;
    let foto = '';
    if (req.imagem) {
      const pastas = DriveApp.getFoldersByName(PASTA_SOLICITACOES);
      const pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_SOLICITACOES);
      const arq = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(req.imagem), req.mime, id + (req.mime === 'image/png' ? '.png' : '.jpg')));
      arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      foto = 'https://lh3.googleusercontent.com/d/' + arq.getId();
    }
    sh.appendRow([id, new Date(), 'Nova', nome, "'" + telefone, tamanho, descricao, foto]);
    cache.put(chaveTel, String(doTel + 1), 6 * 3600);
    cache.put(hora, String(naHora + 1), 3600);
    return { ok: true, id: id };
  });
}

function listarSolicitacoes(req) {
  conferirSenha(req);
  const v = abaSolicitacoes().getDataRange().getValues();
  const cab = v[0];
  const lista = v.slice(1).map(function (row) {
    const o = {};
    cab.forEach(function (c, i) { o[c] = row[i]; });
    o.telefone = String(o.telefone);
    return o;
  }).reverse();
  return { ok: true, solicitacoes: lista };
}

function mudarStatusSolicitacao(req) {
  conferirSenha(req);
  if (STATUS_SOLICITACAO.indexOf(req.status) < 0) throw new Error('Status inválido.');
  return comTrava(function () {
    const sh = abaSolicitacoes();
    const v = sh.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) {
      if (String(v[i][0]) !== String(req.id)) continue;
      sh.getRange(i + 1, 3).setValue(req.status);
      return { ok: true };
    }
    throw new Error('Solicitação não encontrada.');
  });
}

// Política de privacidade: solicitação que não virou pedido é apagada (com a imagem) em até 6 meses.
// Roda junto do gatilho de hora em hora.
const SOLICITACAO_DIAS = 180;
function limparSolicitacoesAntigas() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ABA_SOLICITACOES);
  if (!sh) return 0;
  const v = sh.getDataRange().getValues();
  const limite = Date.now() - SOLICITACAO_DIAS * 24 * 3600 * 1000;
  let n = 0;
  for (let i = v.length - 1; i >= 1; i--) {   // de baixo para cima, para apagar linhas sem bagunçar os índices
    if (v[i][2] === 'Virou pedido' || !(new Date(v[i][1]).getTime() < limite)) continue;
    const m = String(v[i][7] || '').match(/\/d\/([\w-]+)$/);
    if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { } }
    sh.deleteRow(i + 1);
    n++;
  }
  return n;
}
