import { useEffect } from 'react'
import { EVENT_CONFIG } from '../lib/config'

function SectionLabel({ children }) {
  return (
    <span className="font-mono text-sm text-electric tracking-wider uppercase">
      {children}
    </span>
  )
}

function SectionCard({ children, className = '' }) {
  return (
    <div className={`card-glass rounded-2xl p-6 sm:p-8 mb-6 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ number, children }) {
  return (
    <h2 className="text-lg font-bold text-white mb-4 flex items-baseline gap-3">
      <span className="font-mono text-electric text-base">{number}.</span>
      {children}
    </h2>
  )
}

function SubTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-white mb-2 mt-4">
      {children}
    </h3>
  )
}

function BodyText({ children }) {
  return (
    <p className="text-sm text-text-muted leading-relaxed">
      {children}
    </p>
  )
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-text-muted leading-relaxed">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-electric flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PrivacyPolicy({ onBack }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const { company, cnpj, address, email, dpo } = EVENT_CONFIG.organizer

  return (
    <div className="min-h-screen bg-dark">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

        {/* Back button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar ao site
        </button>

        {/* Header */}
        <SectionCard>
          <SectionLabel>Legal</SectionLabel>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mt-3 mb-2">
            Política de Privacidade
          </h1>
          <p className="text-text-muted text-sm mb-1">
            {EVENT_CONFIG.name}
          </p>
          <p className="font-mono text-xs text-text-muted">
            Última atualização: 06 de abril de 2026
          </p>
        </SectionCard>

        {/* 1. Controlador dos Dados */}
        <SectionCard>
          <SectionTitle number="1">Controlador dos Dados</SectionTitle>
          <BodyText>
            O tratamento dos dados pessoais coletados neste evento é realizado por:
          </BodyText>
          <div className="mt-4 space-y-1 font-mono text-sm">
            <p className="text-white">{company}</p>
            <p className="text-text-muted">CNPJ: {cnpj}</p>
            <p className="text-text-muted">{address}</p>
            <p className="text-text-muted">E-mail: {email}</p>
          </div>
          <div className="mt-5 pt-5 border-t border-dark-border">
            <SubTitle>Encarregado de Dados (DPO)</SubTitle>
            <p className="text-sm text-text-muted">
              {dpo} — <span className="font-mono text-electric">{email}</span>
            </p>
          </div>
        </SectionCard>

        {/* 2. Dados Coletados */}
        <SectionCard>
          <SectionTitle number="2">Dados Coletados</SectionTitle>

          <SubTitle>2.1 Dados pessoais</SubTitle>
          <BulletList items={[
            'Nome completo',
            'Endereço de e-mail',
            'Número de telefone',
            'Data de nascimento',
            'Perfil do LinkedIn',
          ]} />

          <SubTitle>2.2 Dados sensíveis</SubTitle>
          <BulletList items={[
            'Condição de pessoa com deficiência (PcD) e tipo, quando informado voluntariamente',
            'Restrições alimentares (alergias, intolerâncias, preferências)',
          ]} />

          <SubTitle>2.3 Dados de perfil</SubTitle>
          <BulletList items={[
            'Tipo de ocupação no hackathon (hacker / hustler / hipster)',
            'Nível de experiência com inteligência artificial',
          ]} />

          <SubTitle>2.4 Dados de imagem e voz</SubTitle>
          <BulletList items={[
            'Fotografias, vídeos e gravações realizadas durante o evento para fins de documentação e divulgação',
          ]} />
        </SectionCard>

        {/* 3. Finalidade do Tratamento */}
        <SectionCard>
          <SectionTitle number="3">Finalidade do Tratamento</SectionTitle>

          <SubTitle>3.1 Execução do contrato de inscrição</SubTitle>
          <BulletList items={[
            'Organização logística do evento (credenciamento, crachás, controle de acesso)',
            'Formação de equipes e distribuição de participantes',
            'Planejamento de alimentação e acomodação de restrições dietéticas',
            'Garantia de acessibilidade para participantes com deficiência',
            'Comunicação sobre informações operacionais do evento',
          ]} />

          <SubTitle>3.2 Cumprimento de obrigação legal</SubTitle>
          <BulletList items={[
            'Emissão de notas fiscais e documentos contábeis',
            'Atendimento de retenções tributárias aplicáveis',
          ]} />

          <SubTitle>3.3 Consentimento do titular</SubTitle>
          <BulletList items={[
            'Divulgação do evento em redes sociais e materiais de comunicação',
            'Envio de comunicações sobre edições futuras do hackathon',
          ]} />
        </SectionCard>

        {/* 4. Base Legal */}
        <SectionCard>
          <SectionTitle number="4">Base Legal (LGPD)</SectionTitle>
          <BodyText>
            O tratamento dos dados é fundamentado nas seguintes bases legais previstas na Lei
            nº 13.709/2018 (LGPD):
          </BodyText>
          <BulletList items={[
            'Consentimento (art. 7º, I) — dados gerais de inscrição e dados de imagem/voz para divulgação',
            'Execução de contrato (art. 7º, V) — dados necessários para viabilizar a participação no evento e processar pagamentos',
            'Obrigação legal (art. 7º, II) — dados fiscais exigidos pela legislação tributária',
          ]} />
        </SectionCard>

        {/* 5. Compartilhamento de Dados */}
        <SectionCard>
          <SectionTitle number="5">Compartilhamento de Dados</SectionTitle>
          <BodyText>
            Os dados coletados podem ser compartilhados, de forma restrita e proporcional,
            com as seguintes partes:
          </BodyText>
          <BulletList items={[
            'Centro de Inovação de Blumenau (CIB): nome e credencial para controle de acesso ao espaço do evento',
            'Mentores e facilitadores: nome e perfil do participante para personalização das sessões',
            'Fornecedores de alimentação: restrições alimentares, sem identificação nominal sempre que possível',
            'Supabase Inc. (subprocessador de dados): armazenamento seguro com criptografia em conformidade com a LGPD',
            'Mercado Pago: processamento de pagamentos realizados via cartão de crédito',
          ]} />
          <div className="mt-4 pt-4 border-t border-dark-border">
            <BodyText>
              Os dados pessoais dos participantes <strong className="text-white">não são vendidos</strong> nem
              compartilhados para fins de marketing de terceiros sem consentimento específico e destacado.
            </BodyText>
          </div>
        </SectionCard>

        {/* 6. Retenção e Exclusão */}
        <SectionCard>
          <SectionTitle number="6">Retenção e Exclusão</SectionTitle>
          <BodyText>
            Os dados são retidos pelo prazo mínimo necessário para cada finalidade:
          </BodyText>
          <BulletList items={[
            '12 meses após o evento: dados gerais de inscrição (nome, e-mail, telefone, perfil)',
            '30 dias após o evento: dados sensíveis (condição PcD, restrições alimentares) — mantidos apenas registros anonimizados para fins estatísticos',
            '5 anos: dados fiscais (nome, CPF, valor pago) — prazo exigido por obrigação legal tributária',
          ]} />
        </SectionCard>

        {/* 7. Direitos do Titular */}
        <SectionCard>
          <SectionTitle number="7">Direitos do Titular (LGPD art. 18)</SectionTitle>
          <BodyText>
            Todo participante tem garantidos os seguintes direitos em relação aos seus dados pessoais:
          </BodyText>
          <BulletList items={[
            'Confirmação da existência de tratamento',
            'Acesso aos dados tratados',
            'Correção de dados incompletos, inexatos ou desatualizados',
            'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade',
            'Portabilidade dos dados a outro fornecedor de serviço ou produto',
            'Revogação do consentimento a qualquer momento',
            'Eliminação dos dados tratados com base no consentimento',
          ]} />
          <div className="mt-4 pt-4 border-t border-dark-border">
            <BodyText>
              Solicitações podem ser enviadas para{' '}
              <span className="font-mono text-electric">{email}</span> e serão respondidas
              em até <strong className="text-white">15 dias úteis</strong>.
            </BodyText>
          </div>
        </SectionCard>

        {/* 8. Segurança */}
        <SectionCard>
          <SectionTitle number="8">Segurança</SectionTitle>
          <BodyText>
            Adotamos medidas técnicas e organizacionais para proteger os dados pessoais
            contra acesso não autorizado, perda ou divulgação indevida:
          </BodyText>
          <BulletList items={[
            'Dados armazenados no Supabase com criptografia TLS em trânsito e criptografia em repouso',
            'Row Level Security (RLS) configurado no banco de dados — acesso restrito por perfil de usuário',
            'Acesso administrativo aos dados limitado aos organizadores do evento',
          ]} />
        </SectionCard>

        {/* 9. Cookies */}
        <SectionCard>
          <SectionTitle number="9">Cookies</SectionTitle>
          <BodyText>
            Este site <strong className="text-white">não utiliza cookies de rastreamento</strong> nem
            ferramentas de analytics de terceiros. Nenhum dado de navegação é coletado para
            fins publicitários ou de perfilamento.
          </BodyText>
        </SectionCard>

        {/* 10. Alterações */}
        <SectionCard>
          <SectionTitle number="10">Alterações nesta Política</SectionTitle>
          <BodyText>
            Esta política pode ser atualizada a qualquer momento para refletir mudanças
            operacionais, legais ou regulatórias. Participantes já inscritos serão notificados
            por e-mail sobre alterações relevantes com antecedência razoável.
          </BodyText>
          <BodyText>
            A data da última atualização consta no topo deste documento.
          </BodyText>
        </SectionCard>

        {/* Footer */}
        <SectionCard>
          <SectionLabel>Contato</SectionLabel>
          <div className="mt-3 space-y-1 font-mono text-sm">
            <p className="text-white">{company}</p>
            <p className="text-text-muted">CNPJ: {cnpj}</p>
            <p className="text-text-muted">{address}</p>
            <p className="mt-2">
              <span className="text-text-muted">E-mail: </span>
              <span className="text-electric">{email}</span>
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-dark-border">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Voltar ao site
            </button>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
