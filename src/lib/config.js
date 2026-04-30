// ============================================================
// Configurações do Evento — Edite aqui os valores do site
// ============================================================

export const EVENT_CONFIG = {
  name: 'AI Venture Hackathon Blumenau 2026',
  brand: 'HackIA SC',
  dates: '29 - 31 de Maio de 2026',
  eventStartDate: '2026-05-29T08:00:00-03:00',
  eventEndDate: '2026-05-31T22:00:00-03:00',
  maxCapacity: 100,
  earlyBirdLimit: 10, // back-compat — espelha tiers[0].limit (lido pelo AdminDashboard)
  registrationStart: '2026-04-08T12:00:00-03:00',
  registrationEnd: '2026-05-13T15:00:00-03:00',
  loteDeadline: '2026-04-30T23:59:00-03:00', // back-compat — espelha o deadline do lote vigente (lido pelo CountdownFloat)
  earlyAccessStart: '2026-04-08T11:30:00-03:00',
  earlyAccessCode: import.meta.env.VITE_EARLY_ACCESS_CODE || '',
  datiDiscountCode: import.meta.env.VITE_DATI_DISCOUNT_CODE || '', // back-compat — espelha coupons[].code
  datiDiscountPercent: 20, // back-compat — espelha coupons[].discountPercent
  location: 'Centro de Inovação de Blumenau (CIB)',
  city: 'Blumenau, SC',
  capacity: '60-100',

  // Lotes — avaliados em ordem; primeiro disponível ganha.
  // Disponível enquanto: (limit ausente OU vendidos < limit) E (deadline ausente OU agora < deadline).
  // O último tier (sem limit/deadline) é o fallback.
  // Para adicionar um lote intermediário, insira um objeto antes do 'regular'.
  tiers: [
    {
      id: 'early_bird',
      label: 'Early Bird',
      priceCents: 15000,
      limit: 10,
      deadline: '2026-04-30T23:59:00-03:00',
    },
    {
      id: 'regular',
      label: 'Regular',
      priceCents: 20000,
    },
  ],

  // Cupons — desconto aplicado sobre o lote vigente (não substituem o lote).
  coupons: [
    {
      id: 'dati',
      label: 'DATI',
      code: import.meta.env.VITE_DATI_DISCOUNT_CODE || '',
      discountPercent: 20,
    },
  ],

  // Organização e contato
  organizer: {
    name: 'AI Venture Hackathon Blumenau 2026',
    company: 'MORPH3D INOVA SIMPLES (I.S.)',
    cnpj: '61.358.910/0001-35',
    address: 'Rua das Acácias, 275, Bairro Estados, Timbó/SC, CEP 89093-620',
    email: 'contato@hackiasc.com',
    dpo: 'Thomas Adriaan Topfstedt',
  },

  // Redes sociais e comunidade
  social: {
    instagram: '@hackia.sc',
    instagramUrl: 'https://instagram.com/hackia.sc',
    whatsappGroup: 'https://chat.whatsapp.com/EopEoGPpXmDAEl8Nz7auS3',
  },

  // Pagamento
  payment: {
    pixKey: import.meta.env.VITE_PIX_KEY || '',
    pixKeyType: 'Chave aleatória',
    cardPaymentUrl: 'https://link.mercadopago.com.br/hackiasc',
  },

  // Links — edital assinado
  editalUrl: '/edital-hackia-2026.pdf',
  editalGoogleDocsUrl: '/edital-hackia-2026.pdf',

  // Patrocínio
  sponsorship: {
    coordinator: 'Vinicius Adilson da Costa',
    role: 'Coordenador Geral',
    whatsapp: import.meta.env.VITE_SPONSOR_WHATSAPP || '',
    whatsappUrl: import.meta.env.VITE_SPONSOR_WHATSAPP_URL || '',
  },
}
