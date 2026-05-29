import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import About from './components/About'
import Timeline from './components/Timeline'
import Prizes from './components/Prizes'
import Mentorship from './components/Mentorship'
import RegistrationForm from './components/RegistrationForm'
import FAQ from './components/FAQ'
import Footer from './components/Footer'
import PrivacyPolicy from './components/PrivacyPolicy'
import SponsorshipPage from './components/SponsorshipPage'
import PaymentReturn from './components/PaymentReturn'
import AdminLogin from './admin/AdminLogin'
import AdminPanel from './admin/AdminPanel'
import StaffAccess from './admin/StaffAccess'
import { useAdminAuth } from './admin/useAdminAuth'
import ParticipantLogin from './participant/ParticipantLogin'
import ParticipantPanel from './participant/ParticipantPanel'
import { useParticipantAuth } from './participant/useParticipantAuth'
import MentorLogin from './mentor/MentorLogin'
import MentorPanel from './mentor/MentorPanel'
import MentorGuide from './mentor/MentorGuide'
import { useMentorAuth } from './mentor/useMentorAuth'
import CountdownFloat from './components/CountdownFloat'
import ScrollToTop from './components/ScrollToTop'
import JurorPanel from './juror/JurorPanel'
import WallParticipant from './wall/WallParticipant'
import WallScreen from './wall/WallScreen'

const PAYMENT_HASHES = ['#pagamento-sucesso', '#pagamento-erro', '#pagamento-pendente']
const ADMIN_HASHES = ['#admin', '#admin-login']
const PARTICIPANT_HASHES = ['#participante', '#participante-login']
const WALL_HASHES = ['#muro', '#telao']

export default function App() {
  const [page, setPage] = useState(window.location.hash)
  const { isAuthenticated, role, loading: authLoading, error: authError, login, logout } = useAdminAuth()
  const participantAuth = useParticipantAuth()
  const mentorAuth = useMentorAuth()

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Scroll to section when returning from subpages
  useEffect(() => {
    if (
      page &&
      page !== '#privacidade' &&
      page !== '#patrocinio' &&
      page !== '#sponsorship' &&
      !PAYMENT_HASHES.includes(page) &&
      !ADMIN_HASHES.includes(page) &&
      !PARTICIPANT_HASHES.includes(page) &&
      !page.startsWith('#mentor') &&
      !WALL_HASHES.includes(page) &&
      !page.startsWith('#jurado')
    ) {
      if (!/^#[a-zA-Z][\w-]*$/.test(page)) return
      setTimeout(() => {
        const el = document.getElementById(page.slice(1))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [page])

  // Auto-login da equipe (Muro + Check-in) — #admin-acesso?t=<token>
  if (page.startsWith('#admin-acesso')) {
    return <StaffAccess />
  }

  // Admin routes
  if (page === '#admin' || page === '#admin-login') {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-dark flex items-center justify-center">
          <p className="text-white/60 font-mono">Carregando...</p>
        </div>
      )
    }

    if (!isAuthenticated) {
      return <AdminLogin onLogin={login} error={authError} />
    }

    return <AdminPanel onLogout={logout} role={role} />
  }

  // Participant routes
  if (PARTICIPANT_HASHES.includes(page)) {
    if (participantAuth.loading) {
      return (
        <div className="min-h-screen bg-dark flex items-center justify-center">
          <p className="text-white/60 font-mono">Carregando...</p>
        </div>
      )
    }

    if (!participantAuth.isAuthenticated) {
      return (
        <ParticipantLogin
          onLogin={participantAuth.login}
          error={participantAuth.error}
          loading={participantAuth.loading}
        />
      )
    }

    return <ParticipantPanel auth={participantAuth} />
  }

  // Mentor routes — sessao (email+codigo via #mentor / #mentor-login) OU
  // link secreto (token na querystring do hash: #mentor?t=<uuid>, sem login).
  if (page.startsWith('#mentor')) {
    if (mentorAuth.loading) {
      return (
        <div className="min-h-screen bg-dark flex items-center justify-center">
          <p className="text-white/60 font-mono">Carregando...</p>
        </div>
      )
    }

    if (!mentorAuth.isAuthenticated) {
      return <MentorLogin onLogin={mentorAuth.login} error={mentorAuth.error} loading={mentorAuth.loading} />
    }

    // Guia do Mentor — página de consulta restrita (herda o gate de auth acima)
    if (page === '#mentor-guia') {
      return <MentorGuide onBack={() => { window.location.hash = '#mentor' }} />
    }

    return <MentorPanel auth={mentorAuth} />
  }

  // Juror routes — token na querystring do hash: #jurado?t=<uuid> (sem login)
  if (page.startsWith('#jurado')) {
    return <JurorPanel />
  }

  // Muro de Dores / Telão — telas fullscreen, sem login
  if (page === '#muro') {
    return <WallParticipant participantAuth={participantAuth} />
  }
  if (page === '#telao') {
    return <WallScreen />
  }

  if (page === '#privacidade') {
    return (
      <PrivacyPolicy onBack={() => {
        window.location.hash = ''
        setPage('')
        window.scrollTo(0, 0)
      }} />
    )
  }

  if (page === '#patrocinio' || page === '#sponsorship') {
    return (
      <SponsorshipPage
        lang={page === '#sponsorship' ? 'en-US' : 'pt-BR'}
        onBack={() => {
          window.location.hash = ''
          setPage('')
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  if (PAYMENT_HASHES.includes(page)) {
    const status = page === '#pagamento-sucesso' ? 'success'
      : page === '#pagamento-erro' ? 'failure'
      : 'pending'

    return (
      <PaymentReturn status={status} onBack={() => {
        window.location.hash = ''
        setPage('')
        window.scrollTo(0, 0)
      }} />
    )
  }

  return (
    <div className="min-h-screen bg-dark text-white">
      <Navbar />
      <Hero />
      <About />
      <Timeline />
      <Prizes />
      <Mentorship />
      <RegistrationForm />
      <FAQ />
      <Footer />
      <CountdownFloat />
      <ScrollToTop />
    </div>
  )
}
