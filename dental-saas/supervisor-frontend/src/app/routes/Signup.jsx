import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Icon, Input } from '../../components/ui'
import useAuthStore from '../../hooks/useAuthStore'

export default function Signup() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [form, setForm] = useState({ name: '', email: '', institution: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    // Mock registration — in production this would call POST /api/v1/supervisor/auth/register
    setTimeout(() => {
      login('mock_jwt_token_supervisor', { _id: 'sup_new', name: form.name, email: form.email })
      navigate('/')
      setLoading(false)
    }, 800)
  }

  return (
    <div className="min-h-screen font-['Inter'] text-slate-900 antialiased overflow-hidden">
      <main className="flex min-h-screen flex-col md:flex-row">
        {/* Left: Vision */}
        <section className="relative hidden w-full md:flex md:w-1/2 ortho-gradient overflow-hidden flex-col justify-between p-12 lg:p-16">
          {/* Decorative curves */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg className="absolute top-0 right-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path d="M0 100 C 20 0, 50 0, 100 100" fill="transparent" stroke="white" strokeWidth="0.1" />
              <path d="M0 80 C 30 20, 70 20, 100 80" fill="transparent" stroke="white" strokeWidth="0.1" />
            </svg>
          </div>

          <div className="z-10">
            <div className="flex items-center gap-2 mb-12">
              <Icon name="dentistry" filled className="text-white text-3xl" />
              <span className="text-white font-['Manrope'] font-extrabold text-2xl tracking-tighter">OrthoSupervise</span>
            </div>
            <h1 className="text-white font-['Manrope'] font-extrabold text-5xl lg:text-6xl tracking-tight leading-tight mb-6">
              Shape Smiles.<br />Guide Futures.
            </h1>
            <p className="text-blue-100 text-lg max-w-md font-medium leading-relaxed opacity-90">
              Supervise orthodontic students and ensure every treatment plan delivers functional, aesthetic, and stable outcomes.
            </p>
          </div>

          {/* Layer Stack Visual */}
          <div className="relative z-10 flex-1 flex items-center justify-center my-12">
            <div className="relative w-full max-w-sm aspect-square">
              {/* Patient Layer */}
              <div className="absolute inset-0 translate-x-12 -translate-y-8 bg-white/10 rounded-xl border border-white/20 p-6 backdrop-blur-md">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-white/60 text-xs font-bold tracking-widest uppercase">Patient Tier</span>
                  <Icon name="person" className="text-white/40" />
                </div>
                <div className="w-full h-24 bg-white/10 rounded-lg" />
              </div>
              {/* Student Layer */}
              <div className="absolute inset-0 translate-x-6 -translate-y-4 bg-white/20 rounded-xl border border-white/30 p-6 backdrop-blur-md">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-white/80 text-xs font-bold tracking-widest uppercase">Clinical Student</span>
                  <Icon name="school" className="text-white/60" />
                </div>
                <div className="w-full h-24 bg-white/15 rounded-lg" />
              </div>
              {/* Supervisor Layer */}
              <div className="absolute inset-0 bg-white/30 rounded-xl border border-white/40 p-6 backdrop-blur-lg shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-white text-xs font-bold tracking-widest uppercase">Supervisor Review</span>
                  <Icon name="verified_user" className="text-white" />
                </div>
                <div className="space-y-3">
                  <div className="h-2 w-3/4 bg-white/40 rounded-full" />
                  <div className="h-2 w-1/2 bg-white/40 rounded-full" />
                  <div className="flex gap-2 pt-2">
                    <div className="px-3 py-1 rounded-full bg-blue-600 text-[10px] text-white font-bold">APPROVE</div>
                    <div className="px-3 py-1 rounded-full bg-white/20 text-[10px] text-white font-bold">REVISE</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Impact */}
          <div className="z-10">
            <p className="text-white/70 text-xs font-bold tracking-[0.2em] uppercase mb-4">Why it matters</p>
            <div className="grid grid-cols-2 gap-4">
              {['Better bite function', 'Improved facial balance', 'Increased patient confidence', 'Long-term oral health'].map(item => (
                <div key={item} className="flex items-center gap-2">
                  <Icon name="check_circle" size="sm" className="text-white" />
                  <span className="text-white text-xs font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Form */}
        <section className="flex flex-col w-full md:w-1/2 bg-[var(--color-surface)] justify-center items-center px-6 py-12 lg:px-24">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="flex md:hidden items-center gap-2 mb-8">
              <Icon name="dentistry" filled className="text-blue-700 text-3xl" />
              <span className="text-blue-700 font-['Manrope'] font-extrabold text-2xl tracking-tighter">OrthoSupervise</span>
            </div>

            <div className="mb-10">
              <h2 className="text-3xl font-['Manrope'] font-extrabold text-slate-900 tracking-tight mb-2">Create Account</h2>
              <p className="text-slate-500 font-medium">Register as a certified orthodontic supervisor</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Full Name"
                id="full_name"
                icon="person"
                placeholder="Dr. Jane Smith"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <Input
                label="Email Address"
                id="email"
                type="email"
                icon="mail"
                placeholder="jane.smith@ortho-inst.edu"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
              <Input
                label="Clinical Institution"
                id="institution"
                icon="account_balance"
                placeholder="University of Orthodontics"
                value={form.institution}
                onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
                required
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="password">Password</label>
                <div className="relative">
                  <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className="input-field pl-12 pr-12"
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <Icon name={showPw ? 'visibility_off' : 'visibility'} size="sm" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full ortho-gradient text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200/30 hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <span className="animate-spin"><Icon name="progress_activity" /></span>
                ) : (
                  <>Create Supervisor Account <Icon name="arrow_forward" /></>
                )}
              </button>
            </form>

            <div className="mt-12 pt-8 border-t border-slate-200">
              <div className="flex flex-wrap gap-6 justify-center">
                {[
                  { icon: 'verified', text: 'Verified professionals only' },
                  { icon: 'security', text: 'Secure patient data' },
                  { icon: 'visibility_off', text: 'Academic supervision only' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-slate-500">
                    <Icon name={icon} filled size="sm" className="text-blue-600" />
                    <span className="text-xs font-semibold">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-12 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/supervisorlogin" className="text-blue-700 font-bold hover:underline">Sign In</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
