import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Icon, Button, Avatar } from '../../components/ui'
import useAuthStore from '../../hooks/useAuthStore'
import { MOCK_SUPERVISOR } from '../../services/mockData'

const NAV_ITEMS = [
  { path: '/', icon: 'dashboard', label: 'Dashboard' },
  { path: '/cases', icon: 'clinical_notes', label: 'Cases' },
  { path: '/invitations', icon: 'mail', label: 'Invitations' },
  { path: '/reviews', icon: 'rate_review', label: 'Reviews' },
  { path: '/settings', icon: 'settings', label: 'Settings' },
]

function Sidebar() {
  const navigate = useNavigate()
  const logout = useAuthStore(s => s.logout)

  return (
    <aside className="fixed left-0 top-0 bottom-0 flex flex-col w-64 py-6 border-r border-slate-200/50 bg-slate-50 z-30">
      {/* Logo */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)] flex items-center justify-center text-white">
          <Icon name="orthopedics" filled />
        </div>
        <div>
          <h2 className="text-blue-900 font-bold text-sm leading-tight font-['Manrope'] tracking-tight">OrthoSupervise</h2>
          <p className="text-xs text-slate-500 font-medium">Clinical Supervisor</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
            }
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* New Review CTA */}
      <div className="px-4 mb-4">
        <button
          onClick={() => navigate('/cases')}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 ortho-gradient text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200/50 active:scale-95 transition-all"
        >
          <Icon name="add" size="sm" />
          New Case Review
        </button>
      </div>

      {/* Footer */}
      <div className="px-4 border-t border-slate-200 pt-4 space-y-1">
        <a href="#" className="sidebar-link sidebar-link-inactive">
          <Icon name="contact_support" />
          <span>Support</span>
        </a>
        <button onClick={logout} className="sidebar-link sidebar-link-inactive w-full">
          <Icon name="logout" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const supervisor = MOCK_SUPERVISOR

  return (
    <header className="fixed top-0 right-0 left-64 flex justify-between items-center px-8 h-16 bg-white/80 backdrop-blur-xl z-40 border-b border-slate-100">
      {/* Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search cases, students..."
            className="w-full bg-slate-50 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        <button className="text-xs font-bold text-blue-700 px-3 py-1.5 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors">
          Academic Portal
        </button>
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors relative">
            <Icon name="notifications" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
            <Icon name="help_outline" />
          </button>
        </div>
        <NavLink to="/profile" className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="text-right hidden lg:block">
            <p className="text-sm font-bold leading-none text-slate-900">{supervisor.name}</p>
            <p className="text-[10px] text-slate-500 font-medium">{supervisor.title}</p>
          </div>
          <Avatar name={supervisor.name} size="md" />
        </NavLink>
      </div>
    </header>
  )
}

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <Sidebar />
      <TopBar />
      <main className="ml-64 pt-24 px-8 pb-12 min-h-screen">
        {children}
      </main>
    </div>
  )
}
