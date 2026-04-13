import React, { useState } from 'react';
import { Facebook, Link as LinkIcon, ShieldCheck, ArrowRight, Activity } from 'lucide-react';
import { motion } from 'motion/react';

interface PortalLoginProps {
  token: string;
  patientId: string;
  onLogin: (profilePic?: string) => void;
}

export const PortalLogin: React.FC<PortalLoginProps> = ({ token, patientId, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleFacebookLogin = () => {
    setIsLoading(true);
    // Simulate Facebook OAuth
    setTimeout(() => {
      const facebookProfilePic = "https://graph.facebook.com/12345/picture?type=large&access_token=fake";
      // Using a picsum image to simulate a real profile pic
      const mockProfilePic = `https://picsum.photos/seed/fb-user-${patientId}/200/200`;
      onLogin(mockProfilePic);
      setIsLoading(false);
    }, 1500);
  };

  const handleDirectLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      onLogin();
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden"
      >
        <div className="p-10 text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-blue-100 rotate-3">
            <Activity className="w-10 h-10" />
          </div>
          
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-3 uppercase">Patient Portal</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-10">Secure Magic Link Access</p>

          <div className="space-y-4">
            <button
              onClick={handleFacebookLogin}
              disabled={isLoading}
              className="w-full py-5 bg-[#1877F2] text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-[#166fe5] transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-4 group disabled:opacity-70"
            >
              <Facebook className="w-6 h-6 fill-current" />
              <span>Login with Facebook</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>

            <div className="relative py-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.2em] text-slate-300 bg-white px-4">
                Or continue with
              </div>
            </div>

            <button
              onClick={handleDirectLogin}
              disabled={isLoading}
              className="w-full py-5 bg-white text-slate-700 border-2 border-slate-100 rounded-2xl text-sm font-black uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center gap-4 group disabled:opacity-70"
            >
              <LinkIcon className="w-5 h-5" />
              <span>Direct Link Access</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-50 flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight text-left">
              Your connection is encrypted<br/>and secure.
            </p>
          </div>
        </div>
      </motion.div>

      <p className="mt-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
        Powered by OrthoFlow Systems
      </p>

      {isLoading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};
