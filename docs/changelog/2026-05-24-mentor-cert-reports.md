# feat: mentor por link + certificado + export de relatórios

**Data:** 2026-05-24
**Branch:** feat/mentor-link

## Mentor por link secreto
`mentors.access_token` + `mentor_get_me_by_token`; `mentor_session_owner` aceita o
access_token como fallback (preserva login e-mail+código e `mentor_sessions`).
`#mentor?t=<uuid>` autentica sem login (token sai da URL). Migration aplicada em prod.
10 mentores cadastrados (acesso por link).

## Certificado de participação
`src/participant/CertificateSection.jsx`: card na aba "Evento" (só confirmados),
gera PDF via jsPDF (A4 paisagem, identidade HackIA). Liberado a partir do fim do
evento (`EVENT_CONFIG.eventEndDate`, 31/05); antes disso mostra "disponível após o evento".

## Export de relatórios (admin)
`AdminDashboard`: botões "Exportar financeiro (CSV)" e "Exportar demográfico (CSV)"
reusando `stats`/`demographics`/`feeData` já calculados. BOM UTF-8, seções delimitadas.
- Financeiro: receita confirmada/pendente, ticket médio, breakdown por tier, early bird, dados MP.
- Demográfico: perfil, modalidade, tier, experiência IA, eixos, projetos, restrições, PcD.

## Impacto
Build + ESLint OK (2 problemas pré-existentes em WaitlistSection, não introduzidos).
Tudo aditivo. Fecha os gaps da análise inicial: certificado e exports de relatório.
