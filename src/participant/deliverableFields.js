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
  // Slides do pitch: upload de PDF (máx 50MB) para o bucket privado `files`,
  // prefixo deliverables/<team_id>/. Tratado fora do fluxo genérico de campos
  // do DeliverableForm (ver SlidesUpload no DeliverablesSection). O caminho
  // fica em final_deliverables.slides_path e o nome em slides_name.
  { key: 'slides', label: 'Slides do pitch (PDF, até 50MB)', type: 'file-pdf', full: true },
  { key: 'proximos_passos', label: 'Próximos passos', type: 'textarea', rows: 3, full: true,
    placeholder: 'Modelo de receita, o que testariam a seguir, quanto precisariam para 90 dias.' },
]

// Glossário de termos da metodologia, por fase. Consumido por TermsGlossary no
// topo de cada fase dos entregáveis. Redação alinhada ao guia do mentor.
export const GLOSSARY = {
  hypotheses: [
    ['Saltos de Fé', 'As 3 hipóteses fundacionais do negócio: valor, crescimento e técnica de IA. Se uma for falsa, o resto desmorona.'],
    ['Hipótese de Valor', 'Existe um cliente disposto a pagar para resolver essa dor? É a hipótese mais importante.'],
    ['Hipótese de Crescimento', 'Como novos clientes chegam. O "motor" pode ser viral (um usuário traz outro), pago (anúncios), pegajoso (retenção/recompra) ou comunidade.'],
    ['Hipótese Técnica de IA', 'O modelo consegue entregar a tarefa com qualidade, custo e tempo aceitáveis?'],
    ['Fallback', 'Modelo ou serviço reserva acionado automaticamente quando o principal falha.'],
    ['Inferência', 'Cada chamada ao modelo de IA. Tem custo em R$ — por isso é medida.'],
  ],
  slc: [
    ['SLC-IA', 'Simples, Adorável e Completo, com IA real rodando (chamada à API, output dinâmico, custo medido — não mockado). A alternativa do HackIA ao MVP.'],
    ['Concierge IA', 'A equipe opera a IA manualmente para 1–3 clientes. Zero código; máxima validação de valor.'],
    ['Mágico de Oz IA', 'A interface parece automática, mas um humano opera atrás dos panos. Declare que é beta.'],
    ['IA-real mínima', 'Backend chama uma API de IA real; frontend mínimo; tudo automatizado ponta a ponta. Maximiza a nota técnica.'],
    ['Pré-venda + Landing', 'Tipo bônus. Landing com checkout — mede se o cliente paga antes de o produto existir. Combine com outro tipo.'],
    ['RAG', 'A IA busca em uma base externa antes de responder, reduzindo alucinação.'],
    ['P95', 'Latência no percentil 95: 95% das respostas vêm nesse tempo ou menos. Mede o pior caso real, não a média.'],
  ],
  diary: [
    ['BML (Build-Measure-Learn)', 'Ciclo central do Lean Startup: construir um experimento mínimo, medir em campo e aprender se a hipótese se confirmou. O HackIA exige ≥2 voltas em 54h.'],
    ['Pivotar', 'Mudar um aspecto fundamental (cliente, problema, modelo, canal ou tecnologia) com base em dados que refutam a hipótese. Pivotar com dados vale os mesmos pontos que perseverar.'],
    ['Perseverar', 'Aprofundar a hipótese atual com base em dados que a confirmam. Decisão informada, não teimosia.'],
  ],
  final: [
    ['Deploy (SLC-IA deployed)', 'Versão pública do produto acessível por uma URL — não localhost. O júri precisa conseguir abrir.'],
    ['Demo ao vivo', 'Bloco do pitch em que a IA roda em tempo real no palco, com chamada real à API. Pode ter fallback de vídeo se falhar.'],
  ],
}
