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
import PaymentReturn from './components/PaymentReturn'
import AdminLogin from './admin/AdminLogin'
import AdminPanel from './admin/AdminPanel'
import { useAdminAuth } from './admin/useAdminAuth'

const PAYMENT_HASHES = ['#pagamento-sucesso', '#pagamento-erro', '#pagamento-pendente']
const ADMIN_HASHES = ['#admin', '#admin-login']

export default function App() {
  const [page, setPage] = useState(window.location.hash)
  const { isAuthenticated, loading: authLoading, error: authError, login, logout } = useAdminAuth()

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Scroll to section when returning from subpages
  useEffect(() => {
    if (page && page !== '#privacidade' && !PAYMENT_HASHES.includes(page) && !ADMIN_HASHES.includes(page)) {
      if (!/^#[a-zA-Z][\w-]*$/.test(page)) return
      setTimeout(() => {
        const el = document.getElementById(page.slice(1))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [page])

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

    return <AdminPanel onLogout={logout} />
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
    </div>
  )
}
