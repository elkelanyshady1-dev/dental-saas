import React, { useState } from 'react';
import { X, Link as LinkIcon, Clock, Check, Copy, Facebook } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MagicLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  onCreate: (expiryHours: number) => void;
  generatedLink?: string;
}

export const MagicLinkDialog: React.FC<MagicLinkDialogProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  onCreate,
  generatedLink
}) => {
  const [expiry, setExpiry] = useState<number>(24);
  const [copied, setCopied] = useState(false);

  const expiryOptions = [
    { label: '24 Hours', value: 24 },
    { label: '7 Days', value: 168 },
    { label: '30 Days', value: 720 },
    { label: 'Never', value: 0 }
  ];

  const handleCopy = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Create Magic Link</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient Portal Access</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          {!generatedLink ? (
            <div className="space-y-6">
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <p className="text-xs font-medium text-blue-600 leading-relaxed">
                  Generating a magic link for <span className="font-black">{patientName}</span>. 
                  This link allows direct login to the patient portal.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Link Expiry
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExpiry(option.value)}
                      className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                        expiry === option.value
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50/30'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <Facebook className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                  Patient can sync their Facebook profile picture upon login
                </p>
              </div>

              <button
                onClick={() => onCreate(expiry)}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2"
              >
                Generate Link
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 text-center">
                <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-emerald-100">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest mb-1">Link Generated!</h4>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  Expires in {expiry === 0 ? 'Never' : `${expiry} hours`}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Magic Link URL</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-600 truncate">
                    {generatedLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`p-3 rounded-xl transition-all border ${
                      copied 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'bg-white border-slate-200 text-slate-400 hover:border-blue-600 hover:text-blue-600'
                    }`}
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-100"
                >
                  Done
                </button>
                <button
                  onClick={() => onCreate(expiry)}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors py-2"
                >
                  Generate New Link
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
