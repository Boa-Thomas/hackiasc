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
  earlyBirdLimit: 10,
  registrationStart: '2026-04-08T12:00:00-03:00',
  registrationEnd: '2026-05-13T15:00:00-03:00',
  loteDeadline: '2026-04-30T23:59:00-03:00', // Virada de lote — early bird
  earlyAccessStart: '2026-04-08T11:30:00-03:00',
  earlyAccessCode: import.meta.env.VITE_EARLY_ACCESS_CODE || '',
  location: 'Centro de Inovação de Blumenau (CIB)',
  city: 'Blumenau, SC',
  capacity: '60-100',

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
