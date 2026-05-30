import { useEffect, useState } from "react";
import {
  VisaoGeral,
  Metodo,
  Glossario,
  Checklist,
  Roteiro,
  GestaoTempo,
  EnergiaRitmo,
  Imprevistos,
  Encerramento,
} from "./facilitatorGuideContent";

const SECTIONS = [
  { id: "visao", label: "Visão Geral", Component: VisaoGeral },
  { id: "metodo", label: "O Método", Component: Metodo },
  { id: "glossario", label: "Glossário", Component: Glossario },
  { id: "checklist", label: "Antes de Começar", Component: Checklist },
  { id: "roteiro", label: "Roteiro por Bloco", Component: Roteiro },
  { id: "tempo", label: "Gestão de Tempo", Component: GestaoTempo },
  { id: "energia", label: "Energia da Sala", Component: EnergiaRitmo },
  { id: "imprevistos", label: "Imprevistos", Component: Imprevistos },
  { id: "encerramento", label: "Encerramento", Component: Encerramento },
];

export default function FacilitatorGuide({ onBack }) {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const section = SECTIONS.find((s) => s.id === active) || SECTIONS[0];
  const ActiveSection = section.Component;

  return (
    <div className="min-h-screen bg-dark text-white bg-grid">
      <div className="orb w-[500px] h-[500px] bg-cyan/5 -top-40 -right-40 pointer-events-none" />

      <header className="sticky top-0 z-20 bg-dark/80 backdrop-blur border-b border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack ? (
              <a
                href="#facilitador"
                onClick={(e) => {
                  e.preventDefault();
                  onBack();
                }}
                className="font-mono text-lg font-bold tracking-tight"
              >
                <span className="text-cyan">{">"}</span>
                <span className="text-white">hack</span>
                <span className="text-gradient-cyan">IA</span>
                <span className="text-text-muted">.sc</span>
              </a>
            ) : (
              <span className="font-mono text-lg font-bold tracking-tight">
                <span className="text-cyan">{">"}</span>
                <span className="text-white">hack</span>
                <span className="text-gradient-cyan">IA</span>
                <span className="text-text-muted">.sc</span>
              </span>
            )}
            <span className="hidden sm:inline-block text-text-muted text-xs font-mono uppercase tracking-wider truncate">
              / Guia da Facilitadora
            </span>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-dark-border text-text-muted hover:text-white hover:border-text-muted transition-colors whitespace-nowrap"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
              <span className="hidden sm:inline">Voltar ao painel</span>
              <span className="sm:hidden">Painel</span>
            </button>
          )}
        </div>

        {/* Navegação por seções */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActive(s.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                  active === s.id
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="card-glass rounded-2xl p-6 sm:p-8">
          <ActiveSection />
        </div>

        {onBack && (
          <div className="mt-6">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
              Voltar ao painel
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
