import { EXTERNAL_PHASE_TRACKER } from "../lib/config";

const TOTAL = EXTERNAL_PHASE_TRACKER.PHASES.length;
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

// Pilula colorida com a fase atual da equipe (ou "—" quando sem par no tracking).
export default function PhaseBadge({ phase }) {
  if (!phase) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-white/5 text-white/30 border-white/10"
        title="Sem fase no tracking externo"
      >
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border"
      style={{
        color: phase.color,
        background: `${phase.color}20`,
        borderColor: `${phase.color}50`,
      }}
      title={`Fase ${phase.order + 1}/${TOTAL}: ${phase.label}`}
    >
      {CIRCLED[phase.order] || phase.order + 1} {phase.label}
    </span>
  );
}
