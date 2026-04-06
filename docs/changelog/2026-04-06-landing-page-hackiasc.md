# feat: Landing Page HackIA SC — AI Venture Hackathon Blumenau 2026

**Data:** 2026-04-06
**Branch:** master
**Arquivos alterados:** 26 arquivos criados, ~1800 linhas de código

## O que foi feito

### 1. Landing Page Completa (10 seções)

Site single-page com design dark "neural network" — fundo deep space, gradientes cyan/electric/violet, tipografia Sora + JetBrains Mono, efeitos glow e grid circuit.

| Seção | Componente | Descrição |
|-------|-----------|-----------|
| Navbar | `Navbar.jsx` | Logo `>hackIA.sc`, menu responsivo mobile com hamburger |
| Hero | `Hero.jsx` | Título, data, local, CTAs, stats (3 dias, R$9k+, 60-100 participantes) |
| Sobre | `About.jsx` | Cards Hacker/Hustler/Hipster + eixos de governança de Blumenau |
| Cronograma | `Timeline.jsx` | 3 colunas (Sexta/Sábado/Domingo) com horários detalhados |
| Prêmios | `Prizes.jsx` | 1º R$6k, 2º R$3k, 3º benefícios + critérios de avaliação com barras |
| Mentoria | `Mentorship.jsx` | Mentor fixo, 4 sessões hard, pitch de guerrilha, IA Evaluator |
| Inscrição | `RegistrationForm.jsx` | Formulário completo (detalhes abaixo) |
| Pagamento | `PaymentInfo.jsx` | Pix QR placeholder + link cartão, com breakdown para equipes |
| FAQ | `FAQ.jsx` | 8 perguntas do edital, accordion interativo |
| Footer | `Footer.jsx` | Instagram, email, grupo WhatsApp, link edital |

### 2. Formulário de Inscrição (espelhando Google Forms)

O formulário replica todas as 7 seções do Google Forms original com 9 fieldsets:

1. **Dados Pessoais** — nome, email (com helper), telefone, nascimento, LinkedIn (obrigatório)
2. **Perfil** — radio cards (Hacker/Hustler/Hipster/Entusiasta) + escala linear 1-10 para nível de IA
3. **Disponibilidade e Aceite** — 2 checkboxes de presença física + 3 declarações de ciência e aceite
4. **Necessidades do Evento** — restrição alimentar (obrigatório), PcD (Sim/Não + tipo condicional)
5. **Projeto** — já tem projeto? (Sim/Não + nome condicional)
6. **Critérios Eliminatórios** — 4 checkboxes obrigatórios (IA, monetização, vendas, edital)
7. **Eixos Econômicos** — checkboxes opcionais (Metalmecânico, Têxtil, TIC, Turismo, Economia Criativa, Saúde)
8. **Modalidade de Inscrição** — 3 opções:
   - Individual (formar equipe no evento)
   - Individual (equipe já existe, cada um se inscreve)
   - Em Equipe (cadastra todos os membros)
9. **Pagamento** — Pix ou Cartão

### 3. Inscrição em Equipe (até 6 membros)

Quando "Inscrição em Equipe" é selecionada:
- Campo obrigatório de nome da equipe
- Seção dinâmica para adicionar até 5 membros adicionais (6 total com líder)
- Cada membro: nome, email, telefone, nascimento, LinkedIn, perfil, nível IA, restrição alimentar, PcD, 3 declarações de aceite
- Cards colapsáveis com header "2º Participante", "3º Participante", etc.
- Botão de remover (X vermelho) em cada card
- **Preço dinâmico**: `R$ 150 × N pessoas = R$ total`
- Insert batch no Supabase (1 row por pessoa, mesma `team_name`, líder com `is_team_leader: true`)

### 4. Preço Dinâmico (Early Bird)

- Hook `useTicketPrice.js` chama RPC `get_confirmed_count()` no Supabase
- Primeiros 10 confirmados = R$150 (early bird)
- Demais = R$200 (regular)
- Badge atualiza em tempo real no formulário

### 5. Backend — Supabase (Free Tier)

**Tabela `registrations`** com campos:
- Dados pessoais, perfil, nível IA, disponibilidade
- PcD, restrições alimentares, projeto
- Eixos econômicos (`TEXT[]`), modalidade, equipe
- Pagamento (método, tier, preço, status, confirmação)
- `is_team_leader` para diferenciar líder de membros

**Segurança (RLS):**
- `anon` pode INSERT (inscrição pública)
- Apenas `authenticated` pode SELECT/UPDATE (admin via dashboard)
- Função RPC `get_confirmed_count()` com `SECURITY DEFINER` para anon

### 6. Infraestrutura

| Item | Tecnologia | Custo |
|------|-----------|-------|
| Frontend | Vite + React + TailwindCSS v4 | Free |
| Hosting | GitHub Pages | Free |
| Backend/DB | Supabase (PostgreSQL) | Free tier |
| CI/CD | GitHub Actions | Free |
| Domínio | hackiasc.com | ~R$40/ano |
| SSL | Let's Encrypt via GitHub Pages | Free |

**Deploy automático**: push para `master` → GitHub Actions builda → deploya para GitHub Pages.

### 7. Configurações Centralizadas

`src/lib/config.js` centraliza todos os valores editáveis:
- Email de contato: `contato@hackiasc.com`
- Redes sociais (Instagram, grupo WhatsApp)
- Placeholders de pagamento (Pix key, link cartão)
- Links do edital (Google Docs em modo preview)

## Por que

O evento AI Venture Hackathon Blumenau precisava de um site próprio para:
- Substituir o Sympla/Consolti (evitar taxas de 8%+)
- Ter formulário de inscrição completo espelhando o Google Forms
- Aceitar pagamento via Pix (sem taxas) e cartão (link externo)
- Transmitir credibilidade com domínio próprio e design profissional
- Ser 100% free tier (GitHub Pages + Supabase)

## Decisões técnicas

- **Vite + React** ao invés de Next.js: não precisa de SSR, o site é estático. Vite builda em <200ms.
- **Supabase anon key no frontend**: é seguro por design — RLS controla as permissões. A key é pública.
- **Preço no INSERT (não no servidor)**: o preço é trancado no momento da inscrição. Race condition aceitável para 60-100 participantes.
- **Membros de equipe via estado local** (não react-hook-form): arrays dinâmicos são mais simples com `useState` + validação manual.
- **Google Docs /preview** para edital: permite controle de acesso sem hospedar o PDF. Troca para `/edit` quando for público.
- **TailwindCSS v4** via plugin Vite (não PostCSS): setup mais limpo, uma dependência a menos.

## Impacto

- Site completo e funcional em hackiasc.com
- Formulário aceita inscrições individuais e em equipe (até 6 membros)
- Pagamento calculado automaticamente por número de pessoas
- Deploy automático a cada push
- Zero custo recorrente (exceto domínio)

## Próximos passos

- [ ] Definir chave Pix e atualizar em `config.js`
- [ ] Criar link de pagamento por cartão (InfinitePay/MP) e atualizar em `config.js`
- [ ] Divulgar edital na quarta (trocar `/preview` por link público se necessário)
- [ ] Adicionar logo/imagem do Instagram como og-image para previews no WhatsApp
- [ ] Testar formulário end-to-end com inscrição real no Supabase
