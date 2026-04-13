/**
 * LoginPage.tsx
 * Patient Portal — Premium Split-Screen Login
 *
 * Design: Figma → Production Implementation
 * Features:
 *   - Split-screen layout (hero left / form right)
 *   - Password login + OTP login (tabbed)
 *   - Magic link mode
 *   - Floating label inputs with Material Design feel
 *   - Mesh gradient hero with glassmorphism cards
 *   - Micro-animations (hover, focus, transitions)
 *   - Responsive: collapses to single-column on mobile
 *   - Password visibility toggle
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  Send,
  BarChart3,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { authApi } from '@/api/auth.api';

type AuthTab = 'password' | 'otp';
type OtpStep = 'request' | 'verify';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithCredentials, loginWithOtp, isLoading } = usePortalAuth();

  // Form state
  const [activeTab, setActiveTab] = useState<AuthTab>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [otpStep, setOtpStep] = useState<OtpStep>('request');

  // UI state
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [localLoading, setLocalLoading] = useState(false);

  // Refs
  const otpInputRef = useRef<HTMLInputElement>(null);

  const loading = isLoading || localLoading;

  /* ─── Handlers ────────────────────────────────────────────────── */

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await loginWithCredentials(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid credentials. Please try again.');
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLocalLoading(true);
    try {
      await authApi.requestOtp(email);
      setSuccessMessage('');
      setOtpStep('verify');
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send OTP.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await loginWithOtp(email, otp);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid or expired OTP.');
    }
  };

  const handleRequestMagicLink = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setLocalLoading(true);
    try {
      await authApi.requestMagicLink(email);
      setSuccessMessage('If this email is registered, a magic link has been sent. Check your inbox.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send magic link.');
    } finally {
      setLocalLoading(false);
    }
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError('');
    setSuccessMessage('');
    setOtp('');
    setOtpStep('request');
  };

  /* ─── Feature cards data ─────────────────────────────────────── */
  const features = [
    { icon: BarChart3, label: 'Treatment Progress Tracking' },
    { icon: CalendarDays, label: 'Smart Appointment Scheduling' },
    { icon: ClipboardList, label: 'Personalized Care Plans' },
  ];

  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50">
      {/* ═══════════════════════════════════════════════════════════
          LEFT PANEL — Hero / Branding (hidden on mobile)
         ═══════════════════════════════════════════════════════════ */}
      <section className="hidden lg:flex lg:w-7/12 relative flex-col justify-between p-16 overflow-hidden login-hero">
        {/* Mesh gradient overlay texture */}
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none bg-[url('/images/aligner-hero.png')] bg-cover bg-center" />

        {/* Content */}
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-14">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/15 shadow-lg shadow-black/5">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <span className="font-['Manrope',sans-serif] font-extrabold text-xl tracking-tight text-white">
              Patient Care
            </span>
          </div>

          {/* Hero copy */}
          <div className="max-w-xl">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-['Manrope',sans-serif] font-extrabold text-[3.2rem] leading-[1.1] text-white mb-6 drop-shadow-sm"
            >
              Transforming Smiles
              <br />
              with Precision
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-blue-100/90 text-xl font-medium leading-relaxed mb-14"
            >
              Your personalized orthodontic journey, powered by expert care and digital innovation.
            </motion.p>
          </div>

          {/* Feature cards */}
          <div className="flex flex-col gap-4 max-w-lg">
            {features.map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                className="glass-card p-5 rounded-2xl flex items-center gap-5 cursor-default group"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center border border-white/15 shrink-0 group-hover:bg-white/30 transition-colors duration-300">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-white font-semibold text-[1.05rem]">
                  {feature.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Floating aligner image */}
        <div className="absolute bottom-0 right-0 w-[75%] h-[55%] pointer-events-none select-none">
          <img
            src="/images/aligner-hero.png"
            alt="3D Dental Aligner"
            className="w-full h-full object-contain mix-blend-screen opacity-50 translate-y-[20%] translate-x-[20%] -rotate-[8deg] contrast-125"
          />
        </div>

        {/* Footer */}
        <footer className="relative z-10 flex items-center justify-between text-white/60 text-sm font-medium">
          <span>© 2024 DentalSaaS Systems</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Support</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </footer>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          RIGHT PANEL — Login Form
         ═══════════════════════════════════════════════════════════ */}
      <section className="w-full lg:w-5/12 bg-slate-50 flex items-center justify-center p-6 sm:p-8 md:p-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[28rem] bg-white p-8 sm:p-10 rounded-[1.5rem] shadow-[0_25px_50px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(0,0,0,0.02)]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <svg className="w-7 h-7 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
            <span className="font-['Manrope',sans-serif] font-extrabold text-xl tracking-tight">
              DentalSaaS
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="font-['Manrope',sans-serif] font-bold text-[1.85rem] text-slate-900 mb-1.5">
              Welcome Back
            </h2>
            <p className="text-slate-500 font-medium text-[0.935rem]">
              Access your orthodontic care portal
            </p>
          </div>

          {/* ── Tab Switcher ─────────────────────────────────────── */}
          <div className="bg-slate-100/80 p-1.5 rounded-full flex mb-8 border border-slate-200/40">
            <button
              id="tab-password"
              onClick={() => switchTab('password')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-bold transition-all duration-200 ${
                activeTab === 'password'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Password Login
            </button>
            <button
              id="tab-otp"
              onClick={() => switchTab('otp')}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-bold transition-all duration-200 ${
                activeTab === 'otp'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              OTP Login
            </button>
          </div>

          {/* ── Error / Success Messages ─────────────────────────── */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200/60 rounded-2xl text-[0.82rem] font-semibold text-red-700 overflow-hidden"
              >
                {error}
              </motion.div>
            )}
            {successMessage && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="mb-6 p-4 bg-emerald-50 border border-emerald-200/60 rounded-2xl text-[0.82rem] font-semibold text-emerald-700 overflow-hidden"
              >
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════════════════════════════════════════════
              PASSWORD LOGIN FORM
             ═══════════════════════════════════════════════════════ */}
          {activeTab === 'password' && (
            <motion.form
              key="password-form"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handlePasswordLogin}
              className="space-y-5"
            >
              {/* Email input with floating label */}
              <div className="relative group">
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder=" "
                  className="
                    peer block w-full px-4 pt-6 pb-2 text-slate-900 
                    bg-slate-50/80 border-0 border-b-2 border-slate-200/60 
                    focus:border-blue-600 focus:ring-0 
                    rounded-t-xl transition-all duration-200
                    text-[0.95rem] font-medium
                  "
                />
                <label
                  htmlFor="login-email"
                  className="
                    absolute left-4 top-4 text-slate-400 pointer-events-none 
                    transition-all duration-200 font-medium text-[0.9rem]
                    peer-focus:translate-y-[-0.9rem] peer-focus:scale-[0.82] peer-focus:text-blue-600
                    peer-[:not(:placeholder-shown)]:translate-y-[-0.9rem] peer-[:not(:placeholder-shown)]:scale-[0.82]
                    origin-left
                  "
                >
                  Email or Phone Number
                </label>
              </div>

              {/* Password input with floating label + toggle */}
              <div className="relative group">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder=" "
                  className="
                    peer block w-full px-4 pt-6 pb-2 pr-12 text-slate-900 
                    bg-slate-50/80 border-0 border-b-2 border-slate-200/60 
                    focus:border-blue-600 focus:ring-0 
                    rounded-t-xl transition-all duration-200
                    text-[0.95rem] font-medium
                  "
                />
                <label
                  htmlFor="login-password"
                  className="
                    absolute left-4 top-4 text-slate-400 pointer-events-none 
                    transition-all duration-200 font-medium text-[0.9rem]
                    peer-focus:translate-y-[-0.9rem] peer-focus:scale-[0.82] peer-focus:text-blue-600
                    peer-[:not(:placeholder-shown)]:translate-y-[-0.9rem] peer-[:not(:placeholder-shown)]:scale-[0.82]
                    origin-left
                  "
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between py-1">
                <label className="flex items-center gap-2.5 cursor-pointer group/check">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="
                      w-[1.15rem] h-[1.15rem] rounded border-slate-300 
                      text-blue-600 focus:ring-blue-200 
                      transition-all cursor-pointer
                    "
                  />
                  <span className="text-sm font-medium text-slate-500 group-hover/check:text-slate-700">
                    Remember me
                  </span>
                </label>
                <a
                  href="#"
                  className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Forgot Password?
                </a>
              </div>

              {/* Submit */}
              <button
                id="btn-sign-in"
                type="submit"
                disabled={loading}
                className="
                  w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 
                  text-white font-bold rounded-xl 
                  shadow-lg shadow-blue-600/25 
                  hover:shadow-xl hover:shadow-blue-600/35 
                  transform hover:-translate-y-0.5 
                  transition-all duration-200 active:scale-[0.98]
                  flex items-center justify-center gap-2.5 group
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
                  text-[0.95rem]
                "
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Sign In to Portal
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </>
                )}
              </button>
            </motion.form>
          )}

          {/* ═══════════════════════════════════════════════════════
              OTP LOGIN FORM
             ═══════════════════════════════════════════════════════ */}
          {activeTab === 'otp' && (
            <motion.div
              key="otp-form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {otpStep === 'request' ? (
                <form onSubmit={handleOtpRequest} className="space-y-5">
                  {/* Email input */}
                  <div className="relative group">
                    <input
                      id="otp-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder=" "
                      className="
                        peer block w-full px-4 pt-6 pb-2 text-slate-900 
                        bg-slate-50/80 border-0 border-b-2 border-slate-200/60 
                        focus:border-blue-600 focus:ring-0 
                        rounded-t-xl transition-all duration-200
                        text-[0.95rem] font-medium
                      "
                    />
                    <label
                      htmlFor="otp-email"
                      className="
                        absolute left-4 top-4 text-slate-400 pointer-events-none 
                        transition-all duration-200 font-medium text-[0.9rem]
                        peer-focus:translate-y-[-0.9rem] peer-focus:scale-[0.82] peer-focus:text-blue-600
                        peer-[:not(:placeholder-shown)]:translate-y-[-0.9rem] peer-[:not(:placeholder-shown)]:scale-[0.82]
                        origin-left
                      "
                    >
                      Email Address
                    </label>
                  </div>

                  <button
                    id="btn-send-otp"
                    type="submit"
                    disabled={loading}
                    className="
                      w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 
                      text-white font-bold rounded-xl 
                      shadow-lg shadow-blue-600/25 
                      hover:shadow-xl hover:shadow-blue-600/35 
                      transform hover:-translate-y-0.5 
                      transition-all duration-200 active:scale-[0.98]
                      flex items-center justify-center gap-2.5
                      disabled:opacity-60 disabled:cursor-not-allowed
                      text-[0.95rem]
                    "
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send OTP Code
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleOtpVerify} className="space-y-5">
                  <p className="text-sm font-medium text-slate-500 text-center mb-2">
                    Enter the 6-digit code sent to{' '}
                    <span className="font-bold text-slate-800">{email}</span>
                  </p>

                  {/* OTP input */}
                  <input
                    ref={otpInputRef}
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    className="
                      w-full px-4 py-4 bg-slate-50/80 
                      border-2 border-slate-200/60 
                      rounded-xl text-center text-2xl font-black 
                      text-slate-800 tracking-[0.5em] 
                      placeholder:text-slate-300 
                      outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 
                      transition-all
                    "
                  />

                  <button
                    id="btn-verify-otp"
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="
                      w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 
                      text-white font-bold rounded-xl 
                      shadow-lg shadow-blue-600/25 
                      hover:shadow-xl hover:shadow-blue-600/35 
                      transform hover:-translate-y-0.5 
                      transition-all duration-200 active:scale-[0.98]
                      flex items-center justify-center gap-2.5
                      disabled:opacity-60 disabled:cursor-not-allowed
                      text-[0.95rem]
                    "
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setOtpStep('request'); setOtp(''); setError(''); }}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors py-1"
                  >
                    ← Change email
                  </button>
                </form>
              )}
            </motion.div>
          )}

          {/* ── Magic Link CTA ───────────────────────────────────── */}
          {activeTab === 'password' && (
            <div className="mt-6">
              <button
                id="btn-magic-link"
                onClick={handleRequestMagicLink}
                disabled={loading}
                className="
                  w-full py-3 text-sm font-bold text-slate-500 
                  hover:text-blue-600 transition-colors
                  disabled:opacity-50
                "
              >
                Or sign in with a Magic Link →
              </button>
            </div>
          )}

          {/* ── Request Access / Bottom CTA ───────────────────────── */}
          <div className="mt-8 flex flex-col items-center gap-4 border-t border-slate-100 pt-7">
            <p className="text-slate-500 text-sm">
              Don't have an account yet?
            </p>
            <button
              id="btn-request-access"
              className="
                w-full py-3 px-6 border-2 border-slate-200/60 
                text-slate-700 font-bold rounded-xl 
                hover:bg-slate-50 hover:border-blue-400/40 
                transition-all text-[0.9rem]
              "
            >
              Request Access
            </button>
          </div>

          {/* ── Security Badge ────────────────────────────────────── */}
          <div className="mt-6 flex items-center justify-center gap-3 pt-5 border-t border-slate-50">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
              <ShieldCheck className="w-[1.1rem] h-[1.1rem]" />
            </div>
            <p className="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest leading-tight text-left">
              Your connection is encrypted
              <br />and HIPAA-compliant.
            </p>
          </div>
        </motion.div>

        {/* Mobile footer */}
        <footer className="lg:hidden fixed bottom-4 left-0 w-full text-center text-slate-400 text-xs font-medium">
          © 2024 DentalSaaS Systems • Clinical Precision
        </footer>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP BOTTOM BAR
         ═══════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex fixed bottom-0 w-full justify-between items-center px-12 py-3.5 bg-white/80 backdrop-blur-sm text-slate-400 text-xs tracking-wide border-t border-slate-100/80">
        <p>© 2024 DentalSaaS Systems. Clinical Precision.</p>
        <div className="flex gap-8">
          <a href="#" className="hover:text-blue-500 transition-colors">HIPAA Compliant</a>
          <a href="#" className="hover:text-blue-500 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-blue-500 transition-colors">Security Standards</a>
          <a href="#" className="hover:text-blue-500 transition-colors">Support</a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
