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
