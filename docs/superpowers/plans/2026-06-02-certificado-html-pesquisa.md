# Certificado HTML liberado pela pesquisa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recriar o certificado de participação em HTML/CSS (impressão nativa do navegador) e liberá-lo só para quem encerrou o evento E respondeu a pesquisa de avaliação.

**Architecture:** Um helper puro decide o estado do certificado a partir de 4 sinais (carregado / evento encerrado / pesquisa respondida / pesquisa aberta). `CertificateSection` busca o status da pesquisa via RPC `get_my_event_evaluation`, combina com a data de término e renderiza: card de status (4 variações de bloqueio) ou o certificado HTML + botão de impressão. A versão de tela é dark/neon; um bloco `@media print` no `index.css` produz a versão clara A4 paisagem. O jsPDF é removido (fica órfão).

**Tech Stack:** React 19, Tailwind CSS v4 (variantes `print:`), Vite 8, Vitest 4, Supabase RPC. Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-06-02-certificado-html-pesquisa-design.md`

---

### Task 1: Helper puro do gate (`gateState`)

**Files:**
- Create: `src/participant/certificateGate.js`
- Test: `src/participant/certificateGate.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/participant/certificateGate.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { gateState } from './certificateGate'

// base = caminho feliz (tudo verdadeiro); cada teste muda só o que importa.
const base = { loaded: true, eventEnded: true, submitted: true, surveyOpen: true }

describe('gateState', () => {
  it('mostra loading enquanto o status da pesquisa não carregou', () => {
    expect(gateState({ ...base, loaded: false })).toBe('loading')
  })

  it('trava por data enquanto o evento não terminou', () => {
    expect(gateState({ ...base, eventEnded: false, submitted: false })).toBe('locked_event')
  })

  it('libera quando o evento terminou E a pesquisa foi respondida', () => {
    expect(gateState({ ...base })).toBe('available')
  })

  it('pede a pesquisa: terminou, não respondeu, pesquisa aberta', () => {
    expect(gateState({ ...base, submitted: false, surveyOpen: true })).toBe('locked_survey')
  })

  it('avisa pesquisa encerrada: terminou, não respondeu, pesquisa fechada', () => {
    expect(gateState({ ...base, submitted: false, surveyOpen: false })).toBe('locked_survey_closed')
  })

  it('degradação pós-evento (erro/sem token) nunca libera → locked_survey_closed', () => {
    expect(gateState({ loaded: true, eventEnded: true, submitted: false, surveyOpen: false }))
      .toBe('locked_survey_closed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/participant/certificateGate.test.js`
Expected: FAIL — não resolve `./certificateGate` (o módulo ainda não existe).

- [ ] **Step 3: Write minimal implementation**

Create `src/participant/certificateGate.js`:

```js
// Decide o estado do certificado a partir de sinais já resolvidos.
// Ordem importa: data antes da pesquisa; pesquisa respondida antes de checar se está aberta.
// → 'loading' | 'locked_event' | 'locked_survey' | 'locked_survey_closed' | 'available'
export function gateState({ loaded, eventEnded, submitted, surveyOpen }) {
  if (!loaded) return 'loading'
  if (!eventEnded) return 'locked_event'
  if (submitted) return 'available'
  return surveyOpen ? 'locked_survey' : 'locked_survey_closed'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/participant/certificateGate.test.js`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/participant/certificateGate.js src/participant/certificateGate.test.js
git commit -m "feat(certificate): pure gate helper for survey-gated certificate"
```

---

### Task 2: Reescrever `CertificateSection` (HTML + gate + print)

**Files:**
- Modify (full rewrite): `src/participant/CertificateSection.jsx`

Substitui o desenho jsPDF por um certificado HTML. Mantém `toSlug` (usado para sugerir o nome do PDF no diálogo de impressão). Remove `downloadCertificate` e o `import('jspdf')`.

- [ ] **Step 1: Replace the whole file**

Sobrescreva `src/participant/CertificateSection.jsx` com:

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'
import { gateState } from './certificateGate'

/** Converte um nome em slug seguro para o nome do arquivo PDF. */
function toSlug(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** O certificado em si — dark/neon na tela, claro na impressão (ver @media print no index.css). */
function CertificateSheet({ profile }) {
  return (
    <div
      id="participant-certificate"
      className="relative mx-auto flex aspect-[1.414/1] w-full max-w-3xl flex-col items-center justify-center overflow-hidden rounded-2xl border border-cyan/40 bg-dark px-[8%] text-center text-white print:max-w-none print:aspect-auto print:rounded-none print:border-0 print:bg-white print:text-black"
    >
      {/* Barras de cor — topo */}
      <div className="absolute inset-x-0 top-0 flex h-1.5">
        <span className="flex-1 bg-cyan" />
        <span className="flex-1 bg-electric" />
        <span className="flex-1 bg-violet" />
      </div>

      {/* Cantos em colchete */}
      <span className="pointer-events-none absolute left-4 top-4 h-7 w-7 border-l-2 border-t-2 border-cyan" />
      <span className="pointer-events-none absolute right-4 top-4 h-7 w-7 border-r-2 border-t-2 border-electric" />
      <span className="pointer-events-none absolute bottom-4 left-4 h-7 w-7 border-b-2 border-l-2 border-violet" />
      <span className="pointer-events-none absolute bottom-4 right-4 h-7 w-7 border-b-2 border-r-2 border-gold" />

      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-cyan sm:text-xs print:text-[10pt]">
        {EVENT_CONFIG.brand}
      </p>

      <h2 className="mt-3 text-lg font-bold tracking-wide sm:text-3xl print:text-[26pt] print:text-black">
        CERTIFICADO DE PARTICIPAÇÃO
      </h2>
      <span className="mt-2 h-px w-40 bg-electric" />

      <p className="mt-4 text-[11px] text-text-muted sm:text-sm print:text-[11pt] print:text-neutral-600">
        Certificamos que
      </p>

      <p className="mt-1 text-2xl font-bold text-gold sm:text-4xl print:text-[30pt]">
        {profile.full_name}
      </p>
      <span className="mt-2 h-px w-56 bg-gold" />

      <p className="mt-4 text-sm text-white/90 sm:text-base print:text-[13pt] print:text-black">
        participou do <span className="font-semibold">{EVENT_CONFIG.name}</span>
      </p>
      <p className="mt-1 text-[11px] text-text-muted sm:text-sm print:text-[11pt] print:text-neutral-600">
        realizado nos dias {EVENT_CONFIG.dates}, em {EVENT_CONFIG.city}.
      </p>

      <span className="mt-4 rounded-full border border-violet px-4 py-1 text-[10px] text-violet sm:text-xs print:text-[10pt]">
        {EVENT_CONFIG.location}
      </span>

      {/* Rodapé — organização */}
      <div className="absolute inset-x-0 bottom-7 text-center">
        <p className="text-[9px] text-text-muted sm:text-[11px] print:text-[9pt] print:text-neutral-600">
          {EVENT_CONFIG.organizer.company}
        </p>
        <p className="text-[9px] text-text-muted sm:text-[11px] print:text-[9pt] print:text-neutral-600">
          {EVENT_CONFIG.organizer.email}
        </p>
      </div>

      {/* Barras de cor — rodapé */}
      <div className="absolute inset-x-0 bottom-0 flex h-1.5">
        <span className="flex-1 bg-cyan" />
        <span className="flex-1 bg-electric" />
        <span className="flex-1 bg-gold" />
      </div>
    </div>
  )
}

export default function CertificateSection({ profile, token, onGoToEvaluation }) {
  const [evalStatus, setEvalStatus] = useState({ loaded: false, submitted: false, surveyOpen: false })

  useEffect(() => {
    if (!supabase || !token) {
      setEvalStatus({ loaded: true, submitted: false, surveyOpen: false }) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    let active = true
    supabase
      .rpc('get_my_event_evaluation', { p_token: token, p_type: 'participant' })
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data || !data.authorized) {
          setEvalStatus({ loaded: true, submitted: false, surveyOpen: false })
          return
        }
        setEvalStatus({ loaded: true, submitted: !!data.submitted, surveyOpen: !!data.open })
      })
    return () => { active = false }
  }, [token])

  const eventEnded = new Date() >= new Date(EVENT_CONFIG.eventEndDate)
  const state = gateState({
    loaded: evalStatus.loaded,
    eventEnded,
    submitted: evalStatus.submitted,
    surveyOpen: evalStatus.surveyOpen,
  })

  const endDateLabel = new Date(EVENT_CONFIG.eventEndDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  function handlePrint() {
    const prev = document.title
    document.title = `certificado-hackia-sc-${toSlug(profile.full_name)}`
    const restore = () => {
      document.title = prev
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  return (
    <div className="card-glass rounded-2xl p-6 border border-gold/30">
      <div className="flex items-start gap-4">
        {/* Ícone */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Certificado de Participação</p>
          <p className="text-sm text-white font-semibold leading-snug">{EVENT_CONFIG.name}</p>
          <p className="text-xs text-text-muted mt-1">{EVENT_CONFIG.dates} · {EVENT_CONFIG.city}</p>

          <div className="mt-4">
            {state === 'loading' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark/60 text-text-muted text-sm">
                Carregando…
              </div>
            )}

            {state === 'locked_event' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark/60 text-text-muted text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                Disponível após o evento ({endDateLabel})
              </div>
            )}

            {state === 'locked_survey' && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted leading-relaxed">
                  Responda a pesquisa de avaliação do evento para liberar seu certificado.
                </p>
                <button
                  onClick={onGoToEvaluation}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan/40 bg-cyan/10 text-cyan text-sm font-semibold hover:bg-cyan/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Ir para a Avaliação
                </button>
              </div>
            )}

            {state === 'locked_survey_closed' && (
              <p className="text-sm text-text-muted leading-relaxed">
                A pesquisa de avaliação está encerrada. Fale com a organização para liberar seu certificado.
              </p>
            )}

            {state === 'available' && (
              <div className="space-y-4">
                <CertificateSheet profile={profile} />
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gold/40 bg-gold/10 text-gold text-sm font-semibold hover:bg-gold/20 transition-colors print:hidden"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Imprimir / Salvar como PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint the file**

Run: `npx eslint src/participant/CertificateSection.jsx`
Expected: sem erros (0 problems).

- [ ] **Step 3: Confirm jsPDF não é mais referenciado aqui**

Run: `npx vitest run src/participant/certificateGate.test.js` (sanity — segue passando) e verifique manualmente que o arquivo não contém mais `jspdf`/`jsPDF`.

- [ ] **Step 4: Commit**

```bash
git add src/participant/CertificateSection.jsx
git commit -m "feat(certificate): render certificate in HTML with browser print"
```

---

### Task 3: Passar `token` e `onGoToEvaluation` no `ParticipantPanel`

**Files:**
- Modify: `src/participant/ParticipantPanel.jsx` (call site da aba "event" ~linha 159; assinatura de `EventInfoSection` ~linha 178; uso de `CertificateSection` ~linha 293)

- [ ] **Step 1: Passar props no render da aba "event"**

Em `src/participant/ParticipantPanel.jsx`, troque:

```jsx
        {tab === 'event' && isPaid && <EventInfoSection profile={profile} />}
```

por:

```jsx
        {tab === 'event' && isPaid && (
          <EventInfoSection
            profile={profile}
            token={auth.token}
            onGoToEvaluation={() => setTab('evaluation')}
          />
        )}
```

- [ ] **Step 2: Atualizar a assinatura de `EventInfoSection`**

Troque:

```jsx
function EventInfoSection({ profile }) {
```

por:

```jsx
function EventInfoSection({ profile, token, onGoToEvaluation }) {
```

- [ ] **Step 3: Repassar as props ao `CertificateSection`**

Troque (perto do fim de `EventInfoSection`):

```jsx
      {/* Certificado de Participação */}
      <CertificateSection profile={profile} />
```

por:

```jsx
      {/* Certificado de Participação */}
      <CertificateSection profile={profile} token={token} onGoToEvaluation={onGoToEvaluation} />
```

- [ ] **Step 4: Lint**

Run: `npx eslint src/participant/ParticipantPanel.jsx`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/participant/ParticipantPanel.jsx
git commit -m "feat(certificate): wire participant token and evaluation shortcut"
```

---

### Task 4: Bloco `@media print` no `index.css`

**Files:**
- Modify: `src/index.css` (anexar ao final, depois da regra `.orb`)

- [ ] **Step 1: Anexar o bloco de impressão**

Adicione ao final de `src/index.css`:

```css
/* Certificado — impressão: oculta o resto da página e renderiza só o certificado
   em A4 paisagem, tema claro. print-color-adjust:exact é herdado pelos filhos,
   então as barras de cor (background) saem mesmo sem "gráficos de plano de fundo". */
@media print {
  @page { size: A4 landscape; margin: 0; }

  body * { visibility: hidden; }
  #participant-certificate,
  #participant-certificate * { visibility: visible; }

  #participant-certificate {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

- [ ] **Step 2: Verificação manual (preview de impressão)**

Suba o dev server (`npm run dev`), entre no painel de um participante com pagamento confirmado, vá na aba **Evento**. (Para ver o certificado agora, force `state === 'available'` temporariamente OU use os passos da Task 6.) Abra `Ctrl+P`:
- A pré-visualização mostra **só** o certificado, fundo branco, texto escuro, paisagem.
- As barras de cor e o nome em dourado aparecem mesmo com "gráficos de plano de fundo" desligado.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(certificate): print stylesheet for light A4 landscape output"
```

---

### Task 5: Remover a dependência `jspdf`

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)

- [ ] **Step 1: Confirmar que nada mais usa jspdf**

Busque referências no código-fonte por `jspdf`/`jsPDF` em `src/` (grep ou busca do editor).
Expected: **nenhum** resultado — a Task 2 removeu o último uso.

- [ ] **Step 2: Desinstalar**

Run: `npm uninstall jspdf`
Expected: remove `jspdf` de `package.json` e atualiza `package-lock.json`.

- [ ] **Step 3: Build para garantir que nada quebrou**

Run: `npm run build`
Expected: build conclui sem erros e sem warning de import faltando.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): drop jspdf (certificate now rendered as HTML)"
```

---

### Task 6: Verificação completa (testes + lint + build + manual)

**Files:** nenhum (verificação).

- [ ] **Step 1: Suite de testes**

Run: `npm test`
Expected: todos passam, incluindo `certificateGate.test.js` (6 testes).

- [ ] **Step 2: Lint do projeto**

Run: `npm run lint`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: sucesso; `dist/` gerado. Confirme que o bundle não contém mais `jspdf`.

- [ ] **Step 4: Walkthrough manual dos estados**

Com `npm run dev` e um participante pago, valide cada estado de `CertificateSection`. Para forçar os cenários sem depender da data real / RPC, use temporariamente no componente (e reverta depois):
- `const eventEnded = false` → estado **locked_event** ("Disponível após o evento (31/05)").
- `eventEnded = true` + RPC respondendo `submitted:false, open:true` (ou force `evalStatus`) → **locked_survey** + botão "Ir para a Avaliação" que troca para a aba **Avaliação**.
- `submitted:false, open:false` → **locked_survey_closed**.
- `submitted:true` → **available**: certificado dark renderiza; `Ctrl+P` mostra a versão clara A4; o nome sugerido do PDF é `certificado-hackia-sc-<slug>`.

Reverta quaisquer overrides de teste antes de seguir.

- [ ] **Step 5: (Sem commit se nada mudou)**

Se algum ajuste foi necessário, faça um commit específico do fix.

---

### Task 7: Changelog (regra do projeto)

**Files:**
- Create: `docs/changelog/2026-06-02-certificado-html-pesquisa.md`

- [ ] **Step 1: Escrever o registro**

Create `docs/changelog/2026-06-02-certificado-html-pesquisa.md`:

```markdown
# feat: certificado em HTML liberado pela pesquisa

**Data:** 2026-06-02
**Branch:** claude/happy-varahamihira-eab4e8
**Arquivos alterados:** src/participant/CertificateSection.jsx, src/participant/certificateGate.js (+test), src/participant/ParticipantPanel.jsx, src/index.css, package.json/lock

## O que foi feito
Certificado de participação recriado em HTML/CSS (dark na tela, claro na impressão via @media print, salvo como PDF pelo navegador). Liberado só quando o evento terminou E o participante respondeu a pesquisa de avaliação (sinal `submitted` de get_my_event_evaluation). jsPDF removido.

## Por que
"Formatação HTML" pedida (mais fácil de estilizar que a API vetorial do jsPDF) e usar o certificado como incentivo para responder a pesquisa pós-evento.

## Decisões técnicas
- Gate em helper puro (`gateState`) testado por unidade; UI só consome o estado.
- Impressão nativa (window.print) em vez de html2canvas → texto selecionável, sem libs novas, bundle menor.
- Gate client-side (igual ao gate por data anterior); blindagem server-side é follow-up.

## Impacto
- Aba Evento do painel do participante. Dependência `jspdf` removida.
- Sem breaking changes de dados (nenhuma migração).

## Próximos passos
- Opcional: RPC que entrega os dados do certificado só se `submitted` (enforcement server-side).
```

- [ ] **Step 2: Commit**

```bash
git add docs/changelog/2026-06-02-certificado-html-pesquisa.md
git commit -m "docs(changelog): HTML certificate gated by survey response"
```

---

## Notas de execução

- **Sem migração de banco:** este trabalho é 100% frontend; reusa a RPC `get_my_event_evaluation` já em produção.
- **Pré-deploy:** antes de merge para `master`, rode `/pre-deploy-verify` (regra do projeto). Não há mudança de schema/RLS, mas o diff toca o painel do participante.
- **Ordem de dependências:** Task 1 → 2 → 3; Task 4 e 5 dependem da Task 2; Task 6/7 por último.
