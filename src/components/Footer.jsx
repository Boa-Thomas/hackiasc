import { EVENT_CONFIG } from '../lib/config'

export default function Footer() {
  return (
    <footer className="relative py-16 border-t border-dark-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10 mb-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="font-mono text-lg font-bold tracking-tight mb-4">
              <span className="text-cyan">{'>'}</span>
              <span className="text-white">hack</span>
              <span className="text-gradient-cyan">IA</span>
              <span className="text-text-muted">.sc</span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">
              AI Hackathon Blumenau 2026. Criando startups reais com IA em Santa Catarina.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4">Evento</h4>
            <ul className="space-y-2">
              {[
                { href: '#sobre', label: 'Sobre' },
                { href: '#cronograma', label: 'Cronograma' },
                { href: '#premios', label: 'Premiação' },
                { href: '#inscricao', label: 'Inscrição' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <a href={href} className="text-sm text-text-muted hover:text-white transition-colors">{label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4">Recursos</h4>
            <ul className="space-y-2">
              <li>
                <a href="#faq" className="text-sm text-text-muted hover:text-white transition-colors">FAQ</a>
              </li>
              <li>
                <a href={EVENT_CONFIG.editalUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-text-muted hover:text-white transition-colors">
                  Edital Completo
                </a>
              </li>
              <li>
                <a href="#privacidade" className="text-sm text-text-muted hover:text-white transition-colors">
                  Política de Privacidade
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4">Contato</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href={EVENT_CONFIG.social.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  {EVENT_CONFIG.social.instagram}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${EVENT_CONFIG.organizer.email}`}
                  className="flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                  {EVENT_CONFIG.organizer.email}
                </a>
              </li>
              <li>
                <a
                  href={EVENT_CONFIG.social.whatsappGroup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Grupo de Participantes
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-dark-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-text-muted">
            <p>&copy; 2026 HackIA SC. Uma iniciativa independente para o ecossistema de Santa Catarina.</p>
            <p className="mt-1">Realização: {EVENT_CONFIG.organizer.company} — CNPJ {EVENT_CONFIG.organizer.cnpj}</p>
          </div>
          <a
            href="https://maps.google.com/?q=Centro+de+Inovação+de+Blumenau+CIB+Rua+São+Paulo+3366+Blumenau+SC"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted font-mono hover:text-cyan transition-colors"
          >
            <span className="text-cyan">@</span> CIB — R. São Paulo, 3366, Itoupava Seca, Blumenau/SC
          </a>
        </div>
      </div>
    </footer>
  )
}
