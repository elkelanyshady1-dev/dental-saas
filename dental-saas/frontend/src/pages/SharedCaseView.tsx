import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock, MessageSquare, Send, Mic, MicOff, User, ShieldAlert,
  Camera, Play, Pause, Download, Eye, Users, Star, Stethoscope,
  FlaskConical, UserCheck, ChevronDown, Printer, FileDown, Wifi, WifiOff
} from 'lucide-react';
import {
  getSharedCase, getSharedComments, addSharedComment, joinSharedCase,
  type SharedCaseData, type SharedComment, type Collaborator
} from '../org/modules/patients/components/orthodontic-chart/api/sharedCase.api';
import { io, type Socket } from 'socket.io-client';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   SharedCaseView (v2.0) — Public Collaboration Viewer
   
   Route: /share/:token
   Auth: NONE — token-based access
   
   Features:
   - Full case or selected records view
   - Permission-aware (download, analysis)
   - Role-based comments (doctor/lab/patient)
   - Voice notes
   - Collaborator join + active viewers
   - Doctor Notes highlighting
   ═══════════════════════════════════════════════════════════════ */

const ROLE_ICONS: Record<string, React.ReactNode> = {
  doctor: <Stethoscope className="w-3 h-3" />,
  lab: <FlaskConical className="w-3 h-3" />,
  patient: <UserCheck className="w-3 h-3" />,
};
const ROLE_COLORS: Record<string, string> = {
  doctor: 'bg-blue-100 text-blue-700 border-blue-200',
  lab: 'bg-amber-100 text-amber-700 border-amber-200',
  patient: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};
const ROLE_GRADIENT: Record<string, string> = {
  doctor: 'from-blue-500 to-indigo-600',
  lab: 'from-amber-500 to-orange-600',
  patient: 'from-emerald-500 to-teal-600',
};

const SharedCaseView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedCaseData | null>(null);
  const [comments, setComments] = useState<SharedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Join state
  const [hasJoined, setHasJoined] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');

  // Comment form
  const [authorName, setAuthorName] = useState('');
  const [commentRole, setCommentRole] = useState<'doctor' | 'lab' | 'patient'>('doctor');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Audio playback
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Filter
  const [commentFilter, setCommentFilter] = useState<'all' | 'doctor' | 'lab' | 'patient'>('all');

  // Socket.IO real-time
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;
    loadSharedCase();
  }, [token]);

  const loadSharedCase = async () => {
    try {
      setLoading(true);
      const result = await getSharedCase(token!);
      setData(result.data);

      if (result.data.permissions.canComment) {
        const commentsResult = await getSharedComments(token!);
        setComments(commentsResult.data || []);
      }
    } catch (err: any) {
      if (err.response?.status === 410) setExpired(true);
      else setError(err.response?.data?.message || 'Failed to load shared case');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinName.trim()) return;
    try {
      await joinSharedCase(token!, { name: joinName.trim(), email: joinEmail.trim() || undefined });
      setAuthorName(joinName.trim());
      setHasJoined(true);
      // Reload to get updated collaborator list
      const result = await getSharedCase(token!);
      setData(result.data);

      // Connect Socket.IO after joining
      connectSocket(joinName.trim(), 'doctor');
    } catch (err) {
      console.error('Failed to join:', err);
    }
  };

  // ─── Socket.IO Connection ─────────────────────────────────
  const connectSocket = useCallback((name: string, role: string) => {
    if (socketRef.current?.connected) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const baseUrl = apiUrl.replace(/\/api\/v1$/, '');

    const socket = io(`${baseUrl}/collab`, {
      auth: {
        shareToken: token,
        name,
        role,
      },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('[Collab] Socket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Collab] Socket disconnected');
    });

    // Real-time comment broadcast
    socket.on('comment:added', (comment: any) => {
      if (comment._fromServer) {
        // Server-authoritative broadcast — add if not already present
        setComments(prev => {
          if (prev.some(c => c.id === comment.id)) return prev;
          return [comment, ...prev];
        });
      }
    });

    // Typing indicators
    socket.on('typing:indicator', ({ name: typerName, isTyping }: { name: string; isTyping: boolean }) => {
      setTypingUsers(prev =>
        isTyping
          ? [...new Set([...prev, typerName])]
          : prev.filter(n => n !== typerName)
      );
    });

    // Presence
    socket.on('collaborator:joined', ({ name: newName, role: newRole }: any) => {
      setData(prev => {
        if (!prev) return prev;
        const existing = prev.collaborators.find(c => c.name === newName);
        if (existing) return prev;
        return {
          ...prev,
          collaborators: [...prev.collaborators, { name: newName, role: newRole, joinedAt: new Date().toISOString() }],
        };
      });
    });

    socket.on('collaborator:left', ({ name: leftName }: any) => {
      // Don't remove from list — just log
      console.log(`[Collab] ${leftName} left`);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleSubmitComment = async () => {
    if (!authorName.trim() || (!commentText.trim() && !audioUrl)) return;
    setSubmitting(true);
    try {
      const result = await addSharedComment(token!, {
        authorName: authorName.trim(),
        role: commentRole,
        text: commentText.trim() || undefined,
        audioUrl: audioUrl || undefined,
      });
      // Add locally immediately (server broadcast will dedupe)
      setComments(prev => {
        if (prev.some(c => c.id === result.data.id)) return prev;
        return [result.data, ...prev];
      });
      setCommentText('');
      setAudioUrl(null);
      // Stop typing
      socketRef.current?.emit('typing:stop');
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Typing broadcast
  const handleCommentChange = (text: string) => {
    setCommentText(text);
    socketRef.current?.emit('typing:start');
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('typing:stop');
    }, 2000);
  };

  // Print handler
  const handlePrint = () => window.print();

  // PDF Export (client-side)
  const handleExportPdf = async () => {
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const element = document.getElementById('shared-case-content');
      if (!element) return;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`case-export-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { console.error('Microphone access denied:', err); }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };

  const toggleAudioPlayback = (commentId: string, url: string) => {
    if (playingAudioId === commentId) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      audio.play();
      audio.onended = () => setPlayingAudioId(null);
      setPlayingAudioId(commentId);
    }
  };

  const filteredComments = commentFilter === 'all'
    ? comments
    : comments.filter(c => c.role === commentFilter);

  const doctorNotes = comments.filter(c => c.role === 'doctor');

  // ─── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading shared records...</p>
        </div>
      </div>
    );
  }

  // ─── Expired ─────────────────────────────────────────────────
  if (expired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50 to-orange-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl shadow-amber-200">
            <Clock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Link Expired</h1>
          <p className="text-sm text-slate-500 leading-relaxed">This shared link is no longer valid. Please ask the clinic to generate a new link.</p>
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-rose-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-xl shadow-red-200">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Not Found</h1>
          <p className="text-sm text-slate-500 leading-relaxed">{error || 'This share link could not be found.'}</p>
        </div>
      </div>
    );
  }

  // ─── Join Gate ───────────────────────────────────────────────
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-200">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Join Collaboration</h1>
            <p className="text-xs text-slate-500">Enter your details to view and collaborate</p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your name (e.g. Dr. Ahmed)"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
            />
            <input
              type="email"
              value={joinEmail}
              onChange={(e) => setJoinEmail(e.target.value)}
              placeholder="Your email (e.g. dr.ahmed@clinic.com)"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
            />
          </div>

          {/* Active collaborators */}
          {data.collaborators.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Active Viewers</p>
              <div className="flex flex-wrap gap-1.5">
                {data.collaborators.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-violet-50 border-violet-200 text-violet-700">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={!joinName.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-200 disabled:opacity-40 active:scale-[0.98]"
          >
            Join & View Records
          </button>
        </div>
      </div>
    );
  }

  // ─── Main View ───────────────────────────────────────────────
  const recordSets = data.workflowData?.recordSets || [];
  const firstSet = recordSets[0];
  const photos: any[] = (firstSet?.records?.length > 0 ? firstSet.records : firstSet?.photos) || [];
  const timeLeft = Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{data.patient.name}</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                {data.caseType} · {data.malocclusionClass?.replace(/_/g, ' ')} · {data.type === 'records' ? '📸 Selected Records' : '📋 Full Case'}
                {data.snapshotVersion && (
                  <span className="ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-[8px]">
                    v{data.snapshotVersion}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold ${isConnected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'Live' : 'Offline'}
            </div>
            {/* Active Viewers */}
            <div className="flex -space-x-2 print:hidden">
              {data.collaborators.slice(0, 5).map((c, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${ROLE_GRADIENT[c.role]} flex items-center justify-center border-2 border-white text-[10px] font-bold text-white shadow-sm`}
                  title={`${c.name} (${c.role})`}
                >
                  {c.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {data.collaborators.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white text-[10px] font-bold text-slate-600">
                  +{data.collaborators.length - 5}
                </div>
              )}
            </div>
            {/* Print button */}
            <button
              onClick={handlePrint}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all print:hidden"
              title="Print"
            >
              <Printer className="w-4 h-4 text-slate-600" />
            </button>
            {/* PDF Export */}
            {data.permissions.canDownload && (
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-blue-200 print:hidden"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export PDF
              </button>
            )}
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-bold text-amber-700">
                {timeLeft > 24 ? `${Math.ceil(timeLeft / 24)}d left` : `${timeLeft}h left`}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8" id="shared-case-content">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ─── Left: Photos ─────────────────────────────── */}
          <div className="flex-1 space-y-6">
            {photos.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Clinical Photos</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {photos.filter((p: any) => p.url).map((photo: any) => (
                    <div key={photo.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-lg transition-shadow group">
                      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                        <img
                          src={resolveFileUrl(photo.url)}
                          alt={photo.label}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                          style={{ transform: `rotate(${photo.rotation || 0}deg) scaleX(${photo.flipH ? -1 : 1}) scaleY(${photo.flipV ? -1 : 1})` }}
                        />
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{photo.label}</span>
                        {data.permissions.canDownload && (
                          <a href={photo.url} download={photo.label} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                            <Download className="w-3 h-3 text-slate-400" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Doctor Notes Section */}
            {doctorNotes.length > 0 && (
              <section className="bg-blue-50 rounded-2xl border border-blue-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest">Doctor Notes</h3>
                  <span className="px-2 py-0.5 bg-blue-200 rounded-full text-[10px] font-bold text-blue-700">{doctorNotes.length}</span>
                </div>
                <div className="space-y-2">
                  {doctorNotes.slice(0, 5).map(note => (
                    <div key={note.id} className="bg-white rounded-xl p-3 border border-blue-100">
                      <div className="flex items-center gap-2 mb-1">
                        <Stethoscope className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-700">{note.authorName}</span>
                        <span className="text-[9px] text-slate-400">{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                      {note.text && <p className="text-xs text-slate-700 leading-relaxed">{note.text}</p>}
                      {note.audioUrl && (
                        <button
                          onClick={() => toggleAudioPlayback(note.id, note.audioUrl!)}
                          className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          {playingAudioId === note.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          Voice Note
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ─── Right: Comments Sidebar ──────────────────── */}
          {data.permissions.canComment && (
            <div className="lg:w-[380px] shrink-0 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Comments</h2>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500">{comments.length}</span>
                  </div>
                  {/* Filter */}
                  <div className="flex gap-1">
                    {(['all', 'doctor', 'lab', 'patient'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setCommentFilter(f)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${
                          commentFilter === f ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form */}
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 space-y-3">
                  <div className="flex gap-2">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ROLE_GRADIENT[commentRole]} flex items-center justify-center shrink-0`}>
                      <span className="text-xs font-bold text-white">{authorName.charAt(0).toUpperCase() || '?'}</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          placeholder="Your name"
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-all"
                        />
                        <select
                          value={commentRole}
                          onChange={(e) => setCommentRole(e.target.value as any)}
                          className="px-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 outline-none focus:border-blue-400 uppercase transition-all"
                        >
                          <option value="doctor">Doctor</option>
                          <option value="lab">Lab</option>
                          <option value="patient">Patient</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <textarea
                    value={commentText}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    placeholder="Write a comment..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-all resize-none"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-2 rounded-lg transition-all ${
                          isRecording
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200'
                            : 'bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300'
                        }`}
                      >
                        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                      {audioUrl && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                          <span className="text-[9px] font-bold text-blue-600 uppercase">Voice Attached</span>
                          <button onClick={() => setAudioUrl(null)} className="text-blue-400 hover:text-red-500 text-[10px]">✕</button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitComment}
                      disabled={submitting || !authorName.trim() || (!commentText.trim() && !audioUrl)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-200 disabled:opacity-40 active:scale-95"
                    >
                      <Send className="w-3 h-3" />
                      {submitting ? '...' : 'Send'}
                    </button>
                  </div>
                </div>

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="px-4 py-2 bg-blue-50/50 border-b border-slate-100">
                    <p className="text-[10px] text-blue-500 font-medium italic animate-pulse">
                      {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </p>
                  </div>
                )}

                {/* Comments List */}
                <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                  {filteredComments.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No comments yet</p>
                    </div>
                  ) : (
                    filteredComments.map(comment => (
                      <div key={comment.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${ROLE_GRADIENT[comment.role]} flex items-center justify-center shrink-0`}>
                            <span className="text-[10px] font-bold text-white">{comment.authorName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">{comment.authorName}</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border capitalize ${ROLE_COLORS[comment.role]}`}>
                                {ROLE_ICONS[comment.role]}
                                {comment.role}
                              </span>
                              <span className="text-[9px] text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span>
                            </div>
                            {comment.text && <p className="text-xs text-slate-600 leading-relaxed">{comment.text}</p>}
                            {comment.audioUrl && (
                              <button
                                onClick={() => toggleAudioPlayback(comment.id, comment.audioUrl!)}
                                className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                              >
                                {playingAudioId === comment.id ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                                Voice Note
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="py-8 text-center mt-8">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Shared via DentalSaaS · Secure Collaboration Link
          </p>
        </footer>
      </main>
    </div>
  );
};

export default SharedCaseView;
