import React, { useState } from 'react';
import { 
  Share2, 
  MessageSquare, 
  Eye, 
  Clock, 
  ExternalLink, 
  MoreVertical, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Send,
  Mic,
  User,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SharedLink, Comment } from '../../../types';

interface CollaborationHubTabProps {
  patientId: string;
  onOpenLink?: (link: SharedLink) => void;
}

const CollaborationHubTab: React.FC<CollaborationHubTabProps> = ({ patientId, onOpenLink }) => {
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  // Mock data for shared links
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([
    {
      id: 'link-1',
      patientId,
      title: 'Initial Records V1 - Pre-Treatment',
      url: 'https://ortho-hub.app/share/x4eywlvz',
      createdAt: '2024-03-15T10:00:00Z',
      expiresAt: '2024-04-15T10:00:00Z',
      viewCount: 24,
      type: 'RECORDS',
      status: 'ACTIVE',
      comments: [
        {
          id: 'c1',
          author: 'Dr. Ahmed',
          role: 'DOCTOR',
          text: 'Please review the alignment of the upper left canine. We might need to adjust the bracket position in the next visit.',
          timestamp: '2 hours ago'
        },
        {
          id: 'c2',
          author: 'OrthoLab Cairo',
          role: 'LAB',
          text: 'STL models received. We are proceeding with the aligner fabrication. Expected delivery: 25th March.',
          timestamp: '5 hours ago'
        }
      ]
    },
    {
      id: 'link-2',
      patientId,
      title: 'Treatment Plan Proposal - Phase 1',
      url: 'https://ortho-hub.app/share/y9bz2k1m',
      createdAt: '2024-03-10T14:30:00Z',
      viewCount: 12,
      type: 'TREATMENT_PLAN',
      status: 'ACTIVE',
      comments: [
        {
          id: 'c3',
          author: 'Patient (Parent)',
          role: 'PATIENT',
          text: 'We agree with the extraction plan. When can we start?',
          timestamp: '1 day ago'
        }
      ]
    },
    {
      id: 'link-3',
      patientId,
      title: 'Mid-Treatment Progress Photos',
      url: 'https://ortho-hub.app/share/z5p8q3n4',
      createdAt: '2024-02-20T09:15:00Z',
      expiresAt: '2024-03-20T09:15:00Z',
      viewCount: 45,
      type: 'CASE_PROGRESS',
      status: 'EXPIRED',
      comments: []
    }
  ]);

  const selectedLink = sharedLinks.find(l => l.id === selectedLinkId);

  const handleAddComment = () => {
    if (!newComment.trim() || !selectedLinkId) return;
    
    const comment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      author: 'Dr. Shady',
      role: 'DOCTOR',
      text: newComment,
      timestamp: 'Just now'
    };

    setSharedLinks(prev => prev.map(link => 
      link.id === selectedLinkId 
        ? { ...link, comments: [comment, ...link.comments] }
        : link
    ));
    setNewComment("");
  };

  const getStatusColor = (status: SharedLink['status']) => {
    switch (status) {
      case 'ACTIVE': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'EXPIRED': return 'text-slate-400 bg-slate-50 border-slate-100';
      case 'REVOKED': return 'text-rose-600 bg-rose-50 border-rose-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  const getTypeIcon = (type: SharedLink['type']) => {
    switch (type) {
      case 'RECORDS': return <Share2 className="w-4 h-4" />;
      case 'TREATMENT_PLAN': return <ShieldCheck className="w-4 h-4" />;
      case 'CASE_PROGRESS': return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-280px)]">
      {/* Left Panel: Shared Links List */}
      <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-600" />
              Collaboration Hub
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Manage shared links and external collaboration</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100">
            <Plus className="w-4 h-4" />
            CREATE NEW LINK
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="divide-y divide-slate-100">
            {sharedLinks.map((link) => (
              <div 
                key={link.id}
                onClick={() => setSelectedLinkId(link.id)}
                className={`group p-6 hover:bg-slate-50 transition-all cursor-pointer relative ${selectedLinkId === link.id ? 'bg-blue-50/30' : ''}`}
              >
                {selectedLinkId === link.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                )}
                
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      link.type === 'RECORDS' ? 'bg-blue-100 text-blue-600' : 
                      link.type === 'TREATMENT_PLAN' ? 'bg-purple-100 text-purple-600' : 
                      'bg-emerald-100 text-emerald-600'
                    }`}>
                      {getTypeIcon(link.type)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 leading-tight mb-1">{link.title}</h4>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(link.createdAt).toLocaleDateString()}
                        </span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusColor(link.status)}`}>
                          {link.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button className="p-2 text-slate-300 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500">{link.viewCount} Views</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500">{link.comments.length} Comments</span>
                      </div>
                    </div>
                    
                    {/* Commenter Tags */}
                    {link.comments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(link.comments.map(c => c.author))).map((author, idx) => (
                          <span 
                            key={idx} 
                            className="text-[8px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200 uppercase tracking-wider"
                          >
                            {author}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {link.url.split('/').pop()}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLink?.(link);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: Link Details & Comments */}
      <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedLink ? (
            <motion.div 
              key={selectedLink.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Link Details</span>
                  <button onClick={() => setSelectedLinkId(null)} className="text-slate-400 hover:text-slate-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-lg font-black text-slate-800 leading-tight mb-2">{selectedLink.title}</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-500">
                    <Clock className="w-3 h-3" />
                    Expires: {selectedLink.expiresAt ? new Date(selectedLink.expiresAt).toLocaleDateString() : 'Never'}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-500">
                    <Eye className="w-3 h-3" />
                    {selectedLink.viewCount} total views
                  </div>
                </div>

                {/* Participants Tags */}
                {selectedLink.comments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Participants</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(new Set(selectedLink.comments.map(c => c.author))).map((author, idx) => (
                        <span 
                          key={idx} 
                          className="text-[9px] font-black px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100 uppercase tracking-wider"
                        >
                          {author}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collaboration Thread</h4>
                </div>

                {selectedLink.comments.length > 0 ? (
                  selectedLink.comments.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                            c.role === 'DOCTOR' ? 'bg-blue-600' : c.role === 'LAB' ? 'bg-purple-600' : 'bg-emerald-600'
                          }`}>
                            {c.author[0]}
                          </div>
                          <span className="text-[10px] font-bold text-slate-700">{c.author}</span>
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-wider px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100">{c.role}</span>
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{c.timestamp}</span>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <p className="text-[11px] font-medium text-slate-600 leading-relaxed">{c.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                      <MessageSquare className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No comments yet</p>
                    <p className="text-[10px] text-slate-400 mt-2">Start the conversation by adding a comment below</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
                  <textarea 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="w-full bg-transparent border-none p-0 text-xs font-medium placeholder:text-slate-300 focus:ring-0 resize-none h-20"
                  />
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                    <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleAddComment}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Post Comment
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <Share2 className="w-10 h-10 text-blue-200" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Select a Shared Link</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose a link from the list to view its activity, comments, and collaboration details.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CollaborationHubTab;
