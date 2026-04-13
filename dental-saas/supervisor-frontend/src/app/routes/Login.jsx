import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Icon, Input, Button } from '../../components/ui'
import useAuthStore from '../../hooks/useAuthStore'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    // Mock login — in production this would call POST /api/v1/supervisor/auth/login
    setTimeout(() => {
      login('mock_jwt_token_supervisor', { _id: 'sup_001', name: 'Prof. Sarah Connor', email: form.email })
      navigate('/')
      setLoading(false)
    }, 800)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--color-surface)]">
      {/* Background decorations */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <svg className="absolute -top-24 -left-24 w-[600px] h-[600px] text-blue-500/5 opacity-40" viewBox="0 0 200 200">
          <path d="M40,-62.7C52.1,-54.1,62.5,-43.8,69.5,-31.4C76.4,-19,79.8,-4.6,76.4,8.4C73,21.4,62.8,33.1,51.8,43.2C40.8,53.2,29,61.7,16,64.7C3,67.7,-11.2,65.3,-24.5,59.8C-37.8,54.2,-50.2,45.6,-59.5,34.3C-68.8,23,-75,9.1,-74.6,-4.8C-74.1,-18.7,-67,-32.7,-56.3,-41.8C-45.6,-50.8,-31.2,-55,-18.1,-61.4C-4.9,-67.7,6.9,-76.2,18.7,-74.5C30.4,-72.8,42.1,-60.9,40,-62.7Z" fill="currentColor" transform="translate(100 100)" />
        </svg>
        <svg className="absolute -bottom-48 -right-24 w-[800px] h-[800px] text-amber-500/5 opacity-30" viewBox="0 0 200 200">
          <path d="M47.7,-63.1C61.4,-54.1,71.8,-39.7,76.1,-24.1C80.4,-8.4,78.6,8.5,71.1,22.8C63.6,37.1,50.4,48.7,35.8,57.1C21.2,65.4,5.2,70.5,-10.1,68.9C-25.4,67.3,-39.9,59,-51.2,47.8C-62.5,36.5,-70.6,22.2,-72.6,7.2C-74.5,-7.9,-70.3,-23.7,-61.3,-36.4C-52.2,-49.2,-38.2,-58.9,-23.8,-65.3C-9.4,-71.7,5.4,-74.8,21.1,-72.5C36.8,-70.2,47.7,-63.1,47.7,-63.1Z" fill="currentColor" transform="translate(100 100)" />
        </svg>
        <div className="absolute top-1/4 left-10 opacity-[0.03]">
          <span className="material-symbols-outlined text-[200px]" style={{ fontVariationSettings: "'wght' 100" }}>dentistry</span>
        </div>
      </div>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-6xl flex flex-col md:flex-row items-stretch shadow-2xl rounded-xl overflow-hidden min-h-[720px] animate-fade-in">
        {/* Left: Branding */}
        <section className="w-full md:w-7/12 ortho-gradient p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/10 backdrop-blur p-2 rounded-lg">
                <Icon name="dentistry" filled className="text-3xl" />
              </div>
              <h1 className="font-['Manrope'] text-3xl font-extrabold tracking-tighter">OrthoSupervise</h1>
            </div>
            <h2 className="font-['Manrope'] text-xl font-bold mb-4 leading-snug">Academic Orthodontic Supervision</h2>
            <p className="text-blue-100 text-lg leading-relaxed max-w-md">
              Guiding better treatment decisions through expert review and structured supervision.
            </p>
          </div>

          {/* Clinical Mandate */}
          <div className="relative z-10 mt-8 space-y-4">
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/10">
              <p className="text-sm uppercase tracking-widest font-bold text-blue-200 mb-3">Clinical Mandate</p>
              <p className="text-lg font-medium leading-relaxed italic">
                "Every orthodontic decision affects: <strong>Function</strong> (bite & jaw health),{' '}
                <strong>Aesthetics</strong> (confidence & smile), and <strong>Long-term stability</strong>.
                Supervision ensures the right decision — every time."
              </p>
            </div>

            {/* Ecosystem Visual */}
            <div className="flex justify-between items-center gap-4 bg-white/5 p-8 rounded-xl border border-white/5">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-lg">
                  <Icon name="school" size="xl" />
                </div>
                <span className="text-xs font-bold uppercase tracking-tighter opacity-70">Supervisor</span>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/40 to-white/0" />
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-xl ring-4 ring-white/20">
                  <Icon name="person" size="xl" />
                </div>
                <span className="text-xs font-bold uppercase tracking-tighter">Student</span>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/40 to-white/0" />
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white">
                  <Icon name="patient_list" size="xl" />
                </div>
                <span className="text-xs font-bold uppercase tracking-tighter opacity-70">Patient</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-10 border-t border-white/10 text-xs opacity-60 font-medium">
            For certified orthodontic supervisors and postgraduate training programs.
          </div>

          <div className="absolute bottom-0 right-0 p-8 opacity-20">
            <span className="material-symbols-outlined text-[400px]">vital_signs</span>
          </div>
        </section>

        {/* Right: Login Form */}
        <section className="w-full md:w-5/12 bg-white flex flex-col justify-center p-12 lg:p-20 relative">
          <div className="max-w-sm mx-auto w-full">
            <div className="mb-10 text-center md:text-left">
              <h3 className="font-['Manrope'] text-3xl font-extrabold text-slate-900 mb-2">Welcome Back</h3>
              <p className="text-slate-500 text-sm">Access your academic logs and clinical reviews.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Email Address"
                id="email"
                type="email"
                icon="mail"
                placeholder="dr.smith@orthouniv.edu"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="password">Password</label>
                  <a href="#" className="text-xs font-bold text-blue-700 hover:underline">Forgot password?</a>
                </div>
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

              <div className="flex items-center gap-3 py-2">
                <input type="checkbox" id="remember" className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="remember" className="text-sm text-slate-500 select-none">Stay logged in for 30 days</label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 ortho-gradient text-white rounded-xl font-bold text-base shadow-lg shadow-blue-200/30 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
              >
                {loading ? (
                  <span className="animate-spin"><Icon name="progress_activity" /></span>
                ) : (
                  <>Sign In to Dashboard <Icon name="arrow_forward" className="group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </form>

            <div className="mt-12 pt-8 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500 font-medium">
                Need access for your institution?{' '}
                <Link to="/supervisorsignup" className="text-blue-700 font-bold ml-1">Create an account</Link>
              </p>
              <div className="flex items-center justify-center gap-6 opacity-40 mt-6">
                <span className="text-[10px] font-black tracking-tighter">CERTIFIED CLINICAL PARTNER</span>
                <Icon name="verified_user" filled />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <div className="fixed bottom-6 w-full text-center px-6 pointer-events-none">
        <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">
          © 2024 OrthoSupervise Inc. — Secure Academic Infrastructure
        </p>
      </div>
    </div>
  )
}
