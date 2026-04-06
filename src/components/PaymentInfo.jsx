// ============================================================
// PLACEHOLDERS — Troque esses valores quando definir os dados
// ============================================================
const PIX_KEY = 'CHAVE_PIX_A_DEFINIR'
const PIX_KEY_TYPE = 'E-mail / CPF / Telefone'
const CARD_PAYMENT_URL = '#' // Link de pagamento (InfinitePay, MP, etc.)
// ============================================================

export default function PaymentInfo({ paymentMethod, price, email }) {
  return (
    <div className="text-center">
      {/* Success header */}
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
        Inscricao Enviada!
      </h2>
      <p className="text-text-muted mb-8">
        Agora finalize o pagamento para garantir sua vaga.
      </p>

      {/* Payment card */}
      <div className="card-glass rounded-2xl p-8 text-left mb-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-dark-border">
          <span className="text-sm text-text-muted">Valor da Inscricao</span>
          <span className="text-2xl font-bold font-mono text-white">{price}</span>
        </div>

        {paymentMethod === 'pix' ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center text-cyan text-sm font-mono">P</span>
                Pagamento via Pix
              </h3>

              {/* QR Code placeholder */}
              <div className="bg-white rounded-xl p-6 mx-auto w-fit mb-4">
                <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm text-center font-mono">
                  QR Code<br />em breve
                </div>
              </div>

              {/* Pix key */}
              <div className="bg-dark rounded-xl p-4">
                <p className="text-xs text-text-muted mb-2">Chave Pix ({PIX_KEY_TYPE})</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-cyan bg-cyan/5 px-3 py-2 rounded-lg break-all">
                    {PIX_KEY}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(PIX_KEY)}
                    className="px-3 py-2 text-xs bg-cyan/10 text-cyan rounded-lg hover:bg-cyan/20 transition-colors"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gold/5 border border-gold/20 rounded-xl p-4">
              <p className="text-sm text-gold font-semibold mb-1">Importante</p>
              <p className="text-xs text-text-muted">
                Inclua seu e-mail ({email}) na descricao do Pix para facilitar a confirmacao.
                Sua inscricao sera confirmada em ate 24h uteis apos o pagamento.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center text-electric text-sm font-mono">C</span>
                Pagamento via Cartao
              </h3>

              <a
                href={CARD_PAYMENT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 px-8 bg-gradient-to-r from-electric to-violet text-white font-bold text-center rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(58,134,255,0.3)]"
              >
                Ir para Pagamento com Cartao
              </a>

              <p className="text-xs text-text-muted mt-3 text-center">
                Voce sera redirecionado para o link de pagamento seguro.
              </p>
            </div>

            <div className="bg-gold/5 border border-gold/20 rounded-xl p-4">
              <p className="text-sm text-gold font-semibold mb-1">Importante</p>
              <p className="text-xs text-text-muted">
                Utilize o mesmo e-mail ({email}) no pagamento.
                Sua inscricao sera confirmada em ate 24h uteis apos a confirmacao do pagamento.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Next steps */}
      <div className="card-glass rounded-2xl p-6 text-left">
        <h3 className="text-sm font-bold text-white mb-4">Proximos Passos</h3>
        <ol className="space-y-3">
          {[
            'Realize o pagamento usando as instrucoes acima.',
            'Aguarde a confirmacao por e-mail (ate 24h uteis).',
            'Voce sera adicionado(a) ao grupo oficial de WhatsApp.',
            'Dia 22/05, apareca no CIB as 18:30!',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-text-muted">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-electric/10 text-electric text-xs font-mono flex items-center justify-center">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-text-muted mt-6">
        Duvidas? Entre em contato: <a href="mailto:vinirosadacosta@gmail.com" className="text-electric underline">vinirosadacosta@gmail.com</a>
      </p>
    </div>
  )
}
