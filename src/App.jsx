import Navbar from './components/Navbar'
import Hero from './components/Hero'
import About from './components/About'
import Timeline from './components/Timeline'
import Prizes from './components/Prizes'
import Mentorship from './components/Mentorship'
import RegistrationForm from './components/RegistrationForm'
import FAQ from './components/FAQ'
import Footer from './components/Footer'

export default function App() {
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
