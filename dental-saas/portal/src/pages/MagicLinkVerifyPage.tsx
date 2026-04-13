/**
 * MagicLinkVerifyPage.tsx
 * Patient Portal — Magic Link Token Verification Landing
 *
 * URL format: /magic-link?token=XYZ
 * Extracts token from URL → verifies with backend → redirects to dashboard
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';

const MagicLinkVerifyPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithMagicLink, isAuthenticated } = usePortalAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMessage('No magic link token found in URL.');
      return;
    }

    const verify = async () => {
      try {
        await loginWithMagicLink(token);
        setStatus('success');
        setTimeout(() => navigate('/', { replace: true }), 1200);
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(
          err.response?.data?.error?.message || 'Magic link is invalid or expired.'
        );
      }
    };

    verify();
  }, [searchParams, loginWithMagicLink, navigate, isAuthenticated]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4 font-[Inter,system-ui,sans-serif]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 text-center"
      >
        <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-blue-200">
          <Activity className="w-8 h-8" />
        </div>

        {status === 'verifying' && (
          <>
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
              Verifying Link
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Please wait while we verify your magic link...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-emerald-200">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-emerald-800 uppercase tracking-tight mb-2">
              Verified!
            </h2>
            <p className="text-xs font-medium text-emerald-600">
              Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-rose-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-rose-200">
              <XCircle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-rose-800 uppercase tracking-tight mb-2">
              Verification Failed
            </h2>
            <p className="text-xs font-medium text-rose-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
            >
              Go to Login
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default MagicLinkVerifyPage;
