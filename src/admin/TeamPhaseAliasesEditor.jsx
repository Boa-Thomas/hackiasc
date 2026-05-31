import { useState, useEffect } from "react";

function toRows(aliases) {
  return (aliases || []).map((a, i) => ({
    id: `r${i}`,
    external: a.external || "",
    hackia: a.hackia || "",
  }));
}

// Editor de pares de apelido (nome externo -> nome HackIA), com datalist de sugestoes.
// Estado de rascunho local; Salvar entrega os pares limpos via onSave.
export default function TeamPhaseAliasesEditor({
  aliases,
  externalNames,
  hackiaNames,
  onSave,
  seedExternal,
  onSeedConsumed,
}) {
  // Rascunho local inicializado uma unica vez a partir de `aliases`: o admin
  // continua editando mesmo se o poll de 20s atualizar o prop por baixo.
  const [rows, setRows] = useState(() => toRows(aliases));
  const [seq, setSeq] = useState(() => (aliases ? aliases.length : 0));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Pre-preenche uma linha quando o pai pede vincular uma orfa (clique no chip).
  // Via efeito (sem remontar) para nao descartar edicoes em andamento; dedup
  // pelo nome externo. O pai zera o seed em seguida via onSeedConsumed.
  useEffect(() => {
    if (!seedExternal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows((rs) =>
      rs.some((r) => r.external === seedExternal)
        ? rs
        : [...rs, { id: `seed-${seedExternal}`, external: seedExternal, hackia: "" }],
    );
    if (onSeedConsumed) onSeedConsumed();
  }, [seedExternal, onSeedConsumed]);

  function update(id, field, value) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
    setMsg(null);
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setMsg(null);
  }
  function addRow() {
    setRows((rs) => [...rs, { id: `n${seq}`, external: "", hackia: "" }]);
    setSeq((s) => s + 1);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const pairs = rows
      .map((r) => ({ external: r.external.trim(), hackia: r.hackia.trim() }))
      .filter((p) => p.external && p.hackia);
    const res = await onSave(pairs);
    setBusy(false);
    setMsg(
      res && res.error
        ? { type: "err", text: `Erro ao salvar: ${res.error}` }
        : { type: "ok", text: "Apelidos salvos." },
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <datalist id="tpa-ext-names">
        {(externalNames || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="tpa-hk-names">
        {(hackiaNames || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <p className="text-[10px] font-mono text-white/40">
        Vincule o nome da equipe no painel externo ao nome dela aqui. Use as
        sugestoes.
      </p>

      {rows.length === 0 && (
        <p className="text-xs text-white/30 font-mono">Nenhum apelido.</p>
      )}

      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <input
            list="tpa-ext-names"
            value={r.external}
            onChange={(e) => update(r.id, "external", e.target.value)}
            placeholder="nome externo"
            className="flex-1 min-w-0 bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan/40"
          />
          <span className="text-white/30 text-xs">→</span>
          <input
            list="tpa-hk-names"
            value={r.hackia}
            onChange={(e) => update(r.id, "hackia", e.target.value)}
            placeholder="nome aqui (HackIA)"
            className="flex-1 min-w-0 bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan/40"
          />
          <button
            type="button"
            onClick={() => removeRow(r.id)}
            className="flex-shrink-0 w-6 h-6 rounded text-white/30 hover:text-hot hover:bg-hot/10 transition-colors"
            title="Remover par"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-mono text-cyan/70 hover:text-cyan transition-colors"
        >
          + adicionar par
        </button>
        <div className="flex items-center gap-3">
          {msg && (
            <span
              className={`text-[10px] font-mono ${msg.type === "err" ? "text-hot" : "text-cyan"}`}
            >
              {msg.text}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg border border-cyan/40 bg-cyan/15 text-cyan text-xs font-semibold px-4 py-1.5 hover:bg-cyan/25 transition-colors disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Salvar apelidos"}
          </button>
        </div>
      </div>
    </div>
  );
}
