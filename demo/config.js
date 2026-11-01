/* DA RUA — configurações da LOJA DE DEMONSTRAÇÃO. Gerado por ferramentas/gerar-demo.py a partir
   de js/config.js: não edite aqui. Os pedidos ficam só no navegador de quem testa (demo/demo.js). */
const DARUA_CONFIG = {
  demo: true,
  // Link da aba "camisas" publicada como CSV (Arquivo → Compartilhar → Publicar na Web)
  planilha: '',

  // Link do App da Web do Google Apps Script (recebe e salva os pedidos na aba "pedidos")
  api: '',

  // ---------- pagamento ----------
  pix: {
    chave: 'demonstracao@exemplo.com',             // CPF/CNPJ só números, e-mail, telefone no formato +5554999999999 ou chave aleatória
    nome: 'DA RUA',            // nome de quem recebe (até 25 letras, sem acento)
    cidade: 'VERANOPOLIS'      // cidade de quem recebe (até 15 letras, sem acento)
  },
  pagamentoNaEntrega: true,    // vale só para retirada e entrega na mesma cidade
  pixPrazoHoras: 24,           // pedido Pix não pago nesse prazo é cancelado (igual ao PIX_PRAZO_HORAS do Apps Script)

  // ---------- dados da loja (obrigatórios por lei em loja online: aparecem no rodapé e nas políticas) ----------
  empresa: {
    nome: 'DA RUA — loja de demonstração (portfólio)',
    documento: '',
    endereco: '',
    email: ''
  },
  trocaTamanhoDias: 30,        // prazo para troca de tamanho (política da loja; o arrependimento de 7 dias é lei)
  politicasAtualizadas: '01/11/2026',

  // WhatsApp de contato (botão "Fale conosco"): 55 + DDD + número, só dígitos
  whatsapp: '',

  // Personalização com nome e número
  personalizacaoAtiva: true,
  personalizacaoPreco: 30,

  // Parcelamento mostrado na vitrine ("ou 3x de..."). Deixe 0 enquanto a loja não aceitar cartão parcelado no site.
  parcelasSemJuros: 0,

  // Mostra "Restam só X" quando um tamanho tiver até essa quantidade
  estoqueBaixo: 2,

  // ---------- frete ----------
  cidadeOrigem: 'Veranópolis',
  ufOrigem: 'RS',
  freteGratisAcima: 399,      // 0 desativa o frete grátis
  adicionalPorItem: 3,        // somado por camisa extra no mesmo pedido
  retirada: true,
  enderecoRetirada: 'Combinar local (demonstração)',
  frete: {                    // valor em R$ e prazo em dias úteis por região do CEP
    local: { valor: 10, prazo: '1 a 2' },          // mesma cidade de origem
    Sul: { valor: 22, prazo: '3 a 6' },
    Sudeste: { valor: 28, prazo: '5 a 9' },
    'Centro-Oeste': { valor: 32, prazo: '6 a 10' },
    Nordeste: { valor: 38, prazo: '7 a 12' },
    Norte: { valor: 45, prazo: '8 a 15' }
  }
};
