/* DA RUA — API de pedidos (Google Apps Script)
   Cole este código em: Planilha → Extensões → Apps Script, e implante como "App da Web".
   Ele recebe os pedidos do site, salva na aba "pedidos", dá baixa no estoque da aba "camisas"
   e atende a página do vendedor. */

// ⚠️ Troque a senha AQUI no editor do Google (não no GitHub). É a senha da página do vendedor.
const SENHA = 'TROQUE_ESTA_SENHA';

const PERSONALIZACAO_PRECO = 30;   // igual ao js/config.js do site
const TAMANHOS = ['P', 'M', 'G', 'GG', 'XGG'];
const CATEGORIAS = ['Brasileirão', 'Europeu', 'Seleções', 'Retrô'];
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
      identificar: identificarCamisa, cadastrar: cadastrarCamisa
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
    const i = c.linhaDe[it.id];
    if (i === undefined || c.col[it.t] === undefined) return;
    const cel = c.sh.getRange(i + 1, c.col[it.t] + 1);
    cel.setValue(Math.max(0, num(cel.getValue()) + sinal * it.qtd));
  });
}

// ---------------- pedido novo (vem do site) ----------------
function criarPedido(req) {
  const cli = req.cliente || {};
  const nome = texto(cli.nome, 80);
  const telefone = texto(cli.telefone, 20);
  if (!nome) throw new Error('Informe seu nome.');
  if (String(telefone).replace(/\D/g, '').length < 10) throw new Error('Informe um telefone com DDD.');
  if (['pix', 'entrega'].indexOf(req.pagamento) < 0) throw new Error('Forma de pagamento inválida.');
  if (!Array.isArray(req.itens) || !req.itens.length) throw new Error('Carrinho vazio.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);   // dois pedidos ao mesmo tempo não vendem a mesma camisa
  try {
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

      const key = it.id + '|' + it.t;
      precisa[key] = (precisa[key] || 0) + qtd;
      if (num(row[c.col[it.t]]) < precisa[key]) {
        throw new Error('Estoque insuficiente: ' + nomeCamisa + ' tamanho ' + it.t + '. Atualize a página e ajuste o carrinho.');
      }

      // o preço é recalculado pela planilha, não confiamos no valor vindo do navegador
      const preco = num(row[c.col.preco]);
      const promo = num(row[c.col.preco_promo]);
      const perso = it.perso ? { nome: texto(it.perso.nome, 12), num: texto(it.perso.num, 2) } : null;
      const unit = (promo > 0 && promo < preco ? promo : preco) + (perso ? PERSONALIZACAO_PRECO : 0);
      subtotal += unit * qtd;
      itens.push({ id: String(it.id), nome: nomeCamisa, t: it.t, qtd: qtd, unit: unit, perso: perso });
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
      return i.qtd + 'x ' + i.nome + ' (' + i.t + ')' + (i.perso ? ' [' + [i.perso.nome, i.perso.num].join(' ').trim() + ']' : '');
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
        itens: itens.map(function (it) { return { nome: it.nome, t: it.t, qtd: it.qtd, unit: it.unit, perso: it.perso }; })
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
  'Regras: Brasileirão = clubes brasileiros; Europeu = clubes de fora do Brasil; Seleções = seleções nacionais; Retrô = camisas de temporadas antigas (antes de 2015).',
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
    let r = tentar(modelos[i], true, true);
    if (r.getResponseCode() === 400) r = tentar(modelos[i], true, false);           // modelo não aceita thinkingLevel
    if (r.getResponseCode() === 400 || r.getResponseCode() === 429) r = tentar(modelos[i], false, false);   // sem busca
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
      ativo: cm.ativo === 'NAO' ? 'NAO' : 'SIM', destaque: cm.destaque === 'SIM' ? 'SIM' : 'NAO'
    };
    TAMANHOS.forEach(function (t) { valores[t] = Math.max(0, parseInt(cm[t], 10) || 0); });

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
