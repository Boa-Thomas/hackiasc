# Certificado HTML liberado pela pesquisa — Design

**Data:** 2026-06-02
**Status:** Aprovado (design), pendente spec review do usuário
**Escopo:** Recriar o certificado de participação em HTML/CSS (com impressão nativa do navegador) e liberá-lo apenas para participantes que **encerraram o evento e responderam a pesquisa de avaliação**.

## Objetivo

Hoje o certificado é desenhado via jsPDF (API vetorial) e liberado só pela data de
término do evento. Queremos:

1. **Formatação HTML** — certificado renderizado em HTML/CSS (mais fácil de estilizar),
   exibido na tela e salvável em PDF pelo diálogo de impressão do navegador.
2. **Gate pela pesquisa** — disponível só para quem respondeu a avaliação do evento
   (`event_evaluations`), além do evento já ter terminado.

## Decisões (do brainstorming)

| Decisão               | Escolha                                                              |
| --------------------- | ------------------------------------------------------------------- |
| Formato de saída      | **HTML na tela + `window.print()`** (Salvar como PDF). Sem libs novas |
| Gate                  | **Evento encerrado E pesquisa respondida** (dois gates combinados)   |
| Identidade visual     | **Ambas**: dark/neon na tela, versão **clara** automática na impressão |
| jsPDF                 | **Removido** (fica órfão; usado só neste arquivo)                    |
| Enforcement do gate   | **Client-side** (igual ao gate por data atual) — ver seção Segurança |

## Estado atual

- `src/participant/CertificateSection.jsx` — desenha o PDF com jsPDF; gate único
  `now >= EVENT_CONFIG.eventEndDate`. Recebe só `profile`.
- Renderizado em `EventInfoSection` (aba **Evento**) do `ParticipantPanel`, que recebe
  apenas `profile`.
- A "pesquisa" é a avaliação do evento: RPC `get_my_event_evaluation(p_token, p_type)`
  retorna `{ authorized, open, submitted, scores, comment, created_at }`. `submitted`
  é o sinal de "respondeu". Para participante exige token de sessão + pagamento confirmado.
- `jspdf` é dependência usada **somente** em `CertificateSection.jsx`.

## Gate (máquina de estados)

Helper puro, isolado e testável — `src/participant/certificateGate.js`:

```js
// → 'loading' | 'locked_event' | 'locked_survey' | 'locked_survey_closed' | 'available'
export function gateState({ loaded, eventEnded, submitted, surveyOpen }) {
  if (!loaded) return 'loading'
  if (!eventEnded) return 'locked_event'
  if (submitted) return 'available'
  return surveyOpen ? 'locked_survey' : 'locked_survey_closed'
}
```

| Estado                  | Condição                                   | Mensagem na UI                                                                 |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `loading`               | status da pesquisa ainda carregando        | "Carregando…"                                                                  |
| `locked_event`          | evento ainda não terminou                  | "Disponível após o evento (31/05)"                                            |
| `locked_survey`         | terminou, não respondeu, pesquisa **aberta** | "Responda a pesquisa de avaliação para liberar seu certificado" + botão → aba **Avaliação** |
| `locked_survey_closed`  | terminou, não respondeu, pesquisa **fechada** | "A pesquisa de avaliação está encerrada. Fale com a organização para liberar seu certificado." |
| `available`             | terminou **E** respondeu                   | Certificado + botão "Imprimir / Salvar como PDF"                              |

**Degradação:** sem Supabase/token, RPC com erro, ou `authorized:false` → trata como
`{ loaded:true, submitted:false, surveyOpen:false }`. Resultado: nunca cai em `available`
por engano (pré-evento mostra `locked_event`; pós-evento mostra `locked_survey_closed`).

## Componentes e fluxo de dados

### `CertificateSection.jsx` (reescrito)

- **Props:** `profile`, `token`, `onGoToEvaluation`.
- No mount: `supabase.rpc('get_my_event_evaluation', { p_token: token, p_type: 'participant' })`
  → guarda `{ loaded, submitted: !!data.submitted, surveyOpen: !!data.open }` (com cleanup
  `active` para evitar set após unmount, padrão já usado no repo).
- `eventEnded = new Date() >= new Date(EVENT_CONFIG.eventEndDate)`.
- `state = gateState({ loaded, eventEnded, submitted, surveyOpen })` → renderiza o card de
  status correspondente. Em `locked_survey`, o botão chama `onGoToEvaluation()`.
- Em `available`: renderiza o certificado HTML (`<div id="participant-certificate" …>`) +
  botão "Imprimir / Salvar como PDF" que chama `window.print()`.

### `ParticipantPanel.jsx`

- `EventInfoSection` passa a receber `token` e `onGoToEvaluation` e repassa ao
  `CertificateSection`. Call site:
  `<EventInfoSection profile={profile} token={auth.token} onGoToEvaluation={() => setTab('evaluation')} />`.

## Visual e impressão

- **Tela (dark/neon):** replica o layout atual em HTML/CSS — fundo `#050510`, borda e
  cantos em colchete neon (cyan/electric/violet/gold), barras de cor no topo/rodapé,
  "CERTIFICADO DE PARTICIPAÇÃO", nome em `gold`, corpo com `EVENT_CONFIG.name`/`dates`/
  `city`/`location`/`organizer`. Proporção A4 paisagem (≈ 297×210).
- **Impressão (versão clara):** bloco `@media print` no `src/index.css`:
  - `@page { size: A4 landscape; margin: 0 }`.
  - Oculta o resto da página e mostra só o certificado:
    `body * { visibility: hidden }` + `#participant-certificate, #participant-certificate * { visibility: visible }`
    + `#participant-certificate { position: fixed; inset: 0 }`.
  - Tema claro: fundo branco, texto escuro. Inversões por elemento via variantes
    `print:` do Tailwind v4 (ex.: `text-white print:text-[#1a1a2e]`, `bg-dark print:bg-white`).
    Acentos coloridos (nome em gold, barras) podem ser mantidos — pouca tinta e reforçam a marca.
  - Imprime confiável em qualquer navegador, **sem** depender do toggle "gráficos de plano de fundo".
- **Nome do arquivo:** antes do `print()`, define `document.title = 'certificado-hackia-sc-<slug>'`
  (reaproveita o `toSlug` existente) e restaura em `onafterprint` — assim o "Salvar como PDF"
  sugere um nome bom.

## Testes

- **Unitário (vitest)** de `gateState` cobrindo os 5 estados + degradação (loaded com
  submitted/surveyOpen false). Co-localizado: `src/participant/certificateGate.test.js`.
- **Manual (dev server):** preview dark na aba Evento; `Ctrl+P` mostra a versão clara;
  verificar cada estado de gate forçando `submitted`/data.

## Arquivos afetados

- `src/participant/CertificateSection.jsx` — reescrita (HTML + gate + print; remove jsPDF).
- `src/participant/certificateGate.js` — novo helper puro.
- `src/participant/certificateGate.test.js` — novo teste.
- `src/participant/ParticipantPanel.jsx` — threading de `token` + `onGoToEvaluation`.
- `src/index.css` — bloco `@media print` do certificado.
- `package.json` / `package-lock.json` — remove `jspdf`.

## Segurança

O gate é **client-side**, igual ao gate por data atual. O certificado é gerado no cliente
a partir do `profile` e não contém segredo — é um certificado de participação (baixo risco;
o gate serve de incentivo a responder a pesquisa). Blindar no backend (uma RPC que só
devolve os dados do certificado quando `submitted` e evento encerrado, ou um token assinado)
é possível como follow-up, mas **fora de escopo** aqui.

## Fora de escopo (YAGNI)

- Enforcement server-side / certificado assinado.
- Certificado de mentor/jurado (este escopo é só participante).
- html2canvas / download .pdf rasterizado.
- Rota/página dedicada do certificado.
- Verificação pública do certificado (QR/URL de validação).
