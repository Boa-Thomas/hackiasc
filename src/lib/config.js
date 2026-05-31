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
  registrationEnd: '2026-05-27T23:59:00-03:00',
  loteDeadline: '2026-04-30T23:59:00-03:00', // Virada de lote — early bird
  earlyAccessStart: '2026-04-08T11:30:00-03:00',
  earlyAccessCode: import.meta.env.VITE_EARLY_ACCESS_CODE || '',
  datiDiscountCode: import.meta.env.VITE_DATI_DISCOUNT_CODE || '',
  datiDiscountPercent: 20,
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
    whatsappGroup: 'https://chat.whatsapp.com/JRy6y7Odmee22v1QsaHegb',
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

// Conta dedicada usada pelo link de auto-login da equipe (#admin-acesso?t=<senha>).
// O email nao e segredo; o token do link e a senha desta conta (role 'staff').
export const STAFF_ACCESS_EMAIL = 'equipe-muro@hackiasc.com'

// ============================================================
// Tracking de fase das equipes - projeto Supabase EXTERNO (read-only).
// O painel externo registra a fase de cada equipe na tabela teams (coluna
// stage). A anon key abaixo e PUBLICA (ja exposta no HTML deployado deles);
// aqui e usada SOMENTE para leitura.
// ============================================================
export const EXTERNAL_PHASE_TRACKER = {
  url: 'https://kpcaokuqblutdkfdqwfg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwY2Fva3VxYmx1dGRrZmRxd2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDM4MDksImV4cCI6MjA5MTAxOTgwOX0.Vf5pqPFersTEHmpZ3BewjWHX9nUGBm-R5iisLCvhZms',

  PHASES: [
    { key: 'equipe',   label: 'Equipe',   order: 0, color: '#22c55e' },
    { key: 'problema', label: 'Problema', order: 1, color: '#3b82f6' },
    { key: 'slc',      label: 'SLC-IA',   order: 2, color: '#06b6d4' },
    { key: 'pivotar',  label: 'Pivotar',  order: 3, color: '#a855f7' },
    { key: 'venda',    label: 'Venda',    order: 4, color: '#f59e0b' },
    { key: 'pitch',    label: 'Pitch',    order: 5, color: '#ec4899' },
    { key: 'hero',     label: 'Hero',     order: 6, color: '#f97316' },
  ],

  STAGE_ALIASES: {
    ideia: 'equipe',
    mvp: 'slc',
    prototipo: 'slc',
    solucao: 'slc',
    codigo: 'pivotar',
    vendas: 'venda',
  },

  TEAM_NAME_ALIASES: {
    byaitas: 'baitas',
    easyaiitcompany: 'easyiaitcompany',
  },
}
