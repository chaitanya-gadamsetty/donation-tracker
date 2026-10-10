import { useEffect, useState } from 'react'
import { DonationForm } from './components/DonationForm'
import { Icon } from './components/ui'
import type { DonationDraft } from './lib/draft'
import { Foundations } from './pages/Foundations'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Pledges } from './pages/Pledges'
import { Settings } from './pages/Settings'

const PAGES = [
  { id: 'home', label: 'Home', icon: Icon.home },
  { id: 'history', label: 'History', icon: Icon.list },
  { id: 'foundations', label: 'Foundations', icon: Icon.building },
  { id: 'pledges', label: 'Pledges', icon: Icon.repeat },
  { id: 'settings', label: 'Settings', icon: Icon.gear },
] as const

function readHash() {
  const [page, query = ''] = location.hash.replace(/^#\/?/, '').split('?')
  return { page: PAGES.some((p) => p.id === page) ? page : 'home', params: new URLSearchParams(query) }
}

export default function App() {
  const [route, setRoute] = useState(readHash)
  const [form, setForm] = useState<{ draft: DonationDraft; notice?: string; key: number } | null>(null)

  useEffect(() => {
    const on = () => setRoute(readHash())
    window.addEventListener('hashchange', on)
    // Ask the browser not to evict our data under storage pressure (important on iOS).
    navigator.storage?.persist?.().catch(() => {})
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const goTo = (page: string) => {
    location.hash = '/' + page
    window.scrollTo(0, 0)
  }
  const openForm = (draft: DonationDraft, notice?: string) => setForm({ draft, notice, key: Date.now() })

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand"><span style={{ width: 22, height: 22, color: 'var(--accent)', display: 'inline-flex' }}>{Icon.heart}</span>Donations</div>
        {PAGES.map((p) => (
          <button key={p.id} className={route.page === p.id ? 'active' : ''} onClick={() => goTo(p.id)} aria-current={route.page === p.id ? 'page' : undefined}>
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
      <main className="main">
        {route.page === 'home' && <Home onOpenForm={openForm} goTo={goTo} />}
        {route.page === 'history' && <History key={location.hash} onOpenForm={openForm} initialReceipt={route.params.get('receipt') ?? undefined} />}
        {route.page === 'foundations' && <Foundations />}
        {route.page === 'pledges' && <Pledges />}
        {route.page === 'settings' && <Settings />}
      </main>
      {form && <DonationForm key={form.key} initial={form.draft} notice={form.notice} onClose={() => setForm(null)} />}
    </div>
  )
}
