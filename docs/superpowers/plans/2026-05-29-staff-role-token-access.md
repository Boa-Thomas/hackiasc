# Acesso `staff` (Muro + Check-in) via link de auto-login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma pessoa entre, por um link de 1 clique, num painel admin limitado a Muro de Dores + Check-in.

**Architecture:** Novo role `staff` (JWT `app_metadata.role`) com helpers/policies aditivos; os RPCs do muro passam a aceitar `staff`; a entrega é um link `#admin-acesso?t=<senha>` que faz `signInWithPassword` numa conta dedicada e some com o token da URL. Reusa toda a auth/RLS atuais.

**Tech Stack:** Supabase (Postgres RPC SECURITY DEFINER, Supabase Auth), React 19 + Vite, Tailwind v4.

---

## Tooling note (IMPORTANTE)

Hook global de auto-format roda Prettier (aspas duplas + `;`) a cada `Edit`/`Write` em JS/JSX — este repo usa **aspas simples, sem `;`**. Para `.jsx`/`.js`, aplique mudanças via **Node script no Bash** (`fs.writeFileSync` / replace exato), e confira com `git diff` que só as linhas pretendidas mudaram. Markdown e SQL não são afetados.

## File Structure

- **Create** `migrations/add_staff_role.sql` — `is_wall_staff()`, re-CREATE de `is_checkin_staff()` (inclui staff), policy de SELECT em registrations (inclui staff), re-CREATE dos 5 RPCs do muro trocando o gate.
- **Modify** `src/lib/config.js` — `STAFF_ACCESS_EMAIL`.
- **Modify** `src/admin/useAdminAuth.js` — `'staff'` em VALID_ROLES + tratar `SIGNED_IN`.
- **Create** `src/admin/StaffAccess.jsx` — auto-login a partir do `?t=`.
- **Modify** `src/App.jsx` — rota `#admin-acesso`.
- **Modify** `src/admin/AdminPanel.jsx` — abas do role `staff`.
- **Create** `docs/changelog/2026-05-29-staff-role-token-access.md`.

Ordem: Task 1 (migration) + Task 2 (conta) são pré-requisito pro link funcionar, mas o frontend (Tasks 3-5) pode ser feito antes; deploy e verificação no fim.

---

## Task 1: Migration do role `staff`

**Files:**

- Create: `migrations/add_staff_role.sql`

- [ ] **Step 1: Criar o arquivo com o SQL completo abaixo**

```sql
-- ============================================================
-- add_staff_role.sql — role "staff" = Muro de Dores + Check-in.
-- Aditivo e idempotente (CREATE OR REPLACE). Aplicar via MCP.
-- ============================================================

-- Helper: operador do muro = admin OU staff.
CREATE OR REPLACE FUNCTION is_wall_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'),
    false
  );
$$;
REVOKE EXECUTE ON FUNCTION is_wall_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_wall_staff() TO authenticated;

-- Check-in passa a aceitar staff (alem de admin/checkin).
CREATE OR REPLACE FUNCTION is_checkin_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'checkin', 'staff'),
    false
  );
$$;

-- SELECT de confirmados: inclui staff (necessario p/ check-in e p/ busca do
-- "adicionar dor por participante", que filtram confirmados). Permissiva,
-- OR-combinada com as policies admin/viewer existentes.
DROP POLICY IF EXISTS "Checkin can read confirmed registrations" ON registrations;
CREATE POLICY "Checkin can read confirmed registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') IN ('checkin','staff'), false)
    AND payment_status = 'confirmed'
  );

-- RPCs do muro: trocar o gate is_admin()/is_admin_or_viewer() para aceitar staff.
-- Corpos identicos aos atuais (add_wall_identity.sql / add_wall_voters.sql);
-- muda APENAS a checagem de autorizacao.

CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;

  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;

  RETURN json_build_object('ok', true, 'phase', p_phase);
END;
$$;
REVOKE ALL ON FUNCTION wall_set_phase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_set_phase(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION wall_hide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE pains SET status = 'hidden' WHERE id = p_id AND status = 'visible';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION wall_hide_pain(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_hide_pain(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION wall_unhide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE pains SET status = 'visible' WHERE id = p_id AND status = 'hidden';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION wall_unhide_pain(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_unhide_pain(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION wall_admin_list()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase TEXT;
  v_pains JSON;
BEGIN
  IF NOT (is_admin_or_viewer() OR is_wall_staff()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id, pn.title, pn.description, pn.author_name, pn.axis,
      pn.status, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'full_name', r.full_name,
              'email', r.email,
              'phone', r.phone
            ) ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) AS voters
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    GROUP BY pn.id
  ) p;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON)
  );
END;
$$;
REVOKE ALL ON FUNCTION wall_admin_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_list() TO authenticated;

-- wall_admin_add_pain: gate is_admin() -> is_wall_staff(). Resto identico.
CREATE OR REPLACE FUNCTION wall_admin_add_pain(
  p_registration_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  v_name := wall_require_confirmed(p_registration_id);

  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    v_name,
    p_registration_id,
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

  RETURN json_build_object(
    'id', v_pain.id,
    'title', v_pain.title,
    'author_name', v_pain.author_name
  );
END;
$$;
REVOKE ALL ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) TO authenticated;
```

- [ ] **Step 2: Aplicar via MCP** — `mcp__plugin_supabase_supabase__apply_migration`, name `add_staff_role`, com o SQL acima. Expected: `{"success":true}`.

- [ ] **Step 3: Smoke test (MCP execute_sql)**

```sql
SELECT proname FROM pg_proc WHERE proname = 'is_wall_staff';
SELECT pg_get_functiondef('wall_set_phase(text)'::regprocedure) LIKE '%is_wall_staff%' AS gated_ok;
```

Expected: 1 linha para `is_wall_staff`; `gated_ok = true`.

- [ ] **Step 4: Commit**

```bash
git add migrations/add_staff_role.sql
git commit -m "feat(admin): role staff (muro+checkin) — helpers, policy e RPCs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Provisionar a conta `staff` (ops — controller)

**Não é código.** O orquestrador cria a conta Supabase e guarda a senha (= token do link). Não vai pro repo.

- [ ] **Step 1: Criar o usuário** (preferência: Supabase Dashboard → Auth → Add User, email `equipe-muro@hackiasc.com`, senha forte aleatória, "Auto Confirm"). Alternativa via MCP `execute_sql` inserindo em `auth.users` com `encrypted_password = crypt('<senha>', gen_salt('bf'))`, `email_confirmed_at = now()`, `aud='authenticated'`, `role='authenticated'`.

- [ ] **Step 2: Setar o role** (MCP execute_sql):

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data,'{}'::jsonb) || '{"role":"staff"}'::jsonb
WHERE email = 'equipe-muro@hackiasc.com';
SELECT email, raw_app_meta_data->>'role' AS role FROM auth.users WHERE email='equipe-muro@hackiasc.com';
```

Expected: `role = staff`.

- [ ] **Step 3:** Guardar a senha para montar o link `#admin-acesso?t=<senha>` no fim. (Revogação futura = trocar essa senha.)

---

## Task 3: `STAFF_ACCESS_EMAIL` + auth plumbing

**Files:**

- Modify: `src/lib/config.js`
- Modify: `src/admin/useAdminAuth.js`

- [ ] **Step 1: Adicionar a constante em `config.js` (via Bash/Node — append)**

Acrescentar ao final de `src/lib/config.js`:

```js
// Conta dedicada usada pelo link de auto-login da equipe (#admin-acesso?t=<senha>).
// O email não é segredo; o token do link é a senha desta conta (role 'staff').
export const STAFF_ACCESS_EMAIL = "equipe-muro@hackiasc.com";
```

- [ ] **Step 2: `useAdminAuth.js` — incluir `'staff'` em VALID_ROLES (via Bash/Node)**

Trocar:

```js
const VALID_ROLES = ["admin", "viewer", "checkin"];
```

por:

```js
const VALID_ROLES = ["admin", "viewer", "checkin", "staff"];
```

- [ ] **Step 3: `useAdminAuth.js` — tratar `SIGNED_IN` no onAuthStateChange (via Bash/Node)**

Trocar este bloco:

```js
const { data } = supabase.auth.onAuthStateChange((event) => {
  // Session revoked/expired elsewhere (logout, token revocation, expiry).
  // Only do UI cleanup here — calling signOut() would re-fire SIGNED_OUT
  // and loop forever.
  if (event === "SIGNED_OUT") {
    clearAuthState();
  }
});
```

por:

```js
const { data } = supabase.auth.onAuthStateChange((event, session) => {
  // Session revoked/expired elsewhere (logout, token revocation, expiry).
  // Only do UI cleanup here — calling signOut() would re-fire SIGNED_OUT
  // and loop forever.
  if (event === "SIGNED_OUT") {
    clearAuthState();
  } else if (event === "SIGNED_IN" && session) {
    // Auto-login (link da equipe) ou login em outra aba: assume a sessao.
    const userRole = session.user.app_metadata?.role ?? null;
    if (VALID_ROLES.includes(userRole)) {
      setRole(userRole);
      setIsAuthenticated(true);
      startActivityTracking();
    }
  }
});
```

- [ ] **Step 4: Build + lint**

`npm run build` → `✓ built`; `npx eslint src/lib/config.js src/admin/useAdminAuth.js` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.js src/admin/useAdminAuth.js
git commit -m "feat(admin): role staff em VALID_ROLES + tratar SIGNED_IN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rota de auto-login `#admin-acesso`

**Files:**

- Create: `src/admin/StaffAccess.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Criar `src/admin/StaffAccess.jsx` (via Bash/Node — escrever o arquivo)**

```jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { STAFF_ACCESS_EMAIL } from "../lib/config";

// Auto-login da equipe (Muro + Check-in) via link #admin-acesso?t=<senha>.
// O token e a senha da conta staff; o email e fixo. Apos o signIn, remove o
// token da URL e redireciona para o painel (#admin).
export default function StaffAccess() {
  const [error, setError] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!supabase) {
        setError("Sistema indisponível no momento.");
        return;
      }
      let token = null;
      try {
        const hash = window.location.hash || "";
        const qIdx = hash.indexOf("?");
        if (qIdx !== -1)
          token = new URLSearchParams(hash.slice(qIdx + 1)).get("t");
      } catch {
        /* hash malformado */
      }
      if (!token) {
        setError("Link inválido.");
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: STAFF_ACCESS_EMAIL,
        password: token,
      });
      if (err) {
        setError("Link inválido ou expirado. Peça um novo à organização.");
        return;
      }
      // Remove o token da URL e vai pro painel; useAdminAuth assume via SIGNED_IN.
      try {
        window.history.replaceState(null, "", "#admin");
      } catch {
        /* ignore */
      }
      window.location.hash = "#admin";
    })();
  }, []);

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 bg-grid">
      <div className="orb w-[400px] h-[400px] bg-violet/10 -top-20 -right-20 animate-pulse-glow pointer-events-none" />
      <div className="relative card-glass p-8 w-full max-w-md text-center">
        {!error ? (
          <p className="text-white/70 font-mono">Entrando...</p>
        ) : (
          <div className="space-y-4">
            <p className="text-hot text-sm">{error}</p>
            <a
              href="#admin-login"
              className="inline-block text-cyan text-sm underline"
            >
              Ir para o login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `App.jsx` — importar e rotear (via Bash/Node)**

Adicionar o import junto aos outros de admin (após a linha `import AdminPanel from './admin/AdminPanel'`):

```js
import StaffAccess from "./admin/StaffAccess";
```

Adicionar a rota ANTES do bloco `// Admin routes` (`if (page === '#admin' || page === '#admin-login')`):

```js
// Auto-login da equipe (Muro + Check-in) — #admin-acesso?t=<token>
if (page.startsWith("#admin-acesso")) {
  return <StaffAccess />;
}
```

- [ ] **Step 3: Build + lint**

`npm run build` → `✓ built`; `npx eslint src/admin/StaffAccess.jsx src/App.jsx` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/admin/StaffAccess.jsx src/App.jsx
git commit -m "feat(admin): rota de auto-login #admin-acesso (link da equipe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Abas do role `staff` no AdminPanel

**Files:**

- Modify: `src/admin/AdminPanel.jsx`

- [ ] **Step 1: Ajustar a lógica de role (via Bash/Node)**

Trocar:

```js
export default function AdminPanel({ onLogout, role = 'viewer' }) {
  const readOnly = role === 'viewer'
  const checkinOnly = role === 'checkin'
  const TABS = checkinOnly
    ? ALL_TABS.filter(t => t.id === 'checkin')
    : readOnly
      ? ALL_TABS.filter(t => !t.adminOnly)
      : ALL_TABS
  const [activeTab, setActiveTab] = useState(checkinOnly ? 'checkin' : 'dashboard')
```

por:

```js
export default function AdminPanel({ onLogout, role = 'viewer' }) {
  const readOnly = role === 'viewer'
  const checkinOnly = role === 'checkin'
  const staffOnly = role === 'staff'
  const TABS = staffOnly
    ? ALL_TABS.filter(t => t.id === 'wall' || t.id === 'checkin')
    : checkinOnly
      ? ALL_TABS.filter(t => t.id === 'checkin')
      : readOnly
        ? ALL_TABS.filter(t => !t.adminOnly)
        : ALL_TABS
  const [activeTab, setActiveTab] = useState(staffOnly ? 'wall' : checkinOnly ? 'checkin' : 'dashboard')
```

- [ ] **Step 2: Badge do role staff (via Bash/Node)**

Trocar:

```js
{
  checkinOnly && (
    <span className="ml-2 text-xs font-mono text-cyan/60 border border-cyan/20 px-2 py-0.5 rounded-full">
      check-in
    </span>
  );
}
```

por:

```js
{
  checkinOnly && (
    <span className="ml-2 text-xs font-mono text-cyan/60 border border-cyan/20 px-2 py-0.5 rounded-full">
      check-in
    </span>
  );
}
{
  staffOnly && (
    <span className="ml-2 text-xs font-mono text-violet/60 border border-violet/20 px-2 py-0.5 rounded-full">
      equipe
    </span>
  );
}
```

Nota: os conteúdos de `wall`/`checkin` já renderizam sob `!readOnly` (staff não é viewer), então aparecem; as demais abas não têm botão para staff, e RLS/RPCs barram acesso fora do escopo de qualquer forma.

- [ ] **Step 3: Build + lint**

`npm run build` → `✓ built`; `npx eslint src/admin/AdminPanel.jsx` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminPanel.jsx
git commit -m "feat(admin): role staff vê só Muro de Dores + Check-in

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Changelog + deploy + verificação

**Files:**

- Create: `docs/changelog/2026-05-29-staff-role-token-access.md`

- [ ] **Step 1: Criar o changelog**

```markdown
# feat: Acesso staff (Muro + Check-in) via link de auto-login

**Data:** 2026-05-29

## O que foi feito

- Novo role `staff` (JWT app_metadata): opera Muro de Dores + Check-in, nada mais.
- Link `#admin-acesso?t=<token>`: faz signInWithPassword numa conta dedicada e
  remove o token da URL; useAdminAuth assume a sessão via SIGNED_IN.
- AdminPanel: role `staff` vê só as abas Muro + Check-in (default Muro).

## Backend (`migrations/add_staff_role.sql`)

- `is_wall_staff()` (admin|staff); `is_checkin_staff()` passa a incluir staff.
- Policy de SELECT de confirmados em registrations inclui staff.
- RPCs do muro (`wall_set_phase`/`hide`/`unhide`/`admin_list`/`admin_add_pain`)
  passam a aceitar staff.

## Segurança

- O link é a credencial; revogação = trocar a senha da conta staff. Role limitado
  - timeout de inatividade de 30 min. Staff vê PII só de confirmados/votantes.
```

- [ ] **Step 2: Commit + build final + push (deploy)**

```bash
git add docs/changelog/2026-05-29-staff-role-token-access.md
git commit -m "docs(admin): changelog acesso staff via link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
npm run build   # ✓ built
git push origin master
```

- [ ] **Step 3: Acompanhar deploy** — `gh run list --workflow=deploy.yml --limit 1` → `success`.

- [ ] **Step 4: Verificação real**

- Montar o link `https://hackiasc.com/#admin-acesso?t=<senha-da-conta-staff>` e abrir numa aba anônima.
- Esperado: "Entrando..." → painel com **só** as abas Muro de Dores + Check-in, badge "equipe".
- Testar: mudar a fase do muro (deve funcionar); abrir o Check-in. Confirmar que abas de admin (Inscrições, Financeiro, etc.) NÃO aparecem.
- Conferir que a URL não tem mais o `?t=` depois de entrar.

---

## Self-Review (preenchido)

- **Cobertura do spec:** role staff (Task 1: is_wall_staff + is_checkin_staff + policy + RPCs), conta dedicada (Task 2), STAFF_ACCESS_EMAIL (Task 3), SIGNED_IN + VALID_ROLES (Task 3), StaffAccess + rota (Task 4), abas staff (Task 5), changelog/deploy/verify (Task 6). ✔
- **Placeholders:** nenhum; SQL e JSX completos. A senha da conta é gerada em runtime (ops), não é placeholder de código. ✔
- **Consistência:** `is_wall_staff()` usado igual em todos os RPCs; `'staff'` em VALID_ROLES casa com `staffOnly`/policy/RPCs; `STAFF_ACCESS_EMAIL` definido (Task 3) e usado (Task 4). ✔
- **Risco:** abrir o link já logado como admin rebaixa a sessão para staff (documentado no spec como aceitável).
