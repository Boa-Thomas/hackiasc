// ============================================================
// Guia da Facilitadora — conteúdo estático.
//
// Roteiro prático para a pessoa no palco/mic que conduz o evento
// ao vivo: gestão de tempo, transições, energia da sala e script
// de abertura/fechamento de cada bloco do cronograma.
//
// ESCRITO PARA LEIGO TOTAL: cada termo de startup é explicado
// na primeira vez que aparece. A facilitadora não precisa saber
// nada sobre empreendedorismo — só precisa ler este guia.
// ============================================================

// ---------- Primitivos de apresentação ----------
// Mapa estático de tons → classes literais. Tailwind v4 só extrai
// class strings literais; interpolação não funciona.
const TONE = {
  cyan: {
    text: "text-cyan",
    bg: "bg-cyan/5",
    border: "border-cyan/20",
    dot: "bg-cyan",
  },
  electric: {
    text: "text-electric",
    bg: "bg-electric/5",
    border: "border-electric/20",
    dot: "bg-electric",
  },
  violet: {
    text: "text-violet",
    bg: "bg-violet/5",
    border: "border-violet/20",
    dot: "bg-violet",
  },
  gold: {
    text: "text-gold",
    bg: "bg-gold/5",
    border: "border-gold/20",
    dot: "bg-gold",
  },
  hot: {
    text: "text-hot",
    bg: "bg-hot/5",
    border: "border-hot/20",
    dot: "bg-hot",
  },
};

function Eyebrow({ children }) {
  return (
    <span className="font-mono text-sm text-cyan tracking-wider uppercase">
      {children}
    </span>
  );
}

function H({ children }) {
  return (
    <h3 className="text-base font-bold text-white mt-6 mb-2 first:mt-0">
      {children}
    </h3>
  );
}

function P({ children }) {
  return (
    <p className="text-sm text-text-muted leading-relaxed mb-3">{children}</p>
  );
}

function Bullets({ items, tone = "electric" }) {
  const t = TONE[tone] || TONE.electric;
  return (
    <ul className="space-y-2 mt-2 mb-3">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-sm text-text-muted leading-relaxed"
        >
          <span
            className={`mt-1.5 w-1.5 h-1.5 rounded-full ${t.dot} flex-shrink-0`}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function GuideTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto -mx-1 my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left font-mono text-[11px] uppercase tracking-wider text-cyan font-semibold border-b border-dark-border px-3 py-2 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-2 border-b border-dark-border/60 leading-relaxed ${c === 0 ? "text-white font-medium" : "text-text-muted"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ tone = "gold", title, children }) {
  const t = TONE[tone] || TONE.gold;
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-4 my-4`}>
      {title && <p className={`text-sm font-bold ${t.text} mb-1`}>{title}</p>}
      <div className="text-sm text-text-muted leading-relaxed">{children}</div>
    </div>
  );
}

function CheckItem({ children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-text-muted leading-relaxed py-1">
      <span className="mt-0.5 text-cyan flex-shrink-0 font-mono">☐</span>
      <span>{children}</span>
    </li>
  );
}

function TwoCol({ left, right }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 my-4">
      {left}
      {right}
    </div>
  );
}

function MiniCard({ tone = "cyan", title, children }) {
  const t = TONE[tone] || TONE.cyan;
  return (
    <div className={`rounded-xl border ${t.border} bg-dark/40 p-4`}>
      <p className={`text-sm font-bold ${t.text} mb-2`}>{title}</p>
      <div className="text-sm text-text-muted leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  );
}

// Cartão de bloco do run-of-show
function BlockCard({
  time,
  title,
  accentTone = "electric",
  objective,
  context,
  opening,
  closing,
  timeSignals,
  transition,
}) {
  const t = TONE[accentTone] || TONE.electric;
  return (
    <div
      className={`rounded-xl border ${t.border} bg-dark/40 my-4 overflow-hidden`}
    >
      <div
        className={`px-4 py-3 ${t.bg} border-b ${t.border} flex items-baseline gap-3`}
      >
        <span className={`font-mono text-xs font-bold ${t.text}`}>{time}</span>
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        {objective && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Objetivo
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              {objective}
            </p>
          </div>
        )}
        {context && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gold mb-1">
              O que esta acontecendo aqui
            </p>
            <p className="text-sm text-text-muted leading-relaxed italic">
              {context}
            </p>
          </div>
        )}
        {opening && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-cyan mb-1">
              Abertura do bloco
            </p>
            <p className="text-sm text-white/80 leading-relaxed italic">
              {opening}
            </p>
          </div>
        )}
        {closing && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-violet mb-1">
              Fechamento
            </p>
            <p className="text-sm text-white/80 leading-relaxed italic">
              {closing}
            </p>
          </div>
        )}
        {timeSignals && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gold mb-1">
              Sinais de tempo
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              {timeSignals}
            </p>
          </div>
        )}
        {transition && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-hot mb-1">
              Transicao
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              {transition}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Secoes ----------

export function VisaoGeral() {
  return (
    <>
      <Eyebrow>Visao Geral do Papel</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        A facilitadora: dona do tempo e da energia
      </h2>
      <P>
        A facilitadora e a pessoa que segura o evento inteiro. Ela esta no
        palco, no microfone, nas transicoes, nos avisos e em qualquer momento em
        que a sala precisa de direcao. Enquanto os mentores pertencem as equipes
        e os jurados avaliam, a facilitadora pertence ao{" "}
        <strong className="text-white">evento como um todo</strong>.
      </P>
      <Callout tone="cyan" title="Voce nao precisa entender de startups">
        Este guia explica todos os termos tecnicas e conceitos de
        empreendedorismo que aparecem no evento — em linguagem simples, antes de
        voce precisar usar. Leia a secao "O Metodo em Linguagem Simples" e o
        "Glossario" antes do primeiro dia. Voce nao vai ensinar o conteudo: isso
        e papel dos palestrantes e mentores. Voce so precisa saber introduzir e
        encerrar cada bloco com confianca.
      </Callout>

      <TwoCol
        left={
          <MiniCard tone="cyan" title="O que a facilitadora FAZ">
            <Bullets
              tone="cyan"
              items={[
                "Conduz aberturas e fechamentos de cada bloco.",
                "Controla o relogio publicamente — informa o tempo restante em voz alta.",
                "Faz a ponte entre organizacao, mentores, jurados e participantes.",
                "Mantém a energia da sala em momentos criticos (madrugada, pós-almoço).",
                "Antecipa imprevistos e improvisa com calma.",
                "Anuncia vencedores e conduz a cerimonia final.",
              ]}
            />
          </MiniCard>
        }
        right={
          <MiniCard tone="hot" title="O que a facilitadora NAO faz">
            <Bullets
              tone="hot"
              items={[
                "Nao decide sobre a metodologia ou regras — isso e da organizacao.",
                "Nao avalia equipes nem influencia jurados.",
                "Nao resolve conflitos tecnicos das equipes — chama o mentor.",
                "Nao entra em debates sobre cronograma com participantes — escala para a organizacao.",
                "Nao improvisa regras novas — confirma com a organizacao antes.",
              ]}
            />
          </MiniCard>
        }
      />

      <H>Os tres eixos do papel</H>
      <GuideTable
        headers={["Eixo", "O que significa", "Como se manifesta"]}
        rows={[
          [
            "Dona do tempo",
            "O relogio e publico e a facilitadora o gerencia",
            "Avisos em voz alta, contagem regressiva, corte gentil mas firme",
          ],
          [
            "Dona da energia",
            "O humor da sala sobe e desce com a facilitadora",
            "Tom de voz, linguagem corporal, celebrar marcos, humor nos momentos certos",
          ],
          [
            "Ponte",
            "Conecta todos os envolvidos sem ser de nenhum",
            "Repassa avisos da org, apresenta mentores e jurados, direciona duvidas",
          ],
        ]}
      />

      <Callout tone="cyan" title="Mantra da facilitadora">
        "Ninguem deve olhar para o relogio e se perguntar quanto tempo falta. Eu
        falo antes."
      </Callout>

      <H>Postura e presenca</H>
      <Bullets
        items={[
          <>
            <strong className="text-white">Voz clara, ritmo moderado.</strong>{" "}
            Hackathon tem ruido de fundo — fale devagar o suficiente para ser
            entendida sem microfone falhando.
          </>,
          <>
            <strong className="text-white">Posicione-se visualmente.</strong>{" "}
            Fique onde todos possam ver ao fazer anuncios; nao fique escondida
            atras de um notebook.
          </>,
          <>
            <strong className="text-white">Nunca demonstre panico.</strong> Se
            algo der errado, respire, sorria, diga "aguardem um segundo" e
            resolva dos bastidores.
          </>,
          <>
            <strong className="text-white">Seja especifica, nao vaga.</strong>{" "}
            "Voces tem 20 minutos" bate mais forte que "tem tempo ainda".
          </>,
        ]}
      />
    </>
  );
}

// ============================================================
// NOVA SECAO: O Metodo em Linguagem Simples
// ============================================================
export function Metodo() {
  return (
    <>
      <Eyebrow>O Metodo em Linguagem Simples</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        O que e este evento — explicado do zero
      </h2>
      <P>
        Voce nao precisa ser especialista em negocios para facilitar este
        evento. Mas entender o que as equipes estao tentando fazer vai te ajudar
        a introduzir cada bloco com confianca e responder perguntas simples de
        participantes. Leia com calma — tudo esta explicado em linguagem
        cotidiana.
      </P>

      <Callout tone="electric" title="O evento em uma frase">
        Equipes de 3 a 6 pessoas tem cerca de 54 horas para transformar um
        problema do mundo real em uma solucao que usa inteligencia artificial —
        e mostrar que essa solucao poderia virar um negocio de verdade.
      </Callout>

      <H>A jornada de cada equipe, em ordem</H>
      <P>
        Pense na jornada das equipes como uma historia em cinco capitulos. Cada
        capitulo constroi sobre o anterior. A facilitadora nao conta essa
        historia — os palestrantes e mentores fazem isso. Mas saber os capitulos
        ajuda voce a entender por que cada bloco do cronograma existe.
      </P>

      <GuideTable
        headers={[
          "Capitulo",
          "Pergunta que a equipe responde",
          "Termo tecnico",
        ]}
        rows={[
          [
            "1. Achar um problema real",
            "Existe uma dor que pessoas realmente sentem e pagariam para resolver?",
            "—",
          ],
          [
            "2. Provar que o problema existe",
            "Como sabemos que nao estamos imaginando o problema? Conversamos com pessoas reais?",
            'Validacao (ou "validar o problema")',
          ],
          [
            "3. Construir a menor versao funcional da solucao",
            "Qual e o minimo que precisamos construir para testar se a solucao funciona?",
            "MVP ou SLC-IA",
          ],
          [
            "4. Mostrar como isso vira dinheiro",
            "Quem paga, quanto paga, e como o negocio cresce?",
            "Modelo de negocio",
          ],
          [
            "5. Apresentar tudo em poucos minutos",
            "Como convencer jurados — em 3 minutos — de que a solucao e real e tem potencial?",
            "Pitch",
          ],
        ]}
      />

      <Callout tone="gold" title="Por que explicar cada termo?">
        Ao longo do evento voce vai ouvir essas palavras constantemente —
        palestrantes, mentores e participantes usam elas o tempo todo. Saber o
        que significam evita que voce fique perdida quando precisar fazer uma
        transicao ou responder uma pergunta rapida.
      </Callout>

      <H>Termos explicados um por um</H>

      <MiniCard tone="cyan" title="Validacao (validar o problema)">
        <P>
          Validar significa provar, com evidencias reais, que o problema que a
          equipe escolheu existe de verdade — nao e so uma suposicao deles. A
          forma mais basica de validar e sair e conversar com pessoas que
          supostamente sofrem com o problema. Se essas pessoas confirmam a dor e
          demonstram interesse em pagar por uma solucao, o problema esta
          "validado". Equipes que chegam no pitch sem ter feito isso perdem
          pontos automaticamente.
        </P>
      </MiniCard>

      <div className="h-3" />

      <MiniCard tone="electric" title="MVP e SLC-IA (a menor versao funcional)">
        <P>
          MVP significa "Produto Minimo Viavel" — a versao mais simples possivel
          de um produto que ainda funciona o suficiente para testar se as
          pessoas querem usar. No HackIA SC, o equivalente chama-se SLC-IA: uma
          solucao Simples, Adoravel e Completa, com inteligencia artificial real
          rodando (nao apenas uma apresentacao de slides). A ideia e construir
          pouco, mas construir de verdade — sem simular ou inventar resultados.
        </P>
      </MiniCard>

      <div className="h-3" />

      <MiniCard tone="violet" title="Modelo de negocio (como o dinheiro entra)">
        <P>
          Modelo de negocio e a descricao de como uma empresa ganha dinheiro: de
          quem, quanto, e com que frequencia. Exemplos simples: uma assinatura
          mensal, uma comissao por venda, ou uma taxa unica. No hackathon, as
          equipes precisam mostrar que pensaram nisso — que a solucao nao e
          apenas uma ideia bonita, mas algo que pode gerar receita.
        </P>
      </MiniCard>

      <div className="h-3" />

      <MiniCard tone="gold" title="Pitch (a apresentacao final)">
        <P>
          Pitch e a apresentacao que cada equipe faz para os jurados ao final do
          evento. No HackIA SC o formato e: 3 minutos de apresentacao oral, 1
          minuto de demonstracao ao vivo da solucao com IA funcionando, 5
          minutos de perguntas dos jurados, e 1 minuto para os jurados testarem
          o produto sozinhos. Nao e uma palestra — e uma apresentacao objetiva,
          cronometrada, onde cada segundo conta.
        </P>
      </MiniCard>

      <div className="h-3" />

      <MiniCard
        tone="hot"
        title="Demo ao vivo (mostrar funcionando de verdade)"
      >
        <P>
          A demo e o momento em que a equipe mostra o produto rodando em tempo
          real — a inteligencia artificial processa uma entrada e mostra um
          resultado na tela, diante dos jurados. Nao e um video gravado, nao e
          um slide com uma captura de tela. E a solucao funcionando de verdade.
          Se a demo ao vivo falhar por problema tecnico, a regra permite usar um
          video gravado como substituto de emergencia (fallback) — mas isso deve
          ser anunciado na abertura.
        </P>
      </MiniCard>

      <H>O que e uma "Sessao Hard" — e por que existem quatro</H>
      <P>
        "Sessao Hard" e o nome que o evento da para os momentos em que um
        especialista convidado ensina conteudo tecnico ou de negocios para todos
        os participantes ao mesmo tempo. "Hard" aqui nao significa dificil —
        significa denso e pratico: e conteudo que as equipes precisam aplicar
        imediatamente depois. Como facilitadora, voce nao ensina o conteudo —
        apenas abre e fecha cada sessao.
      </P>

      <GuideTable
        headers={[
          "Sessao Hard",
          "O que ensina (em uma frase simples)",
          "Quando",
        ]}
        rows={[
          [
            "Sessao Hard 1 — Basics First",
            "Apresenta os eixos economicos de Blumenau, internacionalizacao e como usar IA no produto. Contexto do ecossistema local.",
            "Sexta, 20h20",
          ],
          [
            "Sessao Hard 2 — O seu problema e real?",
            "Ensina como provar que o problema escolhido existe de verdade — e por que isso vale 25% da nota final.",
            "Sabado, 10h",
          ],
          [
            "Sessao Hard 3 — Escalabilidade e Negocio",
            "Ensina como uma solucao vira um negocio que cresce — modelo de receita, custo, e como chegar em mais clientes.",
            "Sabado, 15h",
          ],
          [
            "Sessao Hard 4 — Pitch de Alta Performance",
            "Ensina a estrutura e as tecnicas de um pitch que convence: narrativa, demo ao vivo, gestao do tempo.",
            "Domingo, 10h",
          ],
        ]}
      />

      <H>Os tres perfis de uma equipe — e por que um time precisa dos tres</H>
      <P>
        No HackIA SC, cada equipe e incentivada a ter tres tipos de perfil. Isso
        nao e obrigatorio, mas equipes que tem os tres costumam ir mais longe
        porque as tarefas do hackathon exigem habilidades diferentes ao mesmo
        tempo.
      </P>

      <div className="grid sm:grid-cols-3 gap-3 my-4">
        <MiniCard tone="cyan" title="Hacker — quem programa">
          <P>
            E a pessoa que transforma ideias em codigo funcional. No HackIA SC,
            o Hacker e responsavel por fazer a inteligencia artificial rodar de
            verdade — conectar o produto a uma API de IA real. Sem o Hacker, nao
            ha demo ao vivo.
          </P>
        </MiniCard>
        <MiniCard tone="electric" title="Hustler — quem cuida de negocios">
          <P>
            E a pessoa que valida o problema, busca clientes reais para
            conversar e tenta fechar vendas durante o evento. Sem o Hustler, a
            equipe constroi uma solucao sem saber se alguem quer comprar.
          </P>
        </MiniCard>
        <MiniCard tone="violet" title="Hipster — quem cuida do design">
          <P>
            E a pessoa que pensa na experiencia do usuario: como o produto
            parece, como e facil de usar, se as pessoas entendem o que fazer.
            Sem o Hipster, o produto pode funcionar tecnicamente mas ser confuso
            de usar.
          </P>
        </MiniCard>
      </div>

      <H>Os eixos economicos — o que sao e por que dao bonus de pontuacao</H>
      <P>
        Blumenau tem seis setores economicos principais: Metalmecânico, Textil,
        TIC (Tecnologia da Informacao e Comunicacao), Turismo, Economia Criativa
        e Saude. Equipes que criam solucoes para problemas dentro desses setores
        recebem pontos extras na avaliacao final. Voce nao precisa explicar isso
        em detalhes — basta mencionar na Abertura que "ha bonus de pontuacao
        para equipes que atacam os eixos de governanca de Blumenau" e deixar o
        palestrante da Sessao Hard 1 aprofundar.
      </P>

      <H>Como as equipes sao avaliadas — visao geral para a facilitadora</H>
      <P>
        Os jurados avaliam cada equipe em quatro criterios. Como facilitadora,
        voce nao avalia nada — mas saber os criterios ajuda voce a entender por
        que os participantes levam certos momentos (como a validacao e a demo)
        tao a serio.
      </P>
      <GuideTable
        headers={["Criterio", "Peso", "O que significa em palavras simples"]}
        rows={[
          [
            "Execucao Tecnica e IA",
            "30%",
            "A IA realmente funciona? O produto foi construido de verdade, com codigo real?",
          ],
          [
            "Validacao do Problema",
            "25%",
            "A equipe conversou com pessoas reais e provou que o problema existe?",
          ],
          [
            "Escalabilidade e Negocio",
            "25%",
            "A solucao pode crescer e gerar dinheiro? Tem um modelo de receita claro?",
          ],
          [
            "Pitch e Equipe",
            "20%",
            "A apresentacao foi clara, objetiva e convincente? A equipe demostrou confianca?",
          ],
        ]}
      />

      <Callout tone="violet" title="Jurado vs. Mentor — qual e a diferenca?">
        <strong className="text-white">Mentor</strong> e a pessoa que acompanha
        uma equipe especifica durante todo o evento, ajudando a resolver
        problemas e dando orientacao. Cada equipe tem um mentor fixo.{" "}
        <strong className="text-white">Jurado</strong> e a pessoa que avalia
        todas as equipes no pitch final e decide quem vence. Um mentor nao pode
        ser jurado da propria equipe — isso seria conflito de interesse.
      </Callout>

      <Callout tone="cyan" title="Voce esta pronta">
        Com esse contexto em mao, voce consegue abrir qualquer bloco do
        cronograma com confianca. As secoes seguintes detalham exatamente o que
        dizer em cada momento.
      </Callout>
    </>
  );
}

// ============================================================
// NOVA SECAO: Glossario
// ============================================================
export function Glossario() {
  return (
    <>
      <Eyebrow>Glossario</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Termos do evento — definicoes em linguagem simples
      </h2>
      <P>
        Use este glossario sempre que ouvir uma palavra que nao conhece. Cada
        definicao tem uma frase simples e, quando relevante, uma nota de "o que
        isso significa para voce como facilitadora".
      </P>

      <Callout tone="electric" title="Como usar">
        Leia antes do primeiro dia para ter familiaridade. Durante o evento,
        consulte rapidamente quando precisar. Voce nao precisa decorar — so
        precisa saber onde encontrar.
      </Callout>

      <H>A – H</H>

      <GuideTable
        headers={["Termo", "Definicao simples", "Para a facilitadora"]}
        rows={[
          [
            "Banca de Pre-Pitch",
            "Sessao de avaliacao previa com jurados, no domingo antes do pitch final. E como um ensaio oficial — as equipes apresentam e recebem feedback estruturado para melhorar nos ultimos ajustes.",
            'Voce apresenta cada equipe e controla o tempo. Anuncie que e "avaliacao oficial — levem a serio".',
          ],
          [
            "Demo ao vivo",
            "Bloco do pitch em que a equipe mostra a solucao funcionando em tempo real, com a IA processando uma entrada real na frente dos jurados. Nao e video, nao e simulacao.",
            "Se a demo falhar por problema tecnico, existe um 'fallback de video' — anuncie essa regra na Abertura da sexta.",
          ],
          [
            "Eixos economicos (ou eixos de governanca)",
            "Os seis setores economicos principais de Blumenau: Metalmecânico, Textil, TIC, Turismo, Economia Criativa e Saude. Solucoes nesses setores ganham pontos extras.",
            'Mencione na Abertura: "ha bonus para equipes que atacam os eixos de governanca de Blumenau".',
          ],
          [
            "Escalabilidade",
            "Capacidade de um negocio crescer sem que os custos cresçam na mesma proporcao. Uma empresa escalavel atende 10 vezes mais clientes sem precisar de 10 vezes mais pessoas ou recursos.",
            "Aparece no criterio de avaliacao (25%). Voce nao precisa explicar — o palestrante da Sessao Hard 3 faz isso.",
          ],
          [
            "Hackathon",
            "Evento competitivo e imersivo onde equipes tem um prazo curto (aqui, 54 horas) para criar um produto ou solucao do zero. O nome vem de 'hack' (resolver problemas criativamente) + 'marathon' (intensidade e duracao).",
            "Se alguem perguntar o que e um hackathon, use essa definicao.",
          ],
        ]}
      />

      <H>I – P</H>

      <GuideTable
        headers={["Termo", "Definicao simples", "Para a facilitadora"]}
        rows={[
          [
            "Jurado",
            "Profissional externo que avalia todas as equipes no pitch final e decide os vencedores. Diferente do mentor, o jurado nao acompanha nenhuma equipe durante o evento.",
            "Confirme a chegada dos jurados antes dos pitches e garanta que tenham as rubricas (folhas de avaliacao) em maos.",
          ],
          [
            "Mentor",
            "Profissional que acompanha uma equipe especifica durante todo o evento, orientando sem fazer o trabalho por ela. Cada equipe tem um mentor fixo — o mesmo do inicio ao fim.",
            "Se uma equipe tiver problema, o primeiro passo e chamar o mentor fixo dela, nao resolver voce mesma.",
          ],
          [
            "Modelo de negocio",
            "A descricao de como uma empresa ganha dinheiro: de quem, quanto e com que frequencia. Exemplos: assinatura mensal, comissao por venda, taxa unica por uso.",
            "Aparece na Sessao Hard 3 e no criterio de avaliacao. Voce nao explica — o palestrante explica.",
          ],
          [
            "MVP",
            "'Produto Minimo Viavel' — a versao mais simples possivel de um produto que ainda funciona para testar se as pessoas querem usar. No HackIA SC o equivalente chama-se SLC-IA.",
            "Voce pode ouvir participantes falando 'nosso MVP'. Significa o produto minimo que construiram.",
          ],
          [
            "Pitch",
            "A apresentacao oral e visual que cada equipe faz para os jurados no final do evento. Formato: 3 min de apresentacao + 1 min de demo ao vivo + 5 min de perguntas dos jurados + 1 min de teste.",
            "Voce gerencia o cronometro do pitch. Cada bloco de tempo tem um sinal especifico — veja a secao Encerramento.",
          ],
          [
            "Pitch de Guerrilha",
            "Rodada de feedback rapido e informal onde mentores visitam equipes diferentes das suas e dao critica rapida. Nao e avaliacao oficial — e ensaio e troca de perspectiva.",
            'Anuncie como "nao e avaliacao — e ensaio". Cada equipe tem 5 minutos para apresentar onde esta.',
          ],
          [
            "Problema validado (validacao)",
            "Significa que a equipe saiu, conversou com pessoas reais que sofrem com o problema, e obteve confirmacao de que a dor existe de verdade — e que essas pessoas pagariam por uma solucao. E o oposto de 'achar que o problema existe sem verificar'.",
            "Equipes sem validacao perdem pontos automaticamente. A Sessao Hard 2 ensina como fazer isso.",
          ],
        ]}
      />

      <H>S – Z</H>

      <GuideTable
        headers={["Termo", "Definicao simples", "Para a facilitadora"]}
        rows={[
          [
            "SLC-IA",
            "'Simples, Adoravel e Completo, com IA real'. E o nome que o HackIA SC da para o produto minimo que as equipes devem construir: funcional, bem-feito dentro do escopo pequeno, e com inteligencia artificial rodando de verdade (nao simulada).",
            "Voce ouve muito esse termo nos Working Times. Se alguem perguntar, diga: 'e o produto minimo que a equipe construiu, com IA real funcionando'.",
          ],
          [
            "Sessao Hard",
            "Bloco de conteudo denso dado por um especialista convidado para todos os participantes ao mesmo tempo. O nome nao significa 'dificil' — significa 'intenso e aplicavel agora'.",
            "Voce abre e fecha cada Sessao Hard. O palestrante e que ensina. Veja os scripts no Roteiro.",
          ],
          [
            "Startup",
            "Uma empresa nova que tenta crescer rapido oferecendo um produto ou servico inovador — geralmente em tecnologia. No contexto deste evento, e o tipo de negocio que as equipes estao tentando criar em 54 horas.",
            "Nao precisa usar o termo. Mas se alguem perguntar, use essa definicao.",
          ],
          [
            "Working Time",
            "Bloco do cronograma reservado para as equipes trabalharem livremente — programar, conversar com clientes, montar slides, ensaiar o pitch. A facilitadora nao interrompe durante o Working Time, so avisa quando esta terminando.",
            "Anuncie o inicio, diga quando termina e avise com antecedencia. Sem interrupcoes no meio.",
          ],
        ]}
      />

      <Callout tone="gold" title="Frase de bolso para qualquer situacao">
        Se alguem usar um termo que voce nao reconhece, a resposta certa e
        sempre: "Fala com o seu mentor — ele vai explicar melhor do que eu."
        Voce nao e esperada a conhecer todos os termos tecnicos. Sua funcao e o
        evento fluir — nao dar aula de empreendedorismo.
      </Callout>
    </>
  );
}

export function Checklist() {
  return (
    <>
      <Eyebrow>Antes de Comecar</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Checklist pre-evento
      </h2>
      <Callout tone="cyan">
        Execute este checklist nos 30-60 minutos antes de cada dia comecar.
      </Callout>

      <H>Som e AV</H>
      <ul className="mb-2">
        <CheckItem>
          Microfone testado: nivel de volume, pilha/carga OK, sem feedback.
        </CheckItem>
        <CheckItem>
          Telao ligado e visivel de todos os pontos da sala.
        </CheckItem>
        <CheckItem>
          Slide de "boas-vindas / aguarde" rodando antes de comecar.
        </CheckItem>
        <CheckItem>
          Contato do responsavel tecnico do CIB disponivel no celular (para
          falhas rapidas).
        </CheckItem>
        <CheckItem>
          Fallback para falha de projetor: lista de avisos no WhatsApp do grupo.
        </CheckItem>
      </ul>

      <H>Cronograma do dia</H>
      <ul className="mb-2">
        <CheckItem>
          Cronograma impresso ou aberto no celular com horarios reais
          confirmados.
        </CheckItem>
        <CheckItem>
          Alinhado com a organizacao: algum bloco mudou de horario hoje?
        </CheckItem>
        <CheckItem>
          Contato dos mentores e jurados do dia salvo — saber quem chega quando.
        </CheckItem>
        <CheckItem>
          Lista de equipes inscritas disponivel (nome da equipe + numero de
          membros).
        </CheckItem>
      </ul>

      <H>Alinhamento com mentores e jurados</H>
      <ul className="mb-2">
        <CheckItem>
          Brief rapido (5 min) com mentores antes da abertura: quem esta
          presente, algum imprevisto?
        </CheckItem>
        <CheckItem>
          Para o domingo: confirmado horario de chegada dos jurados para as
          bancas e pitches finais.
        </CheckItem>
        <CheckItem>
          Ordem de fala na abertura definida: organizacao, patrocinadores,
          facilitadora, mentores.
        </CheckItem>
      </ul>

      <H>Avisos pendentes</H>
      <ul className="mb-2">
        <CheckItem>
          Lista de avisos da organizacao para o dia (WhatsApp ou e-mail de
          briefing).
        </CheckItem>
        <CheckItem>
          Avisos operacionais: localizacao de banheiros, saidas de emergencia,
          wifi, alimentacao.
        </CheckItem>
        <CheckItem>
          Regras do espaco (CIB): horario de silencio, uso de areas, politica de
          fotografias.
        </CheckItem>
      </ul>

      <H>Voce mesma</H>
      <ul className="mb-2">
        <CheckItem>Agua na mao — voz vai cansar em 3 dias.</CheckItem>
        <CheckItem>
          Celular no silencioso (mas acessivel para emergencias).
        </CheckItem>
        <CheckItem>Script de abertura revisado para o dia.</CheckItem>
      </ul>
    </>
  );
}

export function Roteiro() {
  return (
    <>
      <Eyebrow>Roteiro por Bloco</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Run-of-show: script de cada bloco
      </h2>
      <Callout tone="electric" title="Como usar esta secao">
        Cada cartao traz o objetivo do bloco, uma nota explicando o que esta
        acontecendo (para voce entender o contexto), o que dizer na abertura e
        no fechamento, os sinais de tempo para dar em voz alta e a frase de
        transicao para o proximo bloco. O campo "O que esta acontecendo aqui" e
        so para voce — nao e para ler em voz alta. Adapte o tom — isto e um
        roteiro, nao um teleprompter.
      </Callout>

      {/* ===== SEXTA ===== */}
      <div className="mt-6 mb-2">
        <span className="font-mono text-xs font-bold text-cyan uppercase tracking-wider">
          Sexta · 29/Mai · 18:30 – 22:00
        </span>
      </div>

      <BlockCard
        time="18:30"
        title="Welcome Coffee"
        accentTone="cyan"
        objective="Recepcionar participantes, criar atmosfera de conversa e apresentacoes, nao deixar a sala ficar em silencio."
        context="As pessoas estao chegando sem se conhecer. Muitos estao nervosos. O cafe e o momento de quebrar o gelo antes de comecar o evento de verdade. Sua funcao aqui e ser o rosto acolhedor do evento — nao precisa fazer discurso, so circular e criar ambiente."
        opening="'Bem-vindos ao HackIA SC! Peguem um cafe, se apresentem para quem esta do lado, e aproveitem — a partir de agora sao 54 horas com essas pessoas. A abertura oficial comeca em instantes.'"
        closing="'Otimo! Vamos comecar a abertura oficial agora. Por favor tomem seus lugares.'"
        timeSignals="Avise 5 min antes do fim: 'Estamos quase la — vao terminando o cafe e se acomodando.'"
        transition="Convidar o representante da organizacao ao microfone para a Abertura."
      />

      <BlockCard
        time="19:00"
        title="Abertura"
        accentTone="cyan"
        objective="Contextualizar o evento, apresentar organizacao, patrocinadores, mentores e as regras. Criar senso de grandiosidade e responsabilidade."
        context="Este e o momento mais importante do primeiro dia. As regras do evento sao explicadas aqui — inclusive a regra de que 'slide com prompt nao conta' (a IA tem que funcionar de verdade, nao so aparecer numa apresentacao). Tambem e aqui que voce anuncia a regra do video de fallback para a demo ao vivo: se a demo ao vivo falhar por problema tecnico durante o pitch, a equipe pode usar um video gravado da IA rodando. O video deve ter sido gravado antes da entrega final."
        opening="'Este e o HackIA SC — um hackathon de venture de IA, aqui em Blumenau. Nos proximos tres dias voces vao construir com IA real, validar com clientes reais, e sair com um produto real. Slide com prompt nao conta. Screenshot do ChatGPT nao conta. Temos jurados, mentores fixos por equipe, e uma IA que tambem vai avaliar os pitches. Bem-vindos.'"
        closing="'Esses sao os pilares. Agora vamos para o momento mais criativo do hackathon: a formacao de times.'"
        timeSignals="Bloco de ~45 min. Avise o orador quando restar 5 min para o horario de Formacao de Times."
        transition="'A partir de agora: quem tem equipe fechada, confirmem os membros. Quem esta sozinho, prepara sua apresentacao de 30 segundos.'"
      />

      <BlockCard
        time="19:45"
        title="Formacao de Times"
        accentTone="cyan"
        objective="Garantir que todos os participantes estejam em uma equipe de 3 a 6 pessoas antes de seguir."
        context="Muitas pessoas vieram sozinhas ou em duplas e precisam completar a equipe. Equipes ideais tem um programador (Hacker), alguem de negocios (Hustler) e alguem de design (Hipster) — mas nao e obrigatorio. O importante e que nenhum participante fique sem equipe ao final. Se ficou alguem sem equipe, escale para a organizacao — nao improvise a solucao sozinha."
        opening="'Momento de formacao! Se voce ja tem equipe, ficam juntos. Se voce veio sozinho ou quer completar sua equipe, voce tem 30 segundos para dizer seu nome, o que voce faz, e o que voce traz para uma equipe. Vamos comecar.'"
        closing="'Equipes formadas. Anotem o nome da equipe — voces vao usar isso durante os proximos tres dias. Se ficou sem equipe, fale com a organizacao agora.'"
        timeSignals="35 min no total. Avise quando restar 10 min: 'Ultimas apresentacoes — quem ainda nao encontrou equipe?'"
        transition="'Otimo. Com equipes definidas, vamos para a primeira sessao de conteudo: Sessao Hard 1.'"
      />

      <BlockCard
        time="20:20"
        title="Sessao Hard 1 — Basics First"
        accentTone="cyan"
        objective="Eixos economicos de Blumenau, internacionalizacao e IA aplicada ao produto. Conteudo dado por especialista convidado."
        context="Esta e a primeira das quatro 'Sessoes Hard' — blocos de conteudo intenso com especialistas. Esta sessao apresenta o contexto local: quais setores economicos de Blumenau dao bonus de pontuacao (Metalmecânico, Textil, TIC, Turismo, Economia Criativa, Saude) e como o uso de IA se conecta com oportunidades de internacionalizacao. As equipes precisam ouvir isso para decidir em que direcao trabalhar. Voce nao explica o conteudo — apenas abre e fecha o bloco."
        opening="'Sessao Hard significa que o conteudo e denso e aplicavel agora. Nao e teoria — e o que voces precisam saber para trabalhar amanha. Prestem atencao nos eixos de governanca: eles dao bonus de pontuacao.'"
        closing="'Obrigada [Nome do palestrante]. Guardem isso — vai aparecer no pitch de voces.'"
        timeSignals="40 min. Avise o palestrante nos 5 min finais com sinal visual (levantar 5 dedos ou cartao)."
        transition="'Ultimo bloco da sexta: Proximos Passos — o que trazer pronto amanha.'"
      />

      <BlockCard
        time="21:00"
        title="Proximos Passos"
        accentTone="cyan"
        objective="Alinhar expectativas para o sabado: o que cada equipe deve ter pronto ate as 9h."
        context="Este e o ultimo bloco da sexta. As equipes vao trabalhar em casa ou no local durante a noite. A mensagem importante e: amanha cedo, cada equipe precisa ja ter pensado em qual problema vai resolver e com quem vai conversar para validar esse problema. Voce nao precisa detalhar isso — a organizacao ou o palestrante faz o briefing. Sua funcao e encerrar o dia com energia positiva."
        opening="'Voces tem a noite. Usem bem. Aqui esta o que esperamos de voces no sabado de manha:'"
        closing="'Durmam. Amanha e o dia mais longo. Estamos aqui as 9h — confirmarao pelo WhatsApp se houver abertura antecipada. Boa noite!'"
        timeSignals="~20 min. Bloco curto, mantenha o ritmo."
        transition="Encerramento da sexta. Agradecer presenca, lembrar horario do sabado."
      />

      {/* ===== SABADO ===== */}
      <div className="mt-8 mb-2">
        <span className="font-mono text-xs font-bold text-electric uppercase tracking-wider">
          Sabado · 30/Mai · 09:00 – madrugada
        </span>
      </div>

      <BlockCard
        time="09:00"
        title="Cafe da Manha e Trabalho"
        accentTone="electric"
        objective="Retomar energia, dar recado de abertura do dia, confirmar que todas as equipes chegaram."
        context="O sabado e o dia mais longo e mais critico. As equipes vao construir o produto, conversar com clientes reais para validar o problema (sair, ligar, mandar mensagem para pessoas), e preparar a primeira versao do pitch. E normal que algumas equipes cheguem ansiosas porque nao avancaram muito na noite. Sua funcao e dar energia, nao pressao."
        opening="'Bom dia! Dia mais longo do HackIA. Cafe incluso, comam bem — voces vao precisar. Hoje: duas Sessoes Hard, dois Working Times, Pitch de Guerrilha e jantar. Confiram com seu mentor se ele esta presente. Qualquer duvida sobre o espaco, venham falar comigo.'"
        closing="Transicao natural — nao ha fechamento formal, o cafe vai ate 10h."
        timeSignals="Avise 10 min antes da Sessao Hard 2: 'Terminando o cafe — Sessao Hard 2 comeca em 10 minutos.'"
        transition="'Vamos para a Sessao Hard 2 — o problema de voces e real?'"
      />

      <BlockCard
        time="10:00"
        title="Sessao Hard 2 — O seu problema e real?"
        accentTone="electric"
        objective="Validacao de problema. Equipes que nao validaram perdem pontos. Conteudo critico para o restante do evento."
        context="Esta e a sessao mais importante do sabado. 'Validar o problema' significa que a equipe saiu e conversou com pessoas reais que supostamente sofrem com a dor que estao tentando resolver — e essas pessoas confirmaram que o problema existe e que pagariam por uma solucao. Equipes que chegam no pitch de domingo sem ter feito isso perdem 25% da pontuacao automaticamente (o criterio 'Validacao do Problema' vale um quarto da nota). Voce nao ensina isso — o palestrante ensina. Mas saber o peso ajuda voce a introduzir com a seriedade certa."
        opening="'Sessao mais importante da manha. Equipes que chegam no pitch sem ter validado o problema com pessoas reais perdem pontos automaticamente. Ouam com atencao — depois do conteudo, voces tem o Working Time para ir validar.'"
        closing="'Duvidas rapidas — voces tem Working Time logo depois para aplicar isso ja.'"
        timeSignals="60 min. Sinal para o palestrante nos 5 min finais."
        transition="'Working Time. Saiam, liguem para pessoas, validem. Voltem com dados.'"
      />

      <BlockCard
        time="11:00"
        title="Working Time"
        accentTone="electric"
        objective="Bloco livre de construcao e validacao. Facilitadora circula, mas nao interrompe equipes."
        context="'Working Time' e o nome que o evento da para os blocos de trabalho livre. As equipes usam esse tempo para programar, conversar com clientes, montar o produto, testar ideias. E o tempo mais valioso do evento — sem interrupcoes. Voce circula pelo espaco, esta disponivel se algo acontecer, mas nao interrompe nenhuma equipe no meio do trabalho."
        opening="'Working Time! Sem interrupcoes, sem avisos no meio. Esse tempo e de voces. Proxima parada: almoco ao meio-dia.'"
        closing="'Encerrado o Working Time. Almoco agora — come bem, descansa 30 minutos, e voltamos construindo.'"
        timeSignals="Avise 15 min antes do almoco: 'Faltam 15 minutos para o almoco. Salvem o progresso.'"
        transition="'Almoco e Trabalho — alimentacao esta pronta. Tragam o notebook se quiserem.'"
      />

      <BlockCard
        time="12:00"
        title="Almoco e Trabalho"
        accentTone="electric"
        objective="Alimentacao completa inclusa. Equipes podem continuar trabalhando. Momento de recuperar energia."
        opening="'Almoco! Alimentacao completa inclusa — aproveitem. Voces podem continuar trabalhando na mesa se quiserem, mas o ideal e dar uma pausa para o cerebro resetar.'"
        closing="'Bom almoco! Voltamos as 13h30 no Working Time.'"
        timeSignals="Avise 10 min antes de 13h30: 'Dez minutos para voltarmos ao Working Time.'"
        transition="'Working Time — com energia renovada.'"
      />

      <BlockCard
        time="13:30"
        title="Working Time"
        accentTone="electric"
        objective="Bloco central de construcao. Ideal ter um SLC-IA (produto minimo com IA funcionando) ate o fim deste bloco (15h)."
        context="Este e o bloco mais critico de construcao tecnica. A meta dos mentores e que cada equipe tenha pelo menos uma chamada de IA funcionando de verdade ate as 15h — ou seja, o produto chama uma API de inteligencia artificial e retorna uma resposta real. Equipes que ainda estao so editando textos de prompt (sem codigo real) estao atrasadas. Voce nao interfere nisso — e papel do mentor. Mas se um mentor te chamar para ajudar a comunicar algo para uma equipe, voce pode ajudar."
        opening="'Working Time pos-almoco. Meta: ter pelo menos um prototipo funcionando ate as 15h. Se a IA da sua equipe ainda nao chamou uma API de verdade, esse e o momento de resolver isso.'"
        closing="'Guardando o Working Time. Sessao Hard 3 em instantes.'"
        timeSignals="Avise 15 min antes da Sessao Hard 3: 'Faltam 15 minutos. Vao concluindo o que estao fazendo e preparem um ponto de save.'"
        transition="'Sessao Hard 3 — escalabilidade e modelo de negocio.'"
      />

      <BlockCard
        time="15:00"
        title="Sessao Hard 3 — Escalabilidade e Negocio"
        accentTone="electric"
        objective="Modelo de negocio e como a solucao pode gerar receita. Conteudo com impacto direto na avaliacao dos jurados."
        context="Esta sessao ensina como uma solucao tecnica vira um negocio que cresce e gera dinheiro. 'Escalabilidade' (escalar) significa crescer sem que os custos cresçam na mesma proporcao — por exemplo, um aplicativo pode atender mil clientes com quase o mesmo custo de atender cem. O 'modelo de negocio' e como o dinheiro entra: assinatura, comissao, taxa por uso, etc. Este conteudo vale 25% da nota dos jurados ('Escalabilidade e Negocio'). Voce nao ensina — o palestrante ensina."
        opening="'Terceira Sessao Hard. Ate agora falamos de problema e construcao. Agora: como isso vira dinheiro de verdade. Prestem atencao — esse conteudo aparece em 25% da rubrica de avaliacao.'"
        closing="'Anotem o que for relevante para o pitch. Working Time logo depois — apliquem isso agora.'"
        timeSignals="60 min. Sinal visual nos 5 min finais."
        transition="'Working Time. Ideal ter o produto funcionando ate agora — se nao tem, simplifiquem o escopo com o mentor.'"
      />

      <BlockCard
        time="16:00"
        title="Working Time"
        accentTone="electric"
        objective="Bloco longo de construcao. Pitch de Guerrilha 1 as 19h — equipes devem estar prontas para apresentar algo."
        context="Faltam 3 horas para o Pitch de Guerrilha 1. 'Pitch de Guerrilha' (explicado a seguir) e uma rodada de apresentacao informal onde cada equipe mostra onde esta. As equipes nao precisam ter o produto perfeito — mas precisam ter algo para mostrar: o problema que escolheram, como a IA funciona, e onde estao no processo. Este Working Time e para elas prepararem isso enquanto continuam construindo."
        opening="'Working Time. Faltam 3 horas para o Pitch de Guerrilha 1. Voce precisa ter algo para mostrar — nao precisa ser perfeito, mas tem que rodar.'"
        closing="'Paramos aqui. Pitch de Guerrilha 1 comeca em instantes.'"
        timeSignals="Avise 30 min antes (18h30): 'Faltam 30 minutos para o Pitch de Guerrilha. Preparem o que vao mostrar.' Avise 10 min antes (18h50): 'Ultimos 10 minutos.'"
        transition="'Pitch de Guerrilha 1. Mentores vao circular pelas equipes — preparem sua apresentacao de 5 minutos.'"
      />

      <BlockCard
        time="19:00"
        title="Pitch de Guerrilha 1"
        accentTone="electric"
        objective="Rodada de feedback cruzado: mentores visitam equipes alheias e dao critica rapida. Nao e avaliacao — e ensaio."
        context="'Pitch de Guerrilha' nao e avaliacao oficial — e um ensaio com feedback rapido. Os mentores circulam pelas equipes (que nao sao as suas proprias) e dao critica em 5 minutos: o problema esta claro? A IA esta funcionando? O modelo de negocio faz sentido? E um momento valioso porque as equipes ouvem perspectivas de fora pela primeira vez. Voce gerencia o tempo — 5 minutos por equipe se necessario — e anuncia o inicio e o fim."
        opening="'Pitch de Guerrilha! Cada equipe tem 5 minutos para apresentar onde esta. Mentores vao circular. Sejam diretos: problema, solucao, IA rodando ou nao. Sem slides obrigatorio — mostrem o produto se tiver.'"
        closing="'Excelente rodada. Voces acabaram de ouvir perspectivas que os jurados tambem vao ter. Usem isso amanha.'"
        timeSignals="~30 min no total dependendo do numero de equipes. Controle o tempo por equipe se necessario."
        transition="'Working Time ate as 21h, depois avisos e jantar.'"
      />

      <BlockCard
        time="19:30"
        title="Working Time"
        accentTone="electric"
        objective="Bloco pos-guerrilha para implementar feedback rapido antes do jantar."
        context="Apos o Pitch de Guerrilha, as equipes receberam feedback de perspectivas diferentes. Este Working Time e curto mas valioso — e o momento para aplicar o que aprenderam antes de jantar e continuar a noite."
        opening="'Ultimo Working Time antes do jantar. Apliquem o feedback que receberam agora.'"
        closing="Transicao natural para Avisos."
        timeSignals="Avise 5 min antes dos avisos."
        transition="'Avisos rapidos da organizacao, depois jantar.'"
      />

      <BlockCard
        time="21:00"
        title="Avisos + Jantar"
        accentTone="electric"
        objective="Repassar informacoes operacionais da organizacao. Jantar incluso."
        opening="'Avisos rapidos antes do jantar. Ouam, porque tem informacao importante para o domingo.'"
        closing="'Jantar esta pronto! Quem quiser continuar trabalhando pode levar o prato. Quem for para casa: lembrem do horario de amanha — confirmamos pelo WhatsApp se houver abertura antecipada.'"
        timeSignals="Avisos: max 10 min. Nao deixe esticar."
        transition="Encerramento oficial do sabado. Lembrar horario do domingo."
      />

      {/* ===== DOMINGO ===== */}
      <div className="mt-8 mb-2">
        <span className="font-mono text-xs font-bold text-violet uppercase tracking-wider">
          Domingo · 31/Mai · 09:00 – 20:00
        </span>
      </div>

      <BlockCard
        time="09:00"
        title="Cafe da Manha"
        accentTone="violet"
        objective="Ultimo dia. Retomar energia, dar recado motivacional e alinhar a linha do tempo ate a cerimonia."
        context="O domingo e o dia das apresentacoes. O cronograma e rigido porque os jurados tem horarios fixos. As equipes vao ter bancas de pre-pitch (ensaio avaliado com jurados antes do pitch final) e depois os pitches finais. A mensagem mais importante hoje de manha e: faltam menos de 9 horas para a entrega final — priorizem o que importa mais (demo ao vivo funcionando, slides fechados, ensaio do pitch)."
        opening="'Ultimo dia! Cafe incluso — comam bem. Hoje o cronograma e rigoroso porque temos bancas e pitches finais com horarios fixos. Vou avisar cada transicao com antecedencia. A entrega final e as 17h30 — sem excecoes. Boa sorte a todos.'"
        closing="Transicao natural para Sessao Hard 4."
        timeSignals="Avise 10 min antes da Sessao Hard 4."
        transition="'Sessao Hard 4 — como fazer um pitch de alta performance.'"
      />

      <BlockCard
        time="10:00"
        title="Sessao Hard 4 — Pitch de Alta Performance"
        accentTone="violet"
        objective="Tecnicas de pitch: estrutura narrativa, demo ao vivo, gestao do tempo de 3+1+5+1 min."
        context="Esta e a ultima Sessao Hard. O palestrante ensina como estruturar a apresentacao de forma que convenca os jurados em 3 minutos — contando a historia do problema descoberto, o que foi construido, e os resultados obtidos. Tambem ensina como fazer a demo ao vivo com seguranca. O formato do pitch final e fixo: 3 minutos de apresentacao oral, 1 minuto de demo ao vivo, 5 minutos de perguntas dos jurados, 1 minuto para os jurados testarem o produto. Voce anuncia esse formato na abertura do bloco."
        opening="'Ultima Sessao Hard. Aprendam isso agora e apliquem hoje. O formato do pitch final e: 3 minutos de apresentacao, 1 minuto de demo ao vivo, 5 minutos de Q&A com jurados, 1 minuto dos jurados testando o produto. Cada segundo conta.'"
        closing="'Pronto para o Pitch de Guerrilha 2 — apliquem imediatamente.'"
        timeSignals="30 min. Bloco curto — mantenha o ritmo."
        transition="'Pitch de Guerrilha 2. Ultima rodada de feedback antes das bancas.'"
      />

      <BlockCard
        time="10:30"
        title="Pitch de Guerrilha 2"
        accentTone="violet"
        objective="Ultima validacao cruzada entre equipes. Feedback focado em pitch e demo, nao em produto."
        context="Segunda rodada de Pitch de Guerrilha, desta vez com foco no pitch em si — clareza da apresentacao, qualidade da narrativa, demo ao vivo funcionando. As equipes ja devem ter um produto mais completo que ontem. O objetivo e que saiam daqui sabendo exatamente o que precisam melhorar antes das bancas oficiais."
        opening="'Pitch de Guerrilha 2. Dessa vez o foco e o pitch em si: clareza, narrativa, demo ao vivo. Voces tem 5 minutos. Mentores circulam. Cronometro comeca agora.'"
        closing="'Pronto. Usem o que aprenderam. Working Time agora — mas preparem o pitch junto com o produto.'"
        timeSignals="Controle rigido: 5 min por equipe se houver tempo limitado."
        transition="'Working Time. Almoco ao meio-dia.'"
      />

      <BlockCard
        time="11:00"
        title="Working Time"
        accentTone="violet"
        objective="Bloco final de construcao antes do almoco. Bancas comecam as 14h."
        context="Faltam 3 horas para as bancas de pre-pitch começarem. As bancas sao avaliacoes oficiais com os jurados — nao e ensaio. As equipes devem priorizar: (1) demo ao vivo funcionando, (2) slides fechados, (3) ensaio do pitch cronometrado. Voce avisa 15 minutos antes do almoco."
        opening="'Working Time. Faltam 3 horas para as bancas. Priorizem: (1) demo ao vivo rodando, (2) slides fechados, (3) ensaio do pitch cronometrado.'"
        closing="Transicao para almoco."
        timeSignals="Avise 15 min antes do almoco: 'Faltam 15 minutos — salvem tudo.'"
        transition="'Almoco.'"
      />

      <BlockCard
        time="12:00"
        title="Almoco"
        accentTone="violet"
        objective="Ultimo almoco. Momento de descanso mental antes da fase final."
        opening="'Almoco! Ultimo do evento. Desliguem o notebook por 30 minutos — o cerebro vai performar melhor.'"
        closing="'Voltamos as 13h30.'"
        timeSignals="Avise 10 min antes de 13h30."
        transition="'Working Time final antes das bancas.'"
      />

      <BlockCard
        time="13:30"
        title="Working Time"
        accentTone="violet"
        objective="Ajustes finais. Bancas de Pre-Pitch comecam as 14h."
        context="Ultimos 30 minutos antes das bancas de pre-pitch. 'Banca de Pre-Pitch' e uma avaliacao previa com os jurados — como um ensaio oficial. Cada equipe apresenta e recebe feedback estruturado dos jurados para melhorar nos ultimos ajustes antes da entrega final. Nao e o pitch definitivo, mas e avaliacao de verdade. As equipes devem usar esses 30 minutos para ensaiar o pitch cronometrado."
        opening="'Ultimos retoques antes das bancas. Faltam 30 minutos. Ensaiem o pitch agora.'"
        closing="Transicao para Banca de Pre-Pitch 1."
        timeSignals="Avise 10 min antes das 14h: 'Banca 1 comeca em 10 minutos — preparem-se.'"
        transition="'Banca de Pre-Pitch 1. Isso e avaliacao oficial — levem a serio.'"
      />

      <BlockCard
        time="14:00"
        title="Banca de Pre-Pitch 1"
        accentTone="violet"
        objective="Primeira rodada de avaliacao previa com jurados. Feedback estruturado para refinamento final."
        context="A Banca de Pre-Pitch e uma avaliacao com jurados reais — diferente do Pitch de Guerrilha, esta conta. As equipes apresentam para os jurados e recebem feedback antes da entrega final. O objetivo e que as equipes saiam sabendo o que melhorar nos ultimos ajustes. Voce gerencia o tempo de cada equipe com sinal visual para os jurados."
        opening="'Banca de Pre-Pitch 1. Os jurados vao avaliar e dar feedback. Usem o que aprenderem nos ultimos ajustes antes da entrega final. Cada equipe tem seu horario — confiram com a organizacao se tiverem duvida sobre o slot.'"
        closing="'Banca 1 encerrada. Pequeno Working Time, depois Banca 2.'"
        timeSignals="Gerencie o tempo por equipe com sinal visual para os jurados."
        transition="'Working Time rapido entre bancas.'"
      />

      <BlockCard
        time="14:30"
        title="Working Time"
        accentTone="violet"
        objective="Janela curta para ajustes pos-Banca 1."
        opening="'Janela de ajustes. Apliquem o feedback da Banca 1.'"
        closing="Transicao para Banca 2."
        timeSignals="Avise 5 min antes da Banca 2."
        transition="'Banca de Pre-Pitch 2 comeca.'"
      />

      <BlockCard
        time="15:30"
        title="Banca de Pre-Pitch 2"
        accentTone="violet"
        objective="Segunda rodada de avaliacao previa. Ultimo feedback antes da entrega."
        context="Segunda e ultima banca de pre-pitch. Apos esta, as equipes tem apenas o Working Time Final antes da entrega em 17h30. A entrega e o 'hard deadline' — horario fixo que nao muda, porque os jurados tem compromissos. Nenhuma alteracao e permitida apos a entrega."
        opening="'Banca de Pre-Pitch 2. Ultima chance de feedback antes da entrega final. Apresentem como se fosse o pitch real.'"
        closing="'Bancas encerradas. Working Time final — entrega as 17h30 sem excecoes.'"
        timeSignals="Gerencie o tempo rigidamente — a Entrega Final as 17h30 e hard deadline."
        transition="'Working Time final.'"
      />

      <BlockCard
        time="16:45"
        title="Working Time Final"
        accentTone="violet"
        objective="Ultimos 45 minutos de construcao. Hard stop as 17h30."
        context="Este e o ultimo bloco de trabalho. As 17h30, nenhuma alteracao e permitida em codigo, slides ou produto. As equipes devem focar em entregar o que esta pronto — nao em comecar coisas novas. O ideal de entrega inclui: repositorio no GitHub, produto acessivel por uma URL publica, e slides do pitch em PDF. Voce da avisos a cada 10 minutos nos ultimos 20 minutos."
        opening="'Working Time final. Faltam 45 minutos para a entrega. A partir das 17h30 nao e permitido alterar codigo, pitch ou produto. Priorizem: entregar o que esta pronto, nao o que esta perfeito.'"
        closing="'STOP. Salvem, fechem, entreguem.'"
        timeSignals="Avise 20 min antes (17h10): 'Faltam 20 minutos.' Avise 10 min antes (17h20): 'Ultimos 10 minutos — conclua, salva, sobe.' Avise 5 min antes (17h25): 'Cinco minutos. Nao comece nada novo.'"
        transition="'Entrega Final e coffee.'"
      />

      <BlockCard
        time="17:30"
        title="Entrega Final"
        accentTone="violet"
        objective="Coleta oficial de pitch, codigo e solucao. Hard deadline — sem alteracoes depois."
        context="A entrega e o momento em que cada equipe envia oficialmente o repositorio com o codigo, a URL do produto publicado na internet, e os slides do pitch em PDF. Sem isso, a equipe nao pode participar dos pitches finais. Voce confirma com a organizacao quem ainda nao entregou e alerta quem estiver em atraso."
        opening="'ENTREGA FINAL. A partir de agora nenhuma alteracao e permitida em codigo, slides ou produto. Confiram com a organizacao o link de entrega. Voces tem cafe a disposicao.'"
        closing="'Entregas recebidas. Vamos para o momento mais esperado: os Pitches Finais e a Premiacao.'"
        timeSignals="30 min. Controle quem ainda nao entregou e alerte a organizacao."
        transition="'Preparem-se para os Pitches Finais. A ordem de apresentacao sera anunciada agora.'"
      />

      <BlockCard
        time="18:00"
        title="Pitches Finais e Premiacao"
        accentTone="violet"
        objective="Cerimonia final: pitches de 3+1+5+1 min por equipe, deliberacao dos jurados, anuncio dos vencedores."
        context="Este e o momento mais importante do evento. Cada equipe apresenta o pitch completo: 3 minutos de apresentacao oral contando a historia do problema ao produto, 1 minuto de demo ao vivo com a IA funcionando de verdade, 5 minutos de perguntas dos jurados, e 1 minuto para os jurados testarem o produto sozinhos. Voce gerencia o cronometro visivelmente e da sinais ao apresentador. Apos todos os pitches, os jurados se retiram para deliberar (decidir os vencedores) enquanto voce entretém a sala. O anuncio dos vencedores vai do 3o lugar ao 1o lugar — guarda o melhor para o fim."
        opening="'Chegamos ao momento final do HackIA SC. Cada equipe tem: 3 minutos de pitch, 1 minuto de demo ao vivo, 5 minutos de perguntas dos jurados, e 1 minuto para os jurados testarem o produto. Vamos comecar pela equipe [Nome].'"
        closing="'Isso foi o HackIA SC 2026. Independente do resultado, voces construiram algo real com IA em 54 horas — isso ja e extraordinario. Obrigada a todos.'"
        timeSignals="Cronometro visivel para apresentadores. Sinal visual nos 30s finais de cada bloco."
        transition="Deliberacao dos jurados. Entretenha a sala com musica ou bate-papo enquanto aguarda."
      />
    </>
  );
}

export function GestaoTempo() {
  return (
    <>
      <Eyebrow>Gestao de Tempo e Transicoes</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Como segurar — e recuperar — o cronograma
      </h2>
      <P>
        Em um hackathon de 54 horas, atrasos se acumulam. A facilitadora e a
        unica pessoa com autoridade e visibilidade para cortar e redirecionar.
        Voce nao precisa de nenhum conhecimento tecnico para isso — so precisa
        de firmeza e clareza na comunicacao.
      </P>

      <H>Regras basicas</H>
      <Bullets
        tone="electric"
        items={[
          <>
            <strong className="text-white">
              Sempre anuncie o tempo restante antes de ser perguntada.
            </strong>{" "}
            Se as pessoas estao olhando para o relogio, voce atrasou o aviso.
          </>,
          <>
            <strong className="text-white">Hard deadlines nao negociam.</strong>{" "}
            Entrega Final (17h30 domingo) e Pitches Finais (18h) sao fixos —
            jurados tem compromissos.
          </>,
          <>
            <strong className="text-white">
              Soft deadlines podem absorver +5 min
            </strong>
            , mas documente internamente e compense no bloco seguinte.
          </>,
          <>
            <strong className="text-white">
              Nao peca desculpa por cortar o tempo.
            </strong>{" "}
            "Vamos seguir em frente" e suficiente — sem drama.
          </>,
        ]}
      />

      <H>Sinais de tempo padrao</H>
      <GuideTable
        headers={["Tempo restante", "Sinal", "O que dizer"]}
        rows={[
          ["20 min", "Aviso verbal", '"Faltam 20 minutos."'],
          [
            "10 min",
            "Aviso verbal + gestual",
            '"Dez minutos. Vao concluindo."',
          ],
          [
            "5 min",
            "Aviso verbal + sinal visual",
            '"Cinco minutos. Terminem o raciocinio atual."',
          ],
          [
            "2 min",
            "Aviso verbal firme",
            '"Dois minutos. Parem de comecar coisas novas."',
          ],
          ["0", "Corte", '"Stop. Obrigada — vamos seguir."'],
        ]}
      />

      <H>Recuperando atraso</H>
      <Bullets
        items={[
          <>
            <strong className="text-white">Ate 10 min de atraso:</strong>{" "}
            absorva no proximo Working Time sem anuncio. Participantes nao
            precisam saber.
          </>,
          <>
            <strong className="text-white">10–20 min de atraso:</strong> anuncie
            a sala — "Ajustamos o cronograma em X minutos, seguimos assim."
            Confirme com a organizacao se o bloco afetado e critico.
          </>,
          <>
            <strong className="text-white">Mais de 20 min:</strong> escale para
            a organizacao imediatamente. Nao decida sozinha cortar blocos de
            conteudo ou sessoes dos jurados.
          </>,
        ]}
      />

      <H>Frases de transicao uteis</H>
      <Callout tone="cyan">
        <ul className="space-y-2">
          <li>"Vamos seguir em frente — [proximo bloco] comeca agora."</li>
          <li>
            "Excelente. Salvem esse ponto para depois — agora temos [proximo
            bloco]."
          </li>
          <li>
            "Faltam 2 minutos — terminem o raciocinio e guardamos as perguntas
            para o intervalo."
          </li>
          <li>"Cronometro zerado. Obrigada, [nome]. Proximo!"</li>
          <li>
            "Estamos um pouco adiantados — aproveitem esses minutos extras no
            Working Time."
          </li>
        </ul>
      </Callout>

      <H>Gerenciamento dos pitches finais</H>
      <P>
        O bloco mais critico de gestao de tempo. Com multiplas equipes e jurados
        presentes, cada minuto extrapolado prejudica as equipes seguintes. Voce
        e o cronometro humano — firme, visivel, e sem desculpas.
      </P>
      <Bullets
        tone="hot"
        items={[
          "Use cronometro visivel na tela (projetor) ou no celular virado para o apresentador.",
          'Ao atingir 3 min: levante a mao e diga "demo" em voz baixa para o apresentador.',
          'Ao atingir 4 min: intervencao em voz alta se necessario — "Partindo para a demo agora."',
          'Ao atingir 10 min (fim do Q&A): "Obrigada, vamos para os jurados testarem — 1 minuto."',
          "Se uma equipe extrapola muito, comprima o intervalo entre equipes, nao o tempo de outra equipe.",
        ]}
      />
    </>
  );
}

export function EnergiaRitmo() {
  return (
    <>
      <Eyebrow>Energia da Sala</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Como gerenciar o ritmo emocional em 54 horas
      </h2>
      <P>
        A curva de energia de um hackathon e previsivel. A facilitadora que
        conhece os vales e os picos age antes de a sala afundar. Voce nao
        precisa de experiencia em startups para isso — precisa de empatia,
        presenca e timing.
      </P>

      <H>Curva de energia esperada</H>
      <GuideTable
        headers={["Momento", "Energia esperada", "Acao da facilitadora"]}
        rows={[
          [
            "Abertura (sexta 19h)",
            "Alta — adrenalina inicial",
            "Amplificar: discurso energetico, ritmo rapido",
          ],
          [
            "Formacao de times (sexta 19h45)",
            "Ansiedade + excitacao",
            "Tranquilizar e encorajar quem esta sozinho",
          ],
          [
            "Sabado manha (9h)",
            "Media — pessoas cansadas",
            "Cafe, tom animado, lembrar do objetivo do dia",
          ],
          [
            "Sabado pos-almoco (13h30)",
            "Baixa — sono",
            "Musica de fundo, aviso energetico, andar pela sala",
          ],
          [
            "Pitch de Guerrilha 1 (19h sabado)",
            "Alta — adrenalina do pitch",
            "Criar competitividade saudavel, celebrar os melhores momentos",
          ],
          [
            "Sabado noite / madrugada",
            "Critica — cansaco profundo",
            "Presenca, apoio, celebrar pequenas vitorias, lembrar que e a ultima noite",
          ],
          [
            "Domingo manha (9h)",
            "Alta — ultimo dia",
            "Discurso motivacional curto, lembrar do legado",
          ],
          [
            "Entrega final (17h30)",
            "Tensa — deadline",
            "Tom sereno e firme, sem drama, celebrar a conclusao",
          ],
          [
            "Pitches finais (18h)",
            "Alta — cerimonia",
            "Apresentador energetico, comemorar cada equipe",
          ],
        ]}
      />

      <H>Como abrir com energia</H>
      <Bullets
        tone="cyan"
        items={[
          "Entre no palco com passo firme e sorriso real — o corpo comunica antes da voz.",
          'Comece com uma afirmacao, nao com uma pergunta. "Bem-vindos" bate mais que "Boa noite, tudo bem?"',
          "Primeira frase em voz mais alta do que o tom normal — marca o inicio.",
          "Cite o numero de participantes ou o que eles vao construir — torna concreto o que e abstrato.",
        ]}
      />

      <H>Lidar com queda de animo (madrugada de sabado)</H>
      <Callout tone="gold" title="Sabado 23h–3h e o momento mais dificil">
        Participantes estao exaustos, o produto nao funciona direito, e a
        apresentacao parece distante. A facilitadora nao precisa fingir que e
        facil — pode reconhecer o cansaco e ao mesmo tempo lembrar que e so mais
        uma noite. Voce nao precisa entender de codigo ou de startups para dar
        apoio humano — isso qualquer pessoa pode fazer.
      </Callout>
      <Bullets
        items={[
          '"Eu sei que voces estao cansados. Todo mundo que venceu um hackathon passou por isso. E essa noite."',
          "Circule pela sala — presenca fisica conta mais que discurso no microfone.",
          'Celebre qualquer marco visivel: "A equipe [X] acabou de subir o primeiro produto funcionando!"',
          "Musica instrumental de fundo (volume baixo) ajuda a manter o ritmo sem distrair.",
          "Encoraje pausas curtas de 10–15 min para quem travou — cabeca cansada nao produz.",
        ]}
      />

      <H>Comemorar marcos do evento</H>
      <Bullets
        tone="electric"
        items={[
          <>
            <strong className="text-white">Formacao de times concluida:</strong>{" "}
            "Todas as equipes formadas — o HackIA SC 2026 comecou de verdade
            agora!"
          </>,
          <>
            <strong className="text-white">
              Primeira IA funcionando ao vivo:
            </strong>{" "}
            celebre quando um mentor reportar — "Equipe [X] tem IA rodando!"
          </>,
          <>
            <strong className="text-white">Entrega final concluida:</strong>{" "}
            "Todas as equipes entregaram. Isso por si so ja e uma vitoria."
          </>,
          <>
            <strong className="text-white">Fim da cerimonia:</strong> reconhecer
            todos, nao so os vencedores.
          </>,
        ]}
      />
    </>
  );
}

export function Imprevistos() {
  return (
    <>
      <Eyebrow>Imprevistos Comuns</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Como lidar com o que nao esta no script
      </h2>
      <P>
        Imprevistos sao certeza em hackathons. A seguir, os cenarios mais comuns
        e como a facilitadora deve reagir — sempre com calma e sem improvisar
        regras. A regra de ouro e simples: qualquer coisa que envolva mudar uma
        regra do evento passa pela organizacao. Voce nao decide sozinha.
      </P>

      <TwoCol
        left={
          <MiniCard tone="gold" title="Atraso no cronograma">
            <P>Palestrante atrasado, bloco anterior estourou.</P>
            <Bullets
              tone="gold"
              items={[
                "Ate 10 min: absorva no proximo Working Time em silencio.",
                "10-20 min: informe a sala brevemente, confirme com a org.",
                "Mais de 20 min: escale para a organizacao — nao decida sozinha.",
              ]}
            />
          </MiniCard>
        }
        right={
          <MiniCard tone="electric" title="Equipe sem time (pessoa solta)">
            <P>Participante sozinho apos a formacao de times.</P>
            <Bullets
              tone="electric"
              items={[
                'Levante na formacao de times: "Quem ainda nao tem equipe?"',
                "Conecte com equipes que tem vagas (menos de 6 membros).",
                "Se ninguem aceitar: chamar a organizacao para decidir.",
              ]}
            />
          </MiniCard>
        }
      />

      <TwoCol
        left={
          <MiniCard tone="hot" title="Equipe travada / conflito interno">
            <P>Equipe visivelmente em conflito ou paralisia.</P>
            <Bullets
              tone="hot"
              items={[
                "Nao intervenha diretamente — chame o mentor fixo da equipe.",
                "Se nao houver mentor disponivel, chame a organizacao.",
                "Nao tome partido nem proponha solucoes de produto.",
              ]}
            />
          </MiniCard>
        }
        right={
          <MiniCard tone="violet" title="Falha tecnica no pitch">
            <P>
              Demo nao abre, internet cai, projetor falha durante o pitch. A
              "demo" e o momento em que a IA roda ao vivo — se falhar, ha uma
              regra de fallback.
            </P>
            <Bullets
              tone="violet"
              items={[
                'Mantenha calma e diga: "Aguardem um momento — resolvendo."',
                "Acione o tecnico do CIB imediatamente.",
                'Se nao resolver em 60 segundos: "Equipe, podem prosseguir sem a demo ou usar o video de fallback."',
                "Video de fallback e permitido — anuncie isso como regra ja na abertura.",
              ]}
            />
          </MiniCard>
        }
      />

      <MiniCard tone="cyan" title="Regra geral para qualquer imprevisto">
        <Bullets
          tone="cyan"
          items={[
            "Nao entre em panico visivelmente — a sala espelha o humor da facilitadora.",
            "Nao improvise regras novas em publico sem consultar a organizacao.",
            "Diga o que esta acontecendo em uma frase curta, depois resolva nos bastidores.",
            '"Aguardem um momento" e suficiente — sem explicacoes longas.',
          ]}
        />
      </MiniCard>

      <H>Fallback de video na demo — anuncie na abertura</H>
      <Callout
        tone="violet"
        title="Regra oficial (anunciar na Abertura da sexta)"
      >
        "Se a demo ao vivo falhar por problema tecnico durante o pitch, a equipe
        pode usar um video gravado da IA rodando como substituto de emergencia.
        O video deve ter sido gravado antes da entrega final. Nao e permitido
        gravar o video depois da falha." — Anuncie isso ja na Abertura da sexta,
        para que todos saibam a regra antes de precisar.
      </Callout>

      <H>Pessoa sem time — script especifico</H>
      <P>
        Cenario: apos a formacao de times, um participante fica sozinho e
        nenhuma equipe tem vaga. Nao e um problema de regra — e um problema
        humano. Lide com empatia e rapidez.
      </P>
      <Bullets
        items={[
          "Nao force a equipe a aceitar — isso cria dinamica ruim.",
          "Opcao 1: pergunte se alguem toparia formar uma equipe de individuais (equipe nova de 2-3).",
          "Opcao 2: o participante participa como ouvinte e voluntario e recebe certificado de participacao.",
          "Opcao 3: a organizacao decide — escale imediatamente, nao deixe a pessoa em limbo.",
        ]}
      />
    </>
  );
}

export function Encerramento() {
  return (
    <>
      <Eyebrow>Encerramento e Premiacao</Eyebrow>
      <h2 className="text-2xl font-bold text-white mt-3 mb-4">
        Conduzindo a cerimonia final
      </h2>
      <P>
        O encerramento e o momento mais lembrado do evento. A cerimonia deve ser
        energetica, justa na percepcao das equipes, e celebratoria para todos —
        nao so para os vencedores. Voce e quem da o tom — e o tom certo e
        orgulho coletivo.
      </P>

      <H>Antes dos pitches</H>
      <Bullets
        tone="electric"
        items={[
          "Confirmar ordem de apresentacao com a organizacao (sorteio ou ordem alfabetica).",
          "Anunciar a ordem para todas as equipes antes de comecar.",
          "Verificar que o cronometro esta visivel para o apresentador (telao ou celular).",
          "Confirmar que os jurados tem as rubricas (folhas de avaliacao) em maos.",
          "Lembrar o formato em voz alta para a sala: 3 min pitch + 1 min demo ao vivo + 5 min perguntas + 1 min teste.",
          "Anunciar a regra de fallback de video antes de comecar.",
        ]}
      />

      <H>Durante cada pitch</H>
      <Bullets
        items={[
          'Apresentar cada equipe pelo nome antes de subir ao palco: "[Nome da Equipe] — boa sorte!"',
          "Controlar o cronometro e dar sinais visuais (levantar dedos) ao apresentador.",
          "Ao final de cada pitch, agradecer a equipe com entusiasmo genuino, independente da qualidade.",
          "Manter silencio da plateia durante as perguntas dos jurados — interromper conversas paralelas com olhar firme.",
        ]}
      />

      <H>Deliberacao dos jurados</H>
      <P>
        Apos todos os pitches, os jurados se retiram para decidir os vencedores.
        "Deliberar" significa discutir e chegar em um consenso sobre quem
        ganhou. Enquanto isso, voce entretém a sala.
      </P>
      <Bullets
        tone="violet"
        items={[
          'Anunciar o tempo estimado de deliberacao: "Os jurados vao deliberar por aproximadamente X minutos."',
          "Entretenha a sala: musica, momento de networking ou conversa aberta com a plateia.",
          "Nao revele nada sobre o resultado antes do anuncio oficial — mesmo que alguem pergunte.",
          "Confirme com a organizacao se ha mencoes especiais antes do anuncio principal.",
        ]}
      />

      <H>Ordem de anuncio dos vencedores</H>
      <P>
        Convencao: do menor para o maior impacto — guarde o melhor para o fim. A
        tensao cresce a cada anuncio e o pico fica para o campeo.
      </P>
      <GuideTable
        headers={["Ordem", "Premio", "Tom"]}
        rows={[
          [
            "1",
            "Mencoes honrosas e premios especiais (bonus de governanca, internacionalizacao etc.)",
            "Entusiasmado — toda mencao e real",
          ],
          ["2", "3o lugar", "Celebratorio"],
          ["3", "2o lugar", "Crescendo em energia"],
          [
            "4",
            "1o lugar — campeo",
            "Pico de energia — pausa dramatica antes de revelar",
          ],
        ]}
      />

      <H>Script de anuncio dos vencedores</H>
      <Callout tone="gold" title="Exemplo de fala para o 1o lugar">
        "E o campeo do HackIA SC 2026 e... [pausa de 2-3 segundos]... a equipe
        [NOME]! [aguardar aplausos] Em 54 horas, voces construiram [breve
        descricao do produto]. Parabens — o Brasil precisa mais de pessoas como
        voces."
      </Callout>

      <H>Discurso de encerramento — todos os participantes</H>
      <Callout tone="cyan">
        <p className="mb-2">
          Apos o anuncio dos vencedores, antes de encerrar:
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            "Independente de quem ganhou, voces fizeram algo que a maioria das
            pessoas nunca faz: construiram um produto real com inteligencia
            artificial, mostraram para clientes reais, e apresentaram para
            jurados reais."
          </li>
          <li>
            "Isso fica. O codigo fica. O aprendizado fica. E as pessoas que
            voces conheceram aqui ficam."
          </li>
          <li>
            "Obrigada a organizacao, aos mentores, aos jurados, ao CIB, e a
            todos voces. O HackIA SC 2026 esta encerrado."
          </li>
        </ul>
      </Callout>

      <H>Apos a cerimonia</H>
      <Bullets
        tone="electric"
        items={[
          "Anunciar networking livre e disponibilidade de lanche ou bebida se houver.",
          "Lembrar sobre certificados de participacao (envio por e-mail).",
          "Agradecer equipe de organizacao pelo nome — eles trabalharam nos bastidores.",
          "Foto oficial de todas as equipes antes de dispersar.",
        ]}
      />
    </>
  );
}
