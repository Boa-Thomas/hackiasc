// Configuração dos entregáveis da equipe (metodologia HackIA), por fase.
// Chaves em inglês (persistidas no JSONB de `teams`), labels em PT-BR.
// Compartilhado entre o painel da equipe (edição) e o painel do mentor (leitura).

export const PHASES = [
  { id: 'hypotheses', label: 'Hipóteses', phase: 'Fase 1 · Ignição',      field: 'hypotheses_canvas',  methodPhase: 'ignicao' },
  { id: 'slc',        label: 'SLC-IA',    phase: 'Fase 2 · Construção',   field: 'slc_ia_canvas',      methodPhase: 'construcao' },
  { id: 'diary',      label: 'Diário BML', phase: 'Fase 2 · Construção',  field: 'learning_diary',     methodPhase: 'construcao' },
  { id: 'final',      label: 'Entregas',  phase: 'Fase 3 · Apresentação', field: 'final_deliverables', methodPhase: 'apresentacao' },
]

// Fases da metodologia (âncora das ponderações do mentor)
export const METHOD_PHASES = [
  { id: 'ignicao',      label: 'Fase 1 · Ignição' },
  { id: 'construcao',   label: 'Fase 2 · Construção' },
  { id: 'apresentacao', label: 'Fase 3 · Apresentação' },
]

export const HYPOTHESES_FIELDS = [
  { key: 'cliente_alvo', label: 'Cliente-alvo', type: 'textarea', rows: 4,
    placeholder: 'Quem é (perfil, contexto, cargo); onde está; como lida com a dor hoje; o que já tentou; por que falhou.' },
  { key: 'hipotese_valor', label: 'Hipótese de Valor', type: 'textarea', rows: 4,
    placeholder: 'Acreditamos que [CLIENTE] tem o problema de [PROBLEMA] e pagaria [AÇÃO] para resolvê-lo. Como saberemos se é verdade/falso?' },
  { key: 'hipotese_crescimento', label: 'Hipótese de Crescimento', type: 'textarea', rows: 4,
    placeholder: 'Novos clientes chegarão por [CANAL]. Motor: viral, pago, pegajoso ou comunidade. Métrica do motor.' },
  { key: 'hipotese_tecnica_ia', label: 'Hipótese Técnica de IA', type: 'textarea', rows: 4,
    placeholder: 'Acreditamos que [modelo] consegue [tarefa] com [qualidade] em [tempo/custo]. Provider primário e fallback. Custo de inferência projetado.' },
  { key: 'priorizacao', label: 'Priorização', type: 'textarea', rows: 3, full: true,
    placeholder: 'Qual das 3 hipóteses é a mais arriscada (a que, se falsa, mata o resto)? Testar essa primeiro.' },
]

export const SLC_IA_FIELDS = [
  { key: 'hipotese_a_testar', label: 'Hipótese a testar', type: 'textarea', rows: 3, full: true,
    placeholder: 'Copie do Canvas de Hipóteses — foque na mais arriscada.' },
  { key: 'tipo_prototipo', label: 'Tipo de protótipo', type: 'select',
    options: ['Concierge IA', 'Mágico de Oz IA', 'IA-real mínima', 'Pré-venda + Landing', 'Combinação'] },
  { key: 'escopo', label: 'Escopo (o que NÃO construir)', type: 'textarea', rows: 4,
    placeholder: 'UMA funcionalidade central (must-have). Pelo menos 3 coisas que NÃO vão construir.' },
  { key: 'camada_ia', label: 'Camada de IA', type: 'textarea', rows: 4,
    placeholder: 'Provider primário e fallback. Arquitetura (sync/async/streaming). RAG/tools? Custo MEDIDO: tokens, R$/chamada, latência média e P95.' },
  { key: 'experimento', label: 'Experimento', type: 'textarea', rows: 4,
    placeholder: 'O que querem aprender? Como coletam evidências? Critérios de sucesso ANTES do teste. Quantas pessoas vão testar e onde encontrá-las.' },
  { key: 'plano_execucao', label: 'Plano de execução (até 17h)', type: 'textarea', rows: 4,
    placeholder: 'Hora a hora até as 17h: quem faz o quê.' },
  { key: 'entregaveis', label: 'Entregáveis', type: 'textarea', rows: 3, full: true,
    placeholder: 'Repo GitHub, SLC-IA deployed, ≥5 chamadas reais (logs), custo medido, ≥5 pessoas testaram, decisão Pivot/Persevere.' },
]

export const FINAL_FIELDS = [
  { key: 'repo_url', label: 'Repositório no GitHub', type: 'url', placeholder: 'https://github.com/...' },
  { key: 'deploy_url', label: 'SLC-IA deployed (URL pública)', type: 'url', placeholder: 'https://...' },
  { key: 'slides_url', label: 'Slides do pitch (PDF/Canva)', type: 'url', placeholder: 'https://...' },
  { key: 'proximos_passos', label: 'Próximos passos', type: 'textarea', rows: 3, full: true,
    placeholder: 'Modelo de receita, o que testariam a seguir, quanto precisariam para 90 dias.' },
]
