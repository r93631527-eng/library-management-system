import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight, BookOpen, Bookmark, Boxes, ChevronDown, CircleHelp,
  Download, GraduationCap, LayoutDashboard, LogOut, Menu, Moon, Search, Sun,
  Settings2, Sparkles, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../context/useApp'

const studentLinks = [
  { to: '/student', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/ai-summarizer', label: 'Gemini AI PDF Summarizer', icon: Sparkles },
  { to: '/student/search', label: 'Search library', icon: Search },
  { to: '/student/books', label: 'Browse books', icon: BookOpen },
  { to: '/student/my-books', label: 'My books', icon: Bookmark },
  { to: '/student/resources', label: 'Study resources', icon: Download },
]
const adminLinks = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/ai-summarizer', label: 'Gemini AI PDF Summarizer', icon: Sparkles },
  { to: '/admin/books', label: 'Manage books', icon: BookOpen },
  { to: '/admin/resources', label: 'Resources', icon: Download },
  { to: '/admin/students', label: 'Manage students', icon: Users },
  { to: '/admin/librarians', label: 'Manage librarians', icon: Settings2 },
  { to: '/admin/issues', label: 'Book circulation', icon: Boxes },
  { to: '/admin/catalog', label: 'Categories & subjects', icon: BookOpen },
  { to: '/admin/reports', label: 'Reports', icon: ArrowUpRight },
  { to: '/admin/notifications', label: 'Notifications', icon: CircleHelp },
  { to: '/admin/settings', label: 'Settings', icon: Settings2 },
]

export function AppShell() {
  const { database, user, signOut, theme, toggleTheme } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = user?.role === 'admin'
    ? adminLinks
    : user?.canManageResources
      ? [...studentLinks, { to: '/student/manage-resources', label: 'Manage resources', icon: Settings2 }]
      : studentLinks
  const sectionName = links.find((link) => link.to === location.pathname)?.label ?? 'Library'

  async function logout() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="sidebar hidden lg:flex">
        <div className="flex items-center gap-3 px-7 pt-8 pb-10">
          <div className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></div>
          <div>
            <p className="font-display text-[17px] font-semibold leading-5 tracking-tight">LibraAI</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.19em] text-muted">Campus library</p>
          </div>
        </div>
        <p className="px-7 pb-3 text-[10px] font-bold uppercase tracking-[.17em] text-[#9ba8a1]">Workspace</p>
        <nav className="flex-1 space-y-1 px-3">
          {links.map(({ to, label, icon: Icon, end }) => {
            const pendingRequests = user?.role === 'admin' && to === '/admin/notifications' ? database.pendingRequestCount : 0
            return <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={17} strokeWidth={1.9} /><span>{label}</span>
              {pendingRequests > 0 && <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white" aria-label={`${pendingRequests} pending book requests`}>{pendingRequests > 99 ? '99+' : pendingRequests}</span>}
            </NavLink>
          })}
        </nav>
        <div className="mx-5 mb-4 rounded-2xl bg-[#f3f6f1] p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#dce9df] text-forest">
            {user?.role === 'admin' ? <Settings2 size={17} /> : <GraduationCap size={18} />}
          </div>
          <p className="text-xs font-semibold">{user?.role === 'admin' ? 'Library team' : 'Your reading list'}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted">{user?.role === 'admin' ? 'Keep your campus collection in order.' : 'Find your next favorite read.'}</p>
        </div>
        <div className="border-t border-[#edf0ec] p-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="avatar">{user?.name?.slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user?.name}</p>
              <p className="truncate text-[10px] text-muted">{user?.role === 'admin' ? `Librarian · ${user.usn}` : `${user?.usn} · ${user?.department}`}</p>
            </div>
            <button type="button" className="icon-button" aria-label="Log out" onClick={logout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-[#e9eee9] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between px-4 sm:px-7 lg:px-10">
            <div className="flex items-center gap-3">
              <button type="button" className="icon-button lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}>
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="lg:hidden">
                <p className="font-display text-sm font-semibold">LibraAI</p>
                <p className="text-[9px] uppercase tracking-[.17em] text-muted">{sectionName}</p>
              </div>
              <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
                <span>Workspace</span><span className="text-[#cbd3cd]">/</span><span className="font-medium text-ink">{sectionName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-1.5 hover:bg-[#f3f6f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
                  <span className="hidden text-right sm:block"><span className="block text-xs font-semibold">{user?.name?.split(' ')[0]}</span><span className="block text-[10px] text-muted">{user?.role === 'admin' ? 'Librarian' : 'Student'}</span></span>
                  <span className="avatar">{user?.name?.slice(0, 1)}</span>
                  <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-[#e5ebe4] bg-white p-2 shadow-lg" role="menu">
                  <div className="border-b border-[#edf0ec] px-3 py-2.5">
                    <p className="truncate text-xs font-semibold">{user?.name}</p>
                    <p className="mt-1 truncate text-[10px] text-muted">{user?.email}</p>
                    <p className="mt-1 text-[10px] text-muted">{user?.role === 'admin' ? `Librarian · ${user.usn}` : `${user?.usn} · ${user?.department}`}</p>
                  </div>
                  <button type="button" role="menuitem" className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-600" onClick={logout}><LogOut size={15} /> Log out</button>
                </div>
              </details>
            </div>
          </div>
          {menuOpen && <nav className="grid gap-1 border-t border-[#edf0ec] bg-white p-3 lg:hidden">
            {links.map(({ to, label, icon: Icon, end }) => {
              const pendingRequests = user?.role === 'admin' && to === '/admin/notifications' ? database.pendingRequestCount : 0
              return <NavLink key={to} end={end} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                <Icon size={17} /><span>{label}</span>
                {pendingRequests > 0 && <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white" aria-label={`${pendingRequests} pending book requests`}>{pendingRequests > 99 ? '99+' : pendingRequests}</span>}
              </NavLink>
            })}
          </nav>}
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">
          <Outlet />
        </main>
        <footer className="mx-auto max-w-[1500px] px-4 pb-8 text-center text-[10px] text-[#9aa59f] sm:px-7 lg:px-10">
          A little more knowledge, one page at a time.
        </footer>
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-forest">{eyebrow}</p>}
        <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-.04em] sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}

export function EmptyState({ title, description, icon: Icon = CircleHelp, action }) {
  return (
    <div className="flex min-h-[245px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#dce4dc] bg-white px-5 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0f5ef] text-forest"><Icon size={22} /></div>
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatCard({ label, value, note, icon: Icon, tint = 'sage' }) {
  return (
    <div className="card flex min-h-[132px] items-start justify-between p-5 sm:p-6">
      <div>
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-3 font-display text-[30px] font-semibold leading-none tracking-tight">{value}</p>
        {note && <p className="mt-2 text-[10px] text-muted">{note}</p>}
      </div>
      <div className={`stat-icon stat-${tint}`}><Icon size={19} strokeWidth={1.8} /></div>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Modal({ title, description, onClose, children, wide = false, scrollable = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`modal-panel ${wide ? 'max-w-2xl' : 'max-w-lg'} ${scrollable ? 'modal-panel-scrollable' : ''}`}>
        <div className="flex shrink-0 items-start justify-between border-b border-[#edf0ec] px-5 py-5 sm:px-7">
          <div><h2 className="font-display text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-xs text-muted">{description}</p>}</div>
          <button type="button" className="icon-button -mr-2 -mt-1" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return <label className="search-box"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><span className="hidden text-[10px] text-[#a6b0aa] sm:inline">Search</span></label>
}

export function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  return <div className={`toast toast-${toast.tone}`} role="status">{toast.tone === 'error' ? <X size={16} /> : <ArrowUpRight size={16} />}{toast.message}</div>
}
