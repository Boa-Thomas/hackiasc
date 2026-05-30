# Admin Team Description + Invite Placeholder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin edit each team's solution description, and show an inviting placeholder where the description is empty so participants understand it's a space to fill.

**Architecture:** Pure front-end. The `teams.idea_description` column already exists and the admin (`authenticated` role) already has `UPDATE` on `teams` (the rename flow proves it). Admin writes go straight through `supabase.from('teams').update(...)`, mirroring the existing rename handler. Client-side sanitization is extracted into a tiny pure helper so it can be unit-tested.

**Tech Stack:** React 19, Vite, Tailwind v4, Supabase JS, Vitest (node env).

---

## ⚠️ Repo conventions (read before editing)

- **Style:** single quotes, **no semicolons**, 2-space indent. Match the surrounding code exactly.
- **Formatter hook gotcha:** a PostToolUse auto-format hook fights this repo's style on `Write`/`Edit`. Apply all `.js`/`.jsx` edits **via the Bash tool** (heredoc / `python` / `sed`), NOT via Edit/Write, to avoid the hook reformatting the file. Markdown is fine via Write.
- **No React component test harness exists** (no `@testing-library/react`, no jsdom; vitest `environment: 'node'`). Do NOT add one. JSX changes are verified with `npm run lint` and `npm run build`. Only the pure helper in Task 1 gets a unit test.
- Run all commands from the worktree root: `C:\Users\conta\Desktop\hackiasc\.claude\worktrees\feature+admin-team-description`.

---

## File Structure

- **Create** `src/admin/teamIdea.js` — pure helper `cleanIdeaDescription(raw)` + `IDEA_MAX_LENGTH`. One responsibility: sanitize/validate an idea string the same way the `participant_update_team` RPC does (trim, empty → null, ≤500).
- **Create** `src/admin/teamIdea.test.js` — vitest unit tests for the helper.
- **Modify** `src/admin/AdminTeams.jsx` — new `EditIdeaModal`, new "Editar descrição" button, `editIdeaTarget` state, `updateTeamIdea` handler, empty-state in the "Ideia" box.
- **Modify** `src/participant/TeamSection.jsx` — empty-state invite in `CurrentTeamView`, updated textarea placeholder copy.

---

## Task 1: Sanitization helper (TDD)

**Files:**

- Create: `src/admin/teamIdea.js`
- Test: `src/admin/teamIdea.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/admin/teamIdea.test.js` (via Bash heredoc):

```js
import { describe, it, expect } from "vitest";
import { cleanIdeaDescription, IDEA_MAX_LENGTH } from "./teamIdea";

describe("cleanIdeaDescription", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanIdeaDescription("  hello  ")).toEqual({
      value: "hello",
      error: null,
    });
  });

  it("maps empty / whitespace-only / nullish to null", () => {
    expect(cleanIdeaDescription("   ")).toEqual({ value: null, error: null });
    expect(cleanIdeaDescription("")).toEqual({ value: null, error: null });
    expect(cleanIdeaDescription(null)).toEqual({ value: null, error: null });
    expect(cleanIdeaDescription(undefined)).toEqual({
      value: null,
      error: null,
    });
  });

  it("accepts exactly the max length (after trim)", () => {
    const s = "a".repeat(IDEA_MAX_LENGTH);
    expect(cleanIdeaDescription(s)).toEqual({ value: s, error: null });
  });

  it("rejects over the max length", () => {
    const s = "a".repeat(IDEA_MAX_LENGTH + 1);
    expect(cleanIdeaDescription(s)).toEqual({
      value: null,
      error: "idea_too_long",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/admin/teamIdea.test.js`
Expected: FAIL — cannot resolve `./teamIdea` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/admin/teamIdea.js` (via Bash heredoc):

```js
// Sanitiza a descrição da ideia de um time no client, espelhando a validação da
// RPC participant_update_team: trim, vazio → null, máximo 500 caracteres.

export const IDEA_MAX_LENGTH = 500;

export function cleanIdeaDescription(raw) {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > IDEA_MAX_LENGTH) {
    return { value: null, error: "idea_too_long" };
  }
  return { value: trimmed === "" ? null : trimmed, error: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/admin/teamIdea.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/admin/teamIdea.js src/admin/teamIdea.test.js
git commit -m "feat(admin): cleanIdeaDescription helper + tests"
```

---

## Task 2: Admin — edit team description

**Files:**

- Modify: `src/admin/AdminTeams.jsx`

All edits via Bash (formatter hook). Keep single quotes / no semicolons.

- [ ] **Step 1: Import the helper**

At the top of `src/admin/AdminTeams.jsx`, after the existing import block (the imports of `useState`/`supabase`/`audit`/`TransferTicketModal`, around line 1–4), add:

```js
import { cleanIdeaDescription, IDEA_MAX_LENGTH } from "./teamIdea";
```

- [ ] **Step 2: Add the `EditIdeaModal` component**

Insert immediately AFTER the `RenameTeamModal` function (after its closing `}` near line 241), before the `DeleteTeamConfirm` section comment:

```jsx
// ─── EditIdeaModal ────────────────────────────────────────────────────────────

function EditIdeaModal({ teamName, currentIdea, onConfirm, onCancel }) {
  const [idea, setIdea] = useState(currentIdea || "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const { value, error: cleanErr } = cleanIdeaDescription(idea);
    if (cleanErr === "idea_too_long")
      return setError("Descrição muito longa (máx 500).");
    setBusy(true);
    onConfirm(value);
  }

  return (
    <ModalShell
      title={
        <>
          Editar descrição de <span className="text-electric">{teamName}</span>
        </>
      }
      onClose={onCancel}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value);
            setError(null);
          }}
          maxLength={IDEA_MAX_LENGTH}
          rows={4}
          autoFocus
          placeholder="Coloque aqui a descrição da sua solução"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors resize-none"
        />
        <p className="text-xs text-white/40">
          {idea.length}/{IDEA_MAX_LENGTH}
        </p>
        {error && <p className="text-hot text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
```

- [ ] **Step 3: Show an empty-state in the card's "Ideia" box**

In `TeamCard`, replace the current conditional idea block (lines ~789–794):

```jsx
{
  idea && (
    <div className="rounded-xl border border-electric/20 bg-electric/5 px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-electric/70 mb-1">
        Ideia
      </p>
      <p className="text-sm text-white/80 whitespace-pre-wrap">{idea}</p>
    </div>
  );
}
```

with (always render the box; muted hint when empty):

```jsx
<div className="rounded-xl border border-electric/20 bg-electric/5 px-4 py-3">
  <p className="text-[10px] font-mono uppercase tracking-wider text-electric/70 mb-1">
    Ideia
  </p>
  {idea ? (
    <p className="text-sm text-white/80 whitespace-pre-wrap">{idea}</p>
  ) : (
    <p className="text-sm text-white/30 italic">
      Sem descrição — clique em "Editar descrição".
    </p>
  )}
</div>
```

- [ ] **Step 4: Add the "Editar descrição" button**

In `TeamCard`, inside the `{!readOnly && (...)}` action row, immediately AFTER the "Editar nome" button (the one calling `actions.openRename`, lines ~805–810), add:

```jsx
<button
  onClick={() => actions.openEditIdea({ teamName: name, idea })}
  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric/10 text-electric/80 hover:bg-electric/20 hover:text-electric border border-electric/20 transition-colors"
>
  Editar descrição
</button>
```

(`idea` is already a prop of `TeamCard`.)

- [ ] **Step 5: Add `editIdeaTarget` state**

In the `AdminTeams` component, next to the other modal states (after `const [addMemberTarget, setAddMemberTarget] = useState(null)`, line ~1034), add:

```jsx
const [editIdeaTarget, setEditIdeaTarget] = useState(null);
```

- [ ] **Step 6: Add the `updateTeamIdea` handler**

Insert after the `renameTeam` function (after its closing `}`, near line 1251), before `deleteTeam`:

```jsx
async function updateTeamIdea(teamName, idea) {
  if (!supabase) return;
  const teamId = teamsMap[teamName]?.[0]?.team_id;
  if (!teamId) {
    alert(
      "Erro ao salvar: time sem identificador (team_id). Aplique a migração de teams.",
    );
    return;
  }
  const oldIdea =
    (teamsMeta.find((t) => t.name === teamName) || {}).idea_description ?? null;
  const { error: err } = await supabase
    .from("teams")
    .update({ idea_description: idea })
    .eq("id", teamId);
  if (err) {
    alert(`Erro ao salvar descrição: ${err.message}`);
    return;
  }
  audit({
    action: "team.update_idea",
    actorType: "admin",
    targetTable: "teams",
    targetId: teamId,
    oldData: { idea_description: oldIdea },
    newData: { idea_description: idea },
  });
  setEditIdeaTarget(null);
  await fetchData();
}
```

(`idea` arriving here is already the cleaned value — `null` or trimmed string — produced by the modal.)

- [ ] **Step 7: Wire the action into the `actions` object**

In the `actions` object (near line 1397), after the `openRename` line, add:

```jsx
    openEditIdea: ({ teamName, idea }) => setEditIdeaTarget({ teamName, idea }),
```

- [ ] **Step 8: Render the modal**

After the `renameTarget` modal block (near line 1539), add:

```jsx
{
  editIdeaTarget && (
    <EditIdeaModal
      teamName={editIdeaTarget.teamName}
      currentIdea={editIdeaTarget.idea}
      onConfirm={(idea) => updateTeamIdea(editIdeaTarget.teamName, idea)}
      onCancel={() => setEditIdeaTarget(null)}
    />
  );
}
```

- [ ] **Step 9: Lint + build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (`dist/` produced).

- [ ] **Step 10: Commit**

```bash
git add src/admin/AdminTeams.jsx
git commit -m "feat(admin): edit team idea description + empty-state hint"
```

---

## Task 3: Participant — invite placeholder + textarea copy

**Files:**

- Modify: `src/participant/TeamSection.jsx`

All edits via Bash. Single quotes / no semicolons.

- [ ] **Step 1: Replace the empty description with an invite**

In `CurrentTeamView`, replace the current conditional (lines ~151–153):

```jsx
{
  team?.idea_description && (
    <p className="text-sm text-white/70 mt-2 max-w-xl whitespace-pre-wrap">
      {team.idea_description}
    </p>
  );
}
```

with:

```jsx
{
  team?.idea_description ? (
    <p className="text-sm text-white/70 mt-2 max-w-xl whitespace-pre-wrap">
      {team.idea_description}
    </p>
  ) : (
    <div className="mt-3 max-w-xl rounded-xl border border-dashed border-electric/30 bg-electric/5 px-4 py-3">
      <p className="text-sm text-white/50">
        📝 Coloque aqui a descrição da sua solução — clique em{" "}
        <span className="text-electric font-semibold">Editar equipe</span> para
        preencher.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Update the textarea placeholder copy**

In the edit form, change the textarea placeholder (line ~205) from:

```jsx
placeholder = "Em uma ou duas frases, qual é a ideia da equipe?";
```

to:

```jsx
placeholder = "Coloque aqui a descrição da sua solução";
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/participant/TeamSection.jsx
git commit -m "feat(participant): invite placeholder for empty team description"
```

---

## Final verification

- [ ] `npm test` — all suites pass (including the new `teamIdea.test.js`).
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — succeeds.
- [ ] Manual smoke (optional, if Supabase env is configured): in the admin Teams tab,
      expand a team → "Editar descrição" → save text → it appears in the "Ideia" box;
      clear it → the muted "Sem descrição" hint returns. In the participant panel, a team
      with no description shows the 📝 invite, which disappears after saving a description.

## Spec coverage check

- Admin edits description → Task 2 (modal, button, handler). ✓
- No DB migration / no RPC → confirmed; admin uses direct `teams.update`. ✓
- Placeholder is UI-only, never persisted → Task 1 maps empty → null; Tasks 2 & 3 render hints, never write the hint text. ✓
- Placeholder absent from public vitrine → `TeamsShowcase` untouched. ✓
- Participant sees invite when empty + updated copy → Task 3. ✓
- Admin empty-state hint → Task 2 Step 3. ✓
