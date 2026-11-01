/* DA RUA — configurações da loja. Edite este arquivo e publique o site de novo. */
const DARUA_CONFIG = {
  // Link da aba "camisas" publicada como CSV (Arquivo → Compartilhar → Publicar na Web)
  planilha: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSyzFm4FkoiCzr4cHJ36NdZO2pfx0FkbHZd5RosYcykaCa-acZ8BAh7fAH7U38vt9i8VQiTr_vG3ELP/pub?gid=602134471&single=true&output=csv',

  // Link do App da Web do Google Apps Script (recebe e salva os pedidos na aba "pedidos")
  api: 'https://script.google.com/macros/s/AKfycbwnIFWbSRsY4L91uTGGjEJp_KyaB-T1Hp6Z152_9lXl3-JskbMfOuWNpKaQJHtKwyFRQA/exec',

  // ---------- pagamento ----------
  pix: {
    chave: '05490345012',             // CPF/CNPJ só números, e-mail, telefone no formato +5554999999999 ou chave aleatória
    nome: 'DA RUA',            // nome de quem recebe (até 25 letras, sem acento)
    cidade: 'VERANOPOLIS'      // cidade de quem recebe (até 15 letras, sem acento)
  },
  pagamentoNaEntrega: true,    // vale só para retirada e entrega na mesma cidade
  pixPrazoHoras: 24,           // pedido Pix não pago nesse prazo é cancelado (igual ao PIX_PRAZO_HORAS do Apps Script)

  // ---------- dados da loja (obrigatórios por lei em loja online: aparecem no rodapé e nas políticas) ----------
  empresa: {
    nome: '',                  // razão social do MEI/empresa, ex.: 'JOAO PEDRO SARACOL 12345678000190'
    documento: '',             // CNPJ (ou CPF, se ainda não tiver MEI)
    endereco: '',              // endereço físico, ex.: 'Rua X, 123 — Centro, Veranópolis/RS'
    email: ''                  // e-mail de atendimento
  },
  trocaTamanhoDias: 30,        // prazo para troca de tamanho (política da loja; o arrependimento de 7 dias é lei)
  politicasAtualizadas: '01/11/2026',

  // WhatsApp de contato (botão "Fale conosco"): 55 + DDD + número, só dígitos
  whatsapp: '5553981103937',

  // Personalização com nome e número
  personalizacaoAtiva: true,
  personalizacaoPreco: 30,

  // Mostra "Restam só X" quando um tamanho tiver até essa quantidade
  estoqueBaixo: 2,

  // ---------- frete ----------
  cidadeOrigem: 'Veranópolis',
  ufOrigem: 'RS',
  freteGratisAcima: 399,      // 0 desativa o frete grátis
  adicionalPorItem: 3,        // somado por camisa extra no mesmo pedido
  retirada: true,
  enderecoRetirada: 'Combinar local pelo WhatsApp',
  frete: {                    // valor em R$ e prazo em dias úteis por região do CEP
    local: { valor: 10, prazo: '1 a 2' },          // mesma cidade de origem
    Sul: { valor: 22, prazo: '3 a 6' },
    Sudeste: { valor: 28, prazo: '5 a 9' },
    'Centro-Oeste': { valor: 32, prazo: '6 a 10' },
    Nordeste: { valor: 38, prazo: '7 a 12' },
    Norte: { valor: 45, prazo: '8 a 15' }
  }
};
