import React, { useState, useRef } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Loader2,
} from 'lucide-react';
import { caseApi as orthodonticsApi } from '../../api/case.api';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   AudioRecorder — Voice note recording, upload, playback & deletion.
   Phase 6: Uploads audio to server for persistent storage.
   Audio persists across page refreshes (stored via storageService).
   ═══════════════════════════════════════════════════════════════ */

export interface AudioRecorderProps {
  audioUrl: string | null;
  onAudioChange: (url: string | null) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
  audioUrl,
  onAudioChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Upload to server instead of creating a blob URL
        setIsUploading(true);
        try {
          const res = await orthodonticsApi.uploadAudio(audioBlob, 'voice-note.webm');
          const serverUrl = res.data?.data?.url || res.data?.url;

          if (serverUrl) {
            onAudioChange(serverUrl);
          } else {
            console.error('[AudioRecorder] No URL in upload response:', res.data);
            setError('Upload succeeded but no URL returned');
            // Fallback to blob URL so the user doesn't lose the recording
            onAudioChange(URL.createObjectURL(audioBlob));
          }
        } catch (uploadErr: any) {
          console.error('[AudioRecorder] Upload failed:', uploadErr);
          const msg = uploadErr?.response?.data?.error?.message || uploadErr.message || 'Upload failed';
          setError(msg);
          // Fallback to blob URL so the user doesn't lose the recording
          onAudioChange(URL.createObjectURL(audioBlob));
        } finally {
          setIsUploading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop all tracks to release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const deleteAudio = () => {
    onAudioChange(null);
    setIsPlaying(false);
    setError(null);
  };

  return (
    <div className="flex items-center gap-2">
      {isUploading ? (
        <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-[10px] font-bold uppercase text-blue-600">Uploading…</span>
        </div>
      ) : audioUrl ? (
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
          <button 
            onClick={togglePlayback}
            className="p-1.5 hover:bg-white rounded-lg text-blue-600 transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="w-24 h-1 bg-slate-300 rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-blue-500 w-1/3" />
          </div>
          <button 
            onClick={deleteAudio}
            className="p-1.5 hover:bg-white rounded-lg text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <audio 
            ref={audioRef} 
            src={resolveFileUrl(audioUrl)} 
            onEnded={() => setIsPlaying(false)}
            className="hidden" 
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              isRecording 
              ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' 
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="text-[10px] font-bold uppercase">{isRecording ? 'Stop' : 'Voice Note'}</span>
          </button>
          {error && (
            <span className="text-[9px] text-red-500 font-medium">{error}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;

