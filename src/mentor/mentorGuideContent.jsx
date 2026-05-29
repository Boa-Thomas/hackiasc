import { EVENT_CONFIG } from '../lib/config'

// ============================================================
// Guia do Mentor — conteúdo conceitual (não-conflitante).
//
// IMPORTANTE: cronograma, rubrica de avaliação, formato de pitch e prêmios
// NÃO são transcritos aqui — eles divergem do edital/site (ver
// docs/metodologia/DIVERGENCIAS-CRONOGRAMA.md). As seções "Cronograma" e
// "Avaliação" trazem só a lente do mentor + link para as seções oficiais
// do site (/#cronograma, /#premios), que são a fonte da verdade.
// ============================================================

// ---------- Primitivos de apresentação ----------

// Mapa estático de tons → classes literais. Necessário porque o Tailwind v4
// só extrai class strings literais do código-fonte; classes montadas por
// interpolação (`bg-${tone}`) não seriam geradas no CSS final.
const TONE = {
  cyan: { text: 'text-cyan', bg: 'bg-cyan/5', border: 'border-cyan/20', dot: 'bg-cyan' },
  electric: { text: 'text-electric', bg: 'bg-electric/5', border: 'border-electric/20', dot: 'bg-electric' },
  violet: { text: 'text-violet', bg: 'bg-violet/5', border: 'border-violet/20', dot: 'bg-violet' },
  gold: { text: 'text-gold', bg: 'bg-gold/5', border: 'border-gold/20', dot: 'bg-gold' },
  hot: { text: 'text-hot', bg: 'bg-hot/5', border: 'border-hot/20', dot: 'bg-hot' },
}

function Eyebrow({ children }) {
  return <span className="font-mono text-sm text-violet tracking-wider uppercase">{children}</span>
}

function H({ children }) {
  return <h3 className="text-base font-bold text-white mt-6 mb-2 first:mt-0">{children}</h3>
}

function P({ children }) {
  return <p className="text-sm text-text-muted leading-relaxed mb-3">{children}</p>
}

function Bullets({ items, tone = 'electric' }) {
  const t = TONE[tone] || TONE.electric
  return (
    <ul className="space-y-2 mt-2 mb-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-text-muted leading-relaxed">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${t.dot} flex-shrink-0`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function GuideTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto -mx-1 my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left font-mono text-[11px] uppercase tracking-wider text-violet font-semibold border-b border-dark-border px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, c) => (
                <td key={c} className={`px-3 py-2 border-b border-dark-border/60 leading-relaxed ${c === 0 ? 'text-white font-medium' : 'text-text-muted'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Callout({ tone = 'gold', title, children }) {
  const t = TONE[tone] || TONE.gold
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-4 my-4`}>
      {title && <p className={`text-sm font-bold ${t.text} mb-1`}>{title}</p>}
      <div className="text-sm text-text-muted leading-relaxed">{children}</div>
    </div>
  )
}

function CheckItem({ children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-text-muted leading-relaxed py-1">
      <span className="mt-0.5 text-cyan flex-shrink-0 font-mono">☐</span>
      <span>{children}</span>
    </li>
  )
}

function OfficialLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-electric hover:text-cyan transition-colors"
    >
      {children}
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  )
}

function TwoCol({ left, right }) {
  return <div className="grid sm:grid-cols-2 gap-4 my-4">{left}{right}</div>
}

function MiniCard({ tone = 'violet', title, children }) {
  const t = TONE[tone] || TONE.violet
  return (
    <div className={`rounded-xl border ${t.border} bg-dark/40 p-4`}>
      <p className={`text-sm font-bold ${t.text} mb-2`}>{title}</p>
      <div className="text-sm text-text-muted leading-relaxed space-y-1">{children}</div>
    </div>
  )
}

// ---------- Seções ----------

export function VisaoGeral() {
  return (
    <>
      <Eyebrow>Visão Geral</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">O que é o HackIA SC?</h2>
      <P>
        Evento imersivo de 54 horas onde equipes de 3 a 6 pessoas constroem produtos reais usando IA,
        validam com clientes pagantes e competem. Diferencia-se de hackathons tradicionais por exigir
        convergência simultânea de: produto rodando com IA real, evidência de pagamento e clareza sobre
        os aprendizados.
      </P>

      <GuideTable
        headers={['Detalhe', 'Valor']}
        rows={[
          ['Data', EVENT_CONFIG.dates],
          ['Duração', '54 horas (formato imersivo)'],
          ['Local', `${EVENT_CONFIG.location} — ${EVENT_CONFIG.city}`],
          ['Equipes', `${EVENT_CONFIG.capacity} participantes`],
        ]}
      />

      <Callout tone="cyan" title="Mantra">
        “Construa com IA real. Venda no fim de semana. Saia com um CNPJ.”
      </Callout>

      <H>Os 3 diferenciais do HackIA</H>
      <Bullets items={[
        <><strong className="text-white">Mentor fixo por equipe</strong> — um mentor acompanha cada equipe integralmente (sem rotação), evitando ruído de múltiplas opiniões sobre stack.</>,
        <><strong className="text-white">Demo ao vivo obrigatória</strong> — slide com prompt não conta; exige-se chamada real à API com latência medida.</>,
        <><strong className="text-white">IA Evaluator</strong> — um modelo de IA analisa pitches em paralelo aos jurados humanos, gerando um voto adicional.</>,
      ]} />

      <H>Saída esperada de cada equipe</H>
      <Bullets tone="cyan" items={[
        'Repositório público no GitHub com código versionado.',
        'SLC-IA deployed em URL pública conectada a uma API de IA.',
        'Diário de aprendizado com ≥2 ciclos Build-Measure-Learn.',
        'Decisão Pivotar/Perseverar registrada com justificativa baseada em dados.',
        'Primeira evidência de tração (LOI, pré-venda ou primeira nota fiscal).',
        'Slides do pitch em PDF.',
      ]} />

      <H>Filosofia founders — perfis ideais</H>
      <TwoCol
        left={<MiniCard tone="cyan" title="Hacker — Técnico"><p>Transforma ideias em código funcional.</p></MiniCard>}
        right={<MiniCard tone="electric" title="Hustler — Negócios"><p>Valida o problema, encontra cliente, fecha venda.</p></MiniCard>}
      />
      <MiniCard tone="violet" title="Hipster — Design/UX"><p>Cria experiências desejáveis.</p></MiniCard>
    </>
  )
}

export function Metodologia() {
  return (
    <>
      <Eyebrow>Metodologia</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Fundamentos: Lean Startup</h2>
      <P>
        Baseada nos princípios de Eric Ries (2011), a metodologia HackIA estrutura-se no ciclo
        Build-Measure-Learn (BML).
      </P>

      <H>Build-Measure-Learn (BML)</H>
      <P>Ciclo central em que a equipe:</P>
      <Bullets items={[
        <><strong className="text-white">Build</strong> — constrói um experimento mínimo para testar a hipótese.</>,
        <><strong className="text-white">Measure</strong> — mede resultados em campo.</>,
        <><strong className="text-white">Learn</strong> — aprende e decide.</>,
      ]} />
      <Callout tone="electric" title="Exigência">
        Cada equipe deve completar ≥2 voltas do ciclo BML nas 54 horas. O mentor fixo garante isso.
      </Callout>

      <H>Os 3 Saltos de Fé</H>
      <P>Hipóteses fundacionais do negócio:</P>
      <GuideTable
        headers={['Salto', 'Pergunta', 'Como o HackIA testa']}
        rows={[
          ['1. Valor', 'Existe cliente disposto a pagar?', 'Entrevistas, landing com checkout, pré-venda.'],
          ['2. Crescimento', 'Como novos clientes chegam ao produto?', 'Definição do motor de crescimento.'],
          ['3. Técnica de IA', 'A IA consegue fazer X com Y de qualidade em Z tempo/custo?', 'Construção do SLC-IA + medição de latência/custo/qualidade.'],
        ]}
      />

      <H>SLC-IA — Simples, Adorável, Completo com IA real</H>
      <P>Evolução do conceito de MVP (Jason Cohen, 2014):</P>
      <Bullets tone="violet" items={[
        <><strong className="text-white">S (Simples)</strong> — escopo limitado; apenas o necessário para testar a hipótese mais arriscada.</>,
        <><strong className="text-white">L (Adorável)</strong> — a parte que existe deve encantar; UX cuidada, tom claro, output útil.</>,
        <><strong className="text-white">C (Completo)</strong> — funciona ponta a ponta dentro do escopo; não está quebrado.</>,
        <><strong className="text-white">IA (IA real)</strong> — chamada à API, output gerado dinamicamente, custo medido (não mockado).</>,
      ]} />

      <H>Pivotar ou Perseverar</H>
      <P>Ao final de cada ciclo BML:</P>
      <Bullets items={[
        <><strong className="text-cyan">Perseverar</strong> — hipótese confirmada; aprofunda o caminho atual.</>,
        <><strong className="text-gold">Pivotar</strong> — hipótese falhou; muda um aspecto (cliente, problema, modelo, canal ou tecnologia).</>,
        <><strong className="text-hot">Parar</strong> — os dados refutam o conceito inteiro.</>,
      ]} />
      <Callout tone="violet" title="Importante">
        Pivotar é inteligência. Equipes que pivotam baseadas em dados ganham os mesmos pontos que equipes
        que perseveraram com dados. O que pesa é o rigor da decisão.
      </Callout>

      <H>Os 5 princípios fundacionais</H>
      <Bullets items={[
        'Empreendedorismo é gerenciar incerteza com método.',
        'Aprender é metade; a outra metade é executar.',
        'IA tem que rodar de verdade (não slide nem screenshot).',
        'Build-Measure-Learn segue sendo o motor.',
        'Pivotar é inteligência; persistir cego é fracasso.',
      ]} />
    </>
  )
}

export function PapelDoMentor() {
  return (
    <>
      <Eyebrow>Papel do Mentor</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">O mentor fixo — diferencial central</h2>
      <P>
        Um mentor por equipe durante as 54 horas (sem rotação). Em um hackathon de IA, troca rápida de
        mentor cria ruído de múltiplas stacks. O mentor fixo conhece a hipótese, vê a evolução do código
        e sabe quando intervir.
      </P>

      <H>Seu objetivo</H>
      <P>
        Levar a equipe ao primeiro lugar: dar direcionamento, apoiar a construção e fornecer nortes.
        Você <strong className="text-white">não precisa trabalhar pela equipe</strong> — mas pode sentar
        e codar junto se desejar.
      </P>

      <H>Pré-requisitos (escolha um trilho)</H>
      <TwoCol
        left={<MiniCard tone="cyan" title="Trilho Técnico"><p>Já construiu algo com IA (LLM, agente, automação) rodando em produção.</p></MiniCard>}
        right={<MiniCard tone="electric" title="Trilho Empreendedor"><p>Passou por hackathon/Startup Weekend vencendo, ou empreendeu com tração comprovada.</p></MiniCard>}
      />

      <H>O que É o seu papel</H>
      <Bullets tone="cyan" items={[
        'Fazer perguntas que forcem rigor.',
        'Garantir que a equipe siga o BML (sem pular etapas).',
        'Redirecionar o over-prompting (só editar prompt é o over-building do HackIA).',
        'Manter ritmo e energia.',
        'Ajudar a interpretar dados sem viés de confirmação.',
        'Ser a memória da equipe e intervir quando necessário.',
      ]} />

      <H>O que NÃO É o seu papel</H>
      <Bullets tone="hot" items={[
        'Dar a ideia de negócio.',
        'Validar se “a ideia é boa”.',
        'Decidir pela equipe.',
        'Programar pela equipe (não é par-programming obrigatório).',
        'Ser jurado da equipe que você mentora (proibido).',
      ]} />

      <H>Regras de ouro — quando intervir</H>
      <P>
        Heurísticas de julgamento (os horários oficiais de cada bloco estão no cronograma do site):
      </P>
      <Callout tone="gold" title="IA rodando — tarde de sábado">
        Se a equipe ainda não tem uma chamada real à API funcionando, force um time-out de 15 minutos.
        Over-prompting é o over-building do HackIA: a equipe deve simplificar drasticamente o escopo ou
        usar Mágico de Oz IA.
      </Callout>
      <Callout tone="gold" title="Validação externa — sábado">
        Se a equipe não falou com nenhum cliente real, intervenha. Validação externa é obrigatória para
        o ciclo BML.
      </Callout>
      <Callout tone="violet" title="Pivot/Persevere">
        A decisão Pivotar/Perseverar acontece no sábado, não no domingo. Garanta que seja baseada em dados.
      </Callout>

      <H>Como funciona o pareamento mentor ↔ equipe</H>
      <P>A organização designa os mentores considerando fit cultural, complementação de pontos fracos e
        nível de suporte necessário. Mentores podem ser realocados pela organização se for preciso ajustar
        fit ou dinâmica.</P>

      <H>O que o mentor precisa levar</H>
      <TwoCol
        left={<MiniCard tone="electric" title="Itens físicos">
          <Bullets items={['Laptop carregado', 'Carregador de celular', 'Bloco de notas/tablet', 'Garrafa de água', 'Roupas confortáveis para os 3 dias']} />
        </MiniCard>}
        right={<MiniCard tone="violet" title="Preparação mental">
          <Bullets tone="violet" items={['Ler este guia completo e revisar Lean Startup/BML', 'Conhecer os critérios de avaliação oficiais', 'Estar preparado para 54h (com intervalos)', 'Chegar na sexta para o credenciamento']} />
        </MiniCard>}
      />
    </>
  )
}

export function Cronograma() {
  return (
    <>
      <Eyebrow>Cronograma</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">O papel do mentor em cada fase</h2>
      <Callout tone="electric" title="Horários oficiais no site">
        <p className="mb-3">
          Os horários e a estrutura oficial de cada dia ficam no cronograma do site — é a fonte da verdade
          e pode ser ajustada pela organização. Abaixo, só o que cabe a você como mentor em cada fase.
        </p>
        <OfficialLink href="/#cronograma">Ver cronograma oficial</OfficialLink>
      </Callout>

      <H>Fase 1 · Ignição (sexta)</H>
      <P><em className="text-text-muted">“Que dor real vale resolver com IA?”</em></P>
      <Bullets items={[
        'Participar da formação de equipes.',
        'Conduzir o workshop dos Saltos de Fé e preencher o Canvas de Hipóteses com a equipe.',
        'Identificar com a equipe qual é a hipótese mais arriscada e definir o plano para sábado.',
      ]} />

      <H>Fase 2 · Construção (sábado)</H>
      <P><em className="text-text-muted">“Constrói com IA real. Vende no fim de semana.”</em></P>
      <Bullets items={[
        'Conduzir a primeira rodada de mentoria e ajudar no Canvas SLC-IA.',
        'Circular pela equipe periodicamente durante os blocos de construção.',
        'Aplicar as regras de ouro: IA rodando de verdade e validação externa com clientes (ver Papel do Mentor).',
        'Acompanhar o checkpoint BML e conduzir a reunião Pivotar/Perseverar com dados.',
      ]} />

      <H>Fase 3 · Apresentação (domingo)</H>
      <P><em className="text-text-muted">“Demo ao vivo. Sem slide salva.”</em></P>
      <Bullets items={[
        'Consolidar dados residuais e ajudar na preparação do pitch.',
        'Conduzir o ensaio cronometrado.',
        'Testar a demo ao vivo e o fallback; definir quem fala e quem opera a demo.',
        'Acompanhar a equipe até a entrada no palco — sem ser jurado dela (proibido).',
      ]} />
    </>
  )
}

export function Avaliacao() {
  return (
    <>
      <Eyebrow>Avaliação</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Como o sucesso é medido</h2>
      <P>
        Sucesso é a convergência de três coisas: <strong className="text-cyan">Build</strong> (IA rodando),
        <strong className="text-electric"> Sell</strong> (evidência de pagamento) e
        <strong className="text-violet"> Learn</strong> (aprendizado claro).
      </P>
      <Callout tone="hot" title="Mantra do júri">
        “Slide com prompt não conta. Captura de tela do ChatGPT não conta. Show me the IA running.”
      </Callout>

      <H>Critérios oficiais</H>
      <P>Como cada equipe é avaliada (formato e tempo exatos do pitch ficam no site oficial):</P>
      <GuideTable
        headers={['Critério', 'Peso']}
        rows={[
          ['Execução Técnica e IA', '30%'],
          ['Validação do Problema', '25%'],
          ['Escalabilidade e Negócio', '25%'],
          ['Pitch e Equipe', '20%'],
        ]}
      />
      <P>
        Bônus: avaliação do mentor fixo, vendas comprovadas, internacionalização e eixos de governança.
      </P>

      <H>A estrutura narrativa do pitch</H>
      <P>Ajude a equipe a contar a história nesta ordem (tempo e formato exatos no site oficial):</P>
      <Bullets items={[
        <><strong className="text-white">Problema</strong> — que dor real descobriram? Quem sofre? Como sofre hoje?</>,
        <><strong className="text-white">Hipótese</strong> — o que acreditavam, incluindo a hipótese técnica de IA.</>,
        <><strong className="text-white">Experimento</strong> — o que fizeram para testar (com quantas pessoas, prazo, critério de sucesso).</>,
        <><strong className="text-white">Evidências</strong> — o que dados e clientes disseram (citações, números, gráficos).</>,
        <><strong className="text-white">Aprendizado</strong> — o que descobriram que não esperavam; pivotaram ou perseveraram, e por quê.</>,
        <><strong className="text-white">Demo ao vivo do SLC-IA</strong> — obrigatória: a IA roda de verdade, chamada real à API ao vivo.</>,
        <><strong className="text-white">Próximos passos</strong> — o que testariam depois, modelo de receita, quanto precisariam.</>,
      ]} />

      <H>Por que a demo ao vivo é o diferencial</H>
      <P>
        A demo ao vivo separa o HackIA da maioria dos hackathons brasileiros. A equipe sobe um input no
        palco, a chamada à API roda em tempo real (com latência real) e o output aparece. Isso prova que a
        IA não é slide. Equipe que codou bem (com fallback) brilha; equipe que ficou só editando prompt
        falha. Prepare a sua equipe para esse momento.
      </P>
    </>
  )
}

export function Ferramentas() {
  return (
    <>
      <Eyebrow>Ferramentas</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Os tipos de protótipo IA</h2>
      <P>
        A maior armadilha é construir o produto inteiro antes de validar a hipótese. Os tipos de protótipo
        aceleram o aprendizado com investimento mínimo.
      </P>

      <MiniCard tone="cyan" title="🎩 Concierge IA">
        <P>A equipe opera a IA manualmente — vocês são a IA por trás. O cliente acha que usa um produto, mas é humano (ou humano + ChatGPT/Claude) executando.</P>
        <p><strong className="text-white">Quando:</strong> a hipótese é “isso resolve um problema?”.</p>
        <p><strong className="text-white">Vantagem:</strong> zero código, validação profunda, gera receita real.</p>
        <p><strong className="text-white">Limitação:</strong> não conta como demo ao vivo sem ≥1 chamada automatizada à API.</p>
      </MiniCard>
      <div className="h-3" />
      <MiniCard tone="violet" title="🧙 Mágico de Oz IA">
        <P>A interface parece IA-automática, mas um humano opera por trás. O cliente clica e vê a resposta sem saber que vocês respondem manualmente em outra aba.</P>
        <p><strong className="text-white">Quando:</strong> a hipótese é “a UX funciona?”.</p>
        <p><strong className="text-white">Vantagem:</strong> validação de UX real, escala para 10–30 clientes.</p>
        <p><strong className="text-white">Limitação:</strong> declare que é beta — não engane. Para a demo ao vivo, precisa de ≥1 caminho automatizado até domingo.</p>
      </MiniCard>
      <div className="h-3" />
      <MiniCard tone="electric" title="⚡ IA-real mínima">
        <P>O backend chama uma API de IA real, frontend mínimo, escopo apertado mas tudo automatizado ponta a ponta.</P>
        <p><strong className="text-white">Quando:</strong> a equipe tem devs fortes e quer competir pela pontuação técnica.</p>
        <p><strong className="text-white">Vantagem:</strong> maximiza a nota técnica e gera demo ao vivo natural.</p>
        <p><strong className="text-white">Limitação:</strong> risco de over-engineering — a equipe se apaixona pelo código e esquece a validação.</p>
      </MiniCard>
      <div className="h-3" />
      <MiniCard tone="gold" title="💰 Pré-venda + Landing (bônus)">
        <P>Landing page com botão “comprar” — mede se o cliente paga antes do produto existir.</P>
        <p><strong className="text-white">Quando:</strong> combinar com outro tipo (não pode ser único, pois não tem demo).</p>
        <p><strong className="text-white">Vantagem:</strong> evidência de tração se gerar primeira venda real durante o evento.</p>
      </MiniCard>

      <H>Matriz de decisão</H>
      <P>Ajude a equipe a escolher o protótipo certo:</P>
      <GuideTable
        headers={['Se a equipe tem…', 'Escolham…']}
        rows={[
          ['0 dev', 'Concierge IA + Pré-venda'],
          ['1 dev, pouco tempo de IA', 'Mágico de Oz IA + Pré-venda'],
          ['1+ dev, familiaridade com APIs', 'IA-real mínima + Pré-venda'],
          ['Squad sênior, crédito de API sobrando', 'IA-real mínima robusta com cache + RAG'],
        ]}
      />

      <H>Templates para as equipes</H>
      <TwoCol
        left={<MiniCard tone="violet" title="📋 Canvas de Hipóteses (Fase 1)">
          <Bullets tone="violet" items={['Cliente-alvo', 'Hipótese de valor', 'Hipótese de crescimento', 'Hipótese técnica de IA', 'Priorização: qual é a mais arriscada?']} />
        </MiniCard>}
        right={<MiniCard tone="cyan" title="🎯 Canvas SLC-IA (Fase 2)">
          <Bullets tone="cyan" items={['Hipótese a testar', 'Tipo de protótipo', 'Escopo (must-have e descartados)', 'Camada de IA', 'Experimento e plano hora a hora', 'Entregáveis']} />
        </MiniCard>}
      />
    </>
  )
}

export function Checklist() {
  return (
    <>
      <Eyebrow>Checklist</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Checklist do mentor</h2>
      <Callout tone="cyan">
        💡 Salve esta página no celular para acompanhar durante o evento.
      </Callout>

      <H>Antes do evento</H>
      <ul className="mb-2">
        <CheckItem>Li este guia completo e entendi o BML e os 3 Saltos de Fé.</CheckItem>
        <CheckItem>Conheço os 3 tipos de protótipo IA.</CheckItem>
        <CheckItem>Revisei os critérios de avaliação oficiais e a estrutura do pitch.</CheckItem>
        <CheckItem>Entendi o papel do mentor fixo (o que é e o que não é).</CheckItem>
        <CheckItem>Confirmei minha presença nos 3 dias e preparei laptop/tablet e carregadores.</CheckItem>
      </ul>

      <H>Fase 1 · Ignição (sexta)</H>
      <ul className="mb-2">
        <CheckItem>Cheguei a tempo do credenciamento e acompanhei a abertura e a formação de equipes.</CheckItem>
        <CheckItem>Fui pareado com a minha equipe fixa.</CheckItem>
        <CheckItem>Conduzi o workshop dos Saltos de Fé e ajudei no Canvas de Hipóteses.</CheckItem>
        <CheckItem>Identifiquei a hipótese mais arriscada e defini o plano de ação para sábado.</CheckItem>
      </ul>

      <H>Fase 2 · Construção (sábado)</H>
      <ul className="mb-2">
        <CheckItem>Conduzi a primeira rodada de mentoria e ajudei no Canvas SLC-IA.</CheckItem>
        <CheckItem>Passei pela equipe periodicamente durante a construção.</CheckItem>
        <CheckItem><strong className="text-white">Regra de ouro:</strong> verifiquei se a IA está rodando de verdade; se não, forcei time-out e simplifiquei o escopo.</CheckItem>
        <CheckItem><strong className="text-white">Regra de ouro:</strong> confirmei que a equipe validou com clientes reais; se não, intervim.</CheckItem>
        <CheckItem>Acompanhei o checkpoint BML e conduzi a reunião Pivotar/Perseverar com dados.</CheckItem>
      </ul>

      <H>Fase 3 · Apresentação (domingo)</H>
      <ul className="mb-2">
        <CheckItem>Consolidei dados residuais e ajudei na preparação do pitch.</CheckItem>
        <CheckItem>Conduzi o ensaio cronometrado.</CheckItem>
        <CheckItem>Testei a demo ao vivo e o fallback; defini quem fala e quem opera a demo.</CheckItem>
        <CheckItem>Acompanhei a equipe até o palco — sem ser jurado dela (proibido).</CheckItem>
      </ul>

      <H>Após o evento</H>
      <ul className="mb-2">
        <CheckItem>Dei o feedback final à equipe e participei do networking.</CheckItem>
        <CheckItem>Enviei feedback para a organização.</CheckItem>
      </ul>
    </>
  )
}

export function Glossario() {
  const groups = [
    {
      title: 'Metodologia e jornada',
      terms: [
        ['Lean Startup', 'Metodologia de empreendedorismo (Eric Ries, 2011). Trata a startup como experimento — gerencia incerteza com método.'],
        ['BML (Build-Measure-Learn)', 'Ciclo central do Lean Startup: construir experimento mínimo, medir em campo, aprender se a hipótese se confirmou. O HackIA exige ≥2 voltas em 54h.'],
        ['SLC (Simples, Adorável, Completo)', 'Conceito de Jason Cohen (2014) que evolui o MVP: simples em escopo, adorável na execução, completo no que promete.'],
        ['SLC-IA', 'Versão HackIA do SLC: simples, adorável, completo e com IA real rodando (chamada à API, output dinâmico, custo medido — não mockado).'],
        ['Saltos de Fé', 'Hipóteses fundacionais do negócio. No HackIA: valor, crescimento e técnica de IA.'],
        ['Pivotar', 'Mudar um aspecto fundamental (cliente, problema, modelo, canal ou tecnologia) com base em dados que refutam a hipótese.'],
        ['Perseverar', 'Aprofundar a hipótese atual com base em dados que a confirmam. Decisão informada, não teimosia.'],
      ],
    },
    {
      title: 'Atividades do evento',
      terms: [
        ['Muro de Dores', 'Atividade colaborativa: o participante registra um problema real (não solução), com agrupamento por afinidade em tempo real.'],
        ['Pitch Relâmpago', 'Pitches curtos com o filtro “como a IA resolve?”. Quem pitcha solução é redirecionado à dor.'],
        ['Pivot/Persevere', 'Reunião de decisão estruturada: a equipe consolida dados e decide pivotar, perseverar ou parar.'],
        ['Demo ao vivo', 'Bloco do pitch em que a IA roda em tempo real no palco — chamada real à API. Pode ter fallback de vídeo se falhar.'],
        ['IA Evaluator', 'Modelo de IA que avalia pitches em paralelo aos jurados humanos pela rubrica oficial. Resultado: 1 voto adicional.'],
        ['Mentor fixo', 'Mentor pareado com uma única equipe por 54h. Sem rotação. Não é par-programmer. Não é jurado da própria equipe.'],
      ],
    },
    {
      title: 'Tipos de protótipo',
      terms: [
        ['Concierge IA', 'A equipe opera a IA manualmente para 1–3 clientes. Zero código; máxima validação.'],
        ['Mágico de Oz IA', 'Interface parece automática; humano opera atrás. Declare que é beta.'],
        ['IA-real mínima', 'Backend chama API de IA real; frontend mínimo; tudo automatizado. Maximiza a nota técnica.'],
        ['Pré-venda + Landing', 'Tipo bônus. Landing com checkout — mede se o cliente paga antes do produto. Combine com outro tipo.'],
      ],
    },
    {
      title: 'Termos técnicos de IA',
      terms: [
        ['LLM', 'Large Language Model. Ex.: GPT, Claude, Gemini, Llama, Mistral.'],
        ['API', 'Endpoint onde o backend se conecta ao modelo. Requer chave de autenticação e gera custo por chamada.'],
        ['Inferência', 'Cada chamada ao modelo. Tem custo (tokens) e latência (tempo de resposta).'],
        ['Token', 'Unidade de cobrança e processamento dos LLMs (~4 caracteres em PT-BR). Entrada e saída são cobradas separadamente.'],
        ['Latência P95', 'Tempo de resposta no percentil 95: 95% das chamadas são mais rápidas. Mais útil que a média.'],
        ['Fallback', 'Provider/modelo alternativo para quando o primário falha. No HackIA: cada equipe usa 2+ providers.'],
        ['RAG', 'Retrieval-Augmented Generation. Combina busca em base de dados com a geração do LLM.'],
        ['Prompt Engineering', 'Construir instruções que maximizem a qualidade do output (system prompt, few-shot, chain-of-thought).'],
      ],
    },
  ]
  return (
    <>
      <Eyebrow>Glossário</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Glossário</h2>
      {groups.map((g) => (
        <div key={g.title} className="mb-6">
          <H>{g.title}</H>
          <dl className="space-y-3">
            {g.terms.map(([term, def]) => (
              <div key={term}>
                <dt className="text-sm font-semibold text-white">{term}</dt>
                <dd className="text-sm text-text-muted leading-relaxed">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  )
}

export function Equipe() {
  const team = [
    ['Vini (JOYn RH)', 'Direção geral, patrocínios, mentores'],
    ['Thomas Topfstedt', 'Tecnologia (site, IA Evaluator, app jornada)'],
    ['Ana Luiza', 'Jurados, parcerias internacionais'],
    ['Lycia', 'Jurídico, edital, patrocínios'],
    ['Letícia Zen', 'Marketing, redes sociais, identidade visual'],
    ['Bruno Lubian', 'Divulgação, jornada do sapo, suporte técnico'],
    ['Cristiane Stüepp', 'Relacionamento com participantes'],
    ['Millena Miliotti', 'Coordenação de metodologia (facilitadora-chefe)'],
    ['Junior (CIB)', 'Infraestrutura física'],
  ]
  return (
    <>
      <Eyebrow>Equipe</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">Equipe organizadora</h2>
      <P>Quem está por trás do evento e a quem recorrer:</P>
      <GuideTable headers={['Nome', 'Função']} rows={team} />
      <div className="mt-6 pt-5 border-t border-dark-border">
        <P>
          Contato: <span className="font-mono text-electric">{EVENT_CONFIG.organizer.email}</span>
        </P>
      </div>
    </>
  )
}

