import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  FlipHorizontal, 
  FlipVertical, 
  Crop, 
  Trash2, 
  Plus, 
  Maximize2, 
  X, 
  Save, 
  Activity,
  Image as ImageIcon,
  Upload,
  User,
  Calendar,
  FileText,
  ChevronRight,
  ChevronLeft,
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Box,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Target,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Cropper from 'react-easy-crop';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { PhotoRecord, RecordSet } from '../../../types';
import { DentalNotationChart } from './DentalNotationChart';
import { ProblemListTab } from './ProblemListTab';
import { TreatmentPlanTab } from './TreatmentPlanTab';

const STLModel = ({ url }: { url: string }) => {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color="#ffffff" 
        roughness={0.1} 
        metalness={0.9} 
        emissive="#111111"
        envMapIntensity={2}
      />
    </mesh>
  );
};

const CEPH_MEASUREMENTS = [
  { id: 'sna', label: 'SNA', norm: 83, sd: 3, unit: '°' },
  { id: 'snb', label: 'SNB', norm: 80, sd: 3, unit: '°' },
  { id: 'anb', label: 'ANB', norm: 2, sd: 2, unit: '°' },
  { id: 'wits', label: 'Wits appraisal', norm: 0.3, sd: 2.6, unit: ' mm' },
  { id: 'mmp', label: 'MMP', norm: 25, sd: 3, unit: '°' },
  { id: 'maxsn', label: 'Max/SN', norm: 9.8, sd: 3, unit: '°' },
  { id: 'mandbsn', label: 'Mandb/SN', norm: 32, sd: 5, unit: '°' },
  { id: 'u1pp', label: 'U1/PP', norm: 112, sd: 5, unit: '°' },
  { id: 'l1mandb', label: 'L1/Mandb', norm: 98, sd: 6, unit: '°' },
  { id: 'u1l1', label: 'U1/L1', norm: 128, sd: 5, unit: '°' },
  { id: 'yaxis', label: 'Y axis angle', norm: 59, sd: 2, unit: '°' },
  { id: 'lfhtfh', label: 'LFH/TFH', norm: 55, sd: 2, unit: '%' },
  { id: 'nasolabial', label: 'Nasolabial angle', norm: 102, sd: 8, unit: '°' },
];

const CVMShapeSelector = ({ 
  data, 
  onChange 
}: { 
  data: Record<string, string>, 
  onChange: (key: string, value: string) => void 
}) => {
  const cv2 = data.cv2Shape || '';
  const cv3 = data.cv3Shape || '';
  const cv4 = data.cv4Shape || '';

  useEffect(() => {
    if (!cv2 && !cv3 && !cv4) return;

    let stage = '';
    if (cv2 === 'flat' && cv3 === 'wedge' && cv4 === 'wedge') stage = 'CS1';
    else if (cv2 === 'concave' && cv3 === 'wedge' && cv4 === 'wedge') stage = 'CS2';
    else if (cv2 === 'concave' && (cv3 === 'concave_horizontal' || cv3 === 'trapezoidal') && (cv4 === 'trapezoidal' || cv4 === 'wedge')) stage = 'CS3';
    else if (cv2 === 'concave' && cv3 === 'concave_horizontal' && cv4 === 'concave_horizontal') stage = 'CS4';
    else if (cv2 === 'concave' && cv3 === 'concave_square' && cv4 === 'concave_square') stage = 'CS5';
    else if (cv2 === 'concave' && cv3 === 'concave_vertical' && cv4 === 'concave_vertical') stage = 'CS6';
    
    if (stage && stage !== data.cvmStage) {
      onChange('cvmStage', stage);
    }
  }, [cv2, cv3, cv4]);

  const handleReset = () => {
    onChange('cv2Shape', '');
    onChange('cv3Shape', '');
    onChange('cv4Shape', '');
    onChange('cvmStage', '');
  };

  const shapes = {
    cv2: [
      { id: 'flat', label: 'Flat', path: "M 6 4 L 24 4 L 24 24 L 6 24 Z" },
      { id: 'concave', label: 'Concave', path: "M 6 4 L 24 4 L 24 24 Q 15 18 6 24 Z" }
    ],
    cv3: [
      { id: 'wedge', label: 'Wedge', path: "M 12 6 L 24 6 L 24 24 L 6 24 Z" },
      { id: 'trapezoidal', label: 'Trap.', path: "M 6 10 L 24 10 L 24 24 L 6 24 Z" },
      { id: 'concave_horizontal', label: 'C-Hor.', path: "M 6 10 L 24 10 L 24 24 Q 15 18 6 24 Z" },
      { id: 'concave_square', label: 'Square', path: "M 6 6 L 24 6 L 24 22 Q 15 16 6 22 Z" },
      { id: 'concave_vertical', label: 'Vert.', path: "M 10 4 L 20 4 L 20 26 Q 15 20 10 26 Z" }
    ],
    cv4: [
      { id: 'wedge', label: 'Wedge', path: "M 12 6 L 24 6 L 24 24 L 6 24 Z" },
      { id: 'trapezoidal', label: 'Trap.', path: "M 6 10 L 24 10 L 24 24 L 6 24 Z" },
      { id: 'concave_horizontal', label: 'C-Hor.', path: "M 6 10 L 24 10 L 24 24 Q 15 18 6 24 Z" },
      { id: 'concave_square', label: 'Square', path: "M 6 6 L 24 6 L 24 22 Q 15 16 6 22 Z" },
      { id: 'concave_vertical', label: 'Vert.', path: "M 10 4 L 20 4 L 20 26 Q 15 20 10 26 Z" }
    ]
  };

  return (
    <div className="p-4 space-y-6 bg-black/40 border-t border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">CVM Morphological Analysis</span>
          <button 
            onClick={handleReset}
            className="p-1 hover:bg-white/10 rounded-md text-white/20 hover:text-white transition-colors"
            title="Reset Analysis"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
        <div className="px-3 py-1 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{data.cvmStage || 'CS ?'}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* CV2 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">CV2 Lower Border</span>
            <span className="text-[9px] font-bold text-blue-400 uppercase">{cv2 || 'Not Selected'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {shapes.cv2.map(opt => (
              <button
                key={opt.id}
                onClick={() => onChange('cv2Shape', opt.id)}
                className={`p-2 rounded-xl border flex flex-col items-center gap-2 transition-all ${cv2 === opt.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
              >
                <svg width="24" height="24" viewBox="0 0 30 30" className="fill-current">
                  <path d={opt.path} />
                </svg>
                <span className="text-[8px] font-bold uppercase">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CV3 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">CV3 Shape</span>
            <span className="text-[9px] font-bold text-blue-400 uppercase">{cv3 ? cv3.replace('_', ' ') : 'Not Selected'}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {shapes.cv3.map(opt => (
              <button
                key={opt.id}
                onClick={() => onChange('cv3Shape', opt.id)}
                className={`p-1.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${cv3 === opt.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
              >
                <svg width="18" height="18" viewBox="0 0 30 30" className="fill-current">
                  <path d={opt.path} />
                </svg>
                <span className="text-[6px] font-bold uppercase text-center">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CV4 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">CV4 Shape</span>
            <span className="text-[9px] font-bold text-blue-400 uppercase">{cv4 ? cv4.replace('_', ' ') : 'Not Selected'}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {shapes.cv4.map(opt => (
              <button
                key={opt.id}
                onClick={() => onChange('cv4Shape', opt.id)}
                className={`p-1.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${cv4 === opt.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
              >
                <svg width="18" height="18" viewBox="0 0 30 30" className="fill-current">
                  <path d={opt.path} />
                </svg>
                <span className="text-[6px] font-bold uppercase text-center">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CephAnalysisTable = ({ 
  data, 
  onChange 
}: { 
  data: Record<string, string>, 
  onChange: (key: string, value: string) => void 
}) => {
  const isOutsideNorm = (val: string, norm: number, sd: number) => {
    const num = parseFloat(val);
    if (isNaN(num)) return false;
    return num < (norm - sd) || num > (norm + sd);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-black">
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10">Measurements</th>
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10 text-center">Value</th>
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10 text-center">Normal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {CEPH_MEASUREMENTS.map((m, idx) => {
            const val = data[m.id] || '';
            const outside = isOutsideNorm(val, m.norm, m.sd);
            
            return (
              <tr key={m.id} className={idx % 2 === 0 ? 'bg-white/5' : 'bg-transparent'}>
                <td className="px-4 py-2.5 text-xs font-bold text-white/80">{m.label}</td>
                <td className="px-4 py-2.5 text-center">
                  <input 
                    type="text"
                    placeholder="--"
                    value={val}
                    onChange={(e) => onChange(m.id, e.target.value)}
                    className={`w-16 bg-transparent border-b border-white/10 text-center text-xs font-bold focus:border-blue-500 outline-none transition-colors placeholder:text-white/10 ${outside ? 'text-red-500' : 'text-white'}`}
                  />
                </td>
                <td className="px-4 py-2.5 text-center text-[10px] font-medium text-white/40">
                  {m.norm}{m.unit} ± {m.sd}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <CVMShapeSelector data={data} onChange={onChange} />
      <div className="p-4 bg-black/60 border-t border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Manual Stage Override:</span>
        <select 
          value={data.cvmStage || ''} 
          onChange={(e) => onChange('cvmStage', e.target.value)}
          className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-blue-500"
        >
          <option value="">Select Stage</option>
          <option value="CS1">CS 1</option>
          <option value="CS2">CS 2</option>
          <option value="CS3">CS 3</option>
          <option value="CS4">CS 4</option>
          <option value="CS5">CS 5</option>
          <option value="CS6">CS 6</option>
        </select>
      </div>
    </div>
  );
};


interface OrthoRecordsTabProps {
  patientId: string;
  initialData?: RecordSet;
  onUpdate?: (data: Partial<RecordSet>) => void;
}

const DEFAULT_RECORDS: PhotoRecord[] = [
  // Extraoral (7:5 Portrait)
  { id: 'profile-rest', type: 'extraoral', label: 'Profile rest', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'front-rest', type: 'extraoral', label: 'Front rest', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'front-smile', type: 'extraoral', label: 'Front smile', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'oblique', type: 'extraoral', label: 'Oblique', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  
  // X-rays (Right side)
  { id: 'ceph', type: 'xray', label: 'Lateral Ceph', url: null, aspectRatio: '4:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'opg', type: 'xray', label: 'OPG', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: {} },
  
  // Occlusal (4:3 Landscape)
  { id: 'occlusal-upper', type: 'occlusal', label: 'Occlusal upper', url: null, aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { archForm: 'Ovoid', gingivalHealth: 'Healthy', presentTeeth: 'All present', dentalCondition: 'Good', toothPosition: 'Normal', dentalChart: '{}' } },
  { id: 'occlusal-lower', type: 'occlusal', label: 'Occlusal lower', url: null, aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { archForm: 'Ovoid', gingivalHealth: 'Healthy', presentTeeth: 'All present', dentalCondition: 'Good', toothPosition: 'Normal', dentalChart: '{}' } },
  
  // Intraoral (16:9 Widescreen)
  { id: 'lateral-right', type: 'intraoral', label: 'Lateral right', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { canineClass: 'I', molarClass: 'I', canineUnit: 'Full', molarUnit: 'Full' } },
  { id: 'frontal-retracted', type: 'intraoral', label: 'Frontal retracted', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { plaqueCaries: 'Good', gingivalHealth: 'Healthy', overbite: '2', upperMidlineShift: '0', lowerMidlineShift: '0' } },
  { id: 'lateral-left', type: 'intraoral', label: 'Lateral left', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { canineClass: 'I', molarClass: 'I', canineUnit: 'Full', molarUnit: 'Full' } },
];

const OrthoRecordsTab: React.FC<OrthoRecordsTabProps> = ({ patientId, initialData, onUpdate }) => {
  const [records, setRecords] = useState<PhotoRecord[]>(() => {
    const initialRecords = initialData?.records || [];
    if (initialRecords.length === 0) return DEFAULT_RECORDS;
    
    // Merge: ensure all default records exist, overwrite with initial if present
    return DEFAULT_RECORDS.map(def => {
      const found = initialRecords.find(r => r.id === def.id);
      return found || def;
    });
  });
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'problem-list' | 'treatment-plan'>('records');
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [problemList, setProblemList] = useState(initialData?.problemList || null);
  const [treatmentPlan, setTreatmentPlan] = useState(initialData?.treatmentPlan || null);
  const [chiefComplaint, setChiefComplaint] = useState(initialData?.chiefComplaint ?? 'Sk.cl.I, Canine and molar Cl. I. Periodontically compromised L1.');
  const [stlFiles, setStlFiles] = useState<{ id: string, name: string, url: string }[]>(initialData?.stlFiles || []);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialData?.audioUrl || null);

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExtraoralModalOpen, setIsExtraoralModalOpen] = useState(false);
  const [isIntraoralModalOpen, setIsIntraoralModalOpen] = useState(false);
  const [isGridFullscreenOpen, setIsGridFullscreenOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [occlusalViewMode, setOcclusalViewMode] = useState<'upper' | 'lower' | 'both'>('both');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isCropping, setIsCropping] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showMidline, setShowMidline] = useState(false);
  const [showProfileLine, setShowProfileLine] = useState(false);
  const [midlineX, setMidlineX] = useState(50);
  const [midlineY, setMidlineY] = useState(40);
  const [profileLineX, setProfileLineX] = useState(50);
  const [profileLineRotation, setProfileLineRotation] = useState(0);
  const [facialMidlineX, setFacialMidlineX] = useState(50);
  const [upperMidlineX, setUpperMidlineX] = useState(50);
  const [lowerMidlineX, setLowerMidlineX] = useState(50);
  const [showDentalMidlines, setShowDentalMidlines] = useState(false);
  const [rightCanineUpperX, setRightCanineUpperX] = useState(60);
  const [rightCanineLowerX, setRightCanineLowerX] = useState(60);
  const [rightMolarUpperX, setRightMolarUpperX] = useState(40);
  const [rightMolarLowerX, setRightMolarLowerX] = useState(40);
  const [leftCanineUpperX, setLeftCanineUpperX] = useState(40);
  const [leftCanineLowerX, setLeftCanineLowerX] = useState(40);
  const [leftMolarUpperX, setLeftMolarUpperX] = useState(60);
  const [leftMolarLowerX, setLeftMolarLowerX] = useState(60);
  const [showLateralLines, setShowLateralLines] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stlInputRef = useRef<HTMLInputElement>(null);

  // STL State
  const [isStlViewerOpen, setIsStlViewerOpen] = useState(false);
  const [selectedStl, setSelectedStl] = useState<{ id: string, name: string, url: string } | null>(null);

  // Sync with parent
  useEffect(() => {
    // Use JSON.stringify to avoid reference-based loops when syncing with parent
    const currentData = {
      records,
      chiefComplaint,
      problemList,
      treatmentPlan,
      stlFiles,
      audioUrl
    };
    
    const prevData = {
      records: initialData?.records,
      chiefComplaint: initialData?.chiefComplaint,
      problemList: initialData?.problemList,
      treatmentPlan: initialData?.treatmentPlan,
      stlFiles: initialData?.stlFiles,
      audioUrl: initialData?.audioUrl
    };

    if (JSON.stringify(currentData) !== JSON.stringify(prevData)) {
      onUpdate?.(currentData);
    }
  }, [records, chiefComplaint, problemList, treatmentPlan, stlFiles, audioUrl, onUpdate, initialData]);

  const handleStlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const newStl = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url
      };
      setStlFiles(prev => [...prev, newStl]);
      setSelectedStl(newStl);
      setIsStlViewerOpen(true);
    }
  };

  // Voice Note State
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
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
    setAudioUrl(null);
    setIsPlaying(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedPhoto) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setRecords(prev => prev.map(r => r.id === selectedPhoto.id ? { ...r, url } : r));
        setSelectedPhoto(prev => prev ? { ...prev, url } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleFlipH = (id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, flipH: !r.flipH } : r));
    if (selectedPhoto?.id === id) setSelectedPhoto(prev => prev ? { ...prev, flipH: !prev.flipH } : null);
  };

  const toggleFlipV = (id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, flipV: !r.flipV } : r));
    if (selectedPhoto?.id === id) setSelectedPhoto(prev => prev ? { ...prev, flipV: !prev.flipV } : null);
  };

  const removePhoto = (id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, url: null, flipH: false, flipV: false, crop: null, analysis: {} } : r));
    if (selectedPhoto?.id === id) setSelectedPhoto(null);
  };

  const updateAnalysis = (id: string, key: string, value: string) => {
    const isOcclusal = id === 'occlusal-upper' || id === 'occlusal-lower';
    
    setRecords(prev => prev.map(r => {
      if (r.id === id || (isOcclusal && key === 'dentalChart' && (r.id === 'occlusal-upper' || r.id === 'occlusal-lower'))) {
        const newAnalysis = { ...(r.analysis || {}), [key]: value };
        return { ...r, analysis: newAnalysis };
      }
      return r;
    }));
    
    if (selectedPhoto?.id === id || (isOcclusal && key === 'dentalChart' && (selectedPhoto?.id === 'occlusal-upper' || selectedPhoto?.id === 'occlusal-lower'))) {
      setSelectedPhoto(prev => {
        if (!prev) return null;
        const newAnalysis = { ...(prev.analysis || {}), [key]: value };
        return { ...prev, analysis: newAnalysis };
      });
    }
  };

  const getAspectRatioNumber = (ratio: string) => {
    if (!ratio) return 1;
    const [w, h] = ratio.split(':').map(Number);
    // If it's 7:5 or 4:5, it's portrait in our grid (5/7 or 5/4)
    if (ratio === '7:5') return 5/7;
    if (ratio === '4:5') return 4/5;
    return w / h;
  };

  const onCropComplete = (_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const saveCroppedImage = async () => {
    if (!selectedPhoto?.url || !croppedAreaPixels) return;

    try {
      const image = new Image();
      image.src = selectedPhoto.url;
      await new Promise((resolve) => (image.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      const croppedUrl = canvas.toDataURL('image/jpeg');
      setRecords(prev => prev.map(r => r.id === selectedPhoto.id ? { ...r, url: croppedUrl } : r));
      setSelectedPhoto(prev => prev ? { ...prev, url: croppedUrl } : null);
      setIsCropping(false);
    } catch (e) {
      console.error(e);
    }
  };

  const getAspectRatioClass = (ratio: string) => {
    if (!ratio) return 'aspect-square';
    switch (ratio) {
      case '7:5': return 'aspect-[5/7]'; // Portrait
      case '4:5': return 'aspect-[4/5]'; // X-ray Portrait
      case '4:3': return 'aspect-[4/3]'; // Landscape
      case '16:9': return 'aspect-[16/9]'; // Widescreen
      default: return 'aspect-square';
    }
  };

  const PhotoBox = ({ record, className = "" }: { record: PhotoRecord | undefined, className?: string, key?: string }) => {
    if (!record) return <div className={`bg-slate-100 rounded-2xl ${className}`} />;

    return (
      <div className={`group relative bg-slate-50/50 overflow-hidden flex items-center justify-center cursor-pointer transition-all ${getAspectRatioClass(record.aspectRatio)} ${className}`}
        onClick={(e) => {
          if (!record.url) {
            setSelectedPhoto(record);
            fileInputRef.current?.click();
          }
        }}
      >
      {record.url ? (
        <>
          <img 
            src={record.url} 
            alt={record.label}
            className="w-full h-full object-contain bg-slate-50 transition-transform duration-700 group-hover:scale-105"
            style={{ 
              transform: `scaleX(${record.flipH ? -1 : 1}) scaleY(${record.flipV ? -1 : 1})`,
              referrerPolicy: 'no-referrer'
            } as any}
          />
          {/* Permanent Label Overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none">
            <div className="px-2.5 py-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg">
              <span className="text-[10px] font-bold text-white uppercase tracking-[0.1em]">{record.label}</span>
            </div>
            {record.analysis && Object.keys(record.analysis).length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/80 backdrop-blur-md rounded-lg border border-blue-400/30 shadow-lg">
                <Activity className="w-3 h-3 text-white" />
                <span className="text-[8px] font-bold text-white uppercase tracking-wider">Analyzed</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-blue-500 transition-all p-6">
          <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <ImageIcon className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] text-center leading-tight">{record.label}</span>
        </div>
      )}
      
      {/* Overlay controls */}
      {record.url && (
        <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhoto(record);
              setIsFullscreenOpen(true);
            }}
            className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl text-slate-800 shadow-xl hover:bg-white hover:scale-110 transition-all"
            title="Full Screen"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhoto(record);
              setIsEditModalOpen(true);
            }}
            className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl text-slate-800 shadow-xl hover:bg-white hover:scale-110 transition-all"
            title="Edit Photo"
          >
            <Crop className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

  return (
    <div className="space-y-8 pb-12 w-full max-w-7xl mx-auto px-4">
      {activeSubTab === 'records' ? (
        <>
          {/* Photo Grid Layout - Seamless, X-rays on Right */}
          <div className="relative group/grid">
            {/* Grid Fullscreen Toggle */}
            <div className="absolute top-4 right-4 z-10 opacity-0 group-hover/grid:opacity-100 transition-opacity">
              <button 
                onClick={() => setIsGridFullscreenOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl text-slate-700 font-bold text-xs hover:bg-white transition-all hover:scale-105"
              >
                <Maximize2 className="w-4 h-4" />
                Full Screen Grid
              </button>
            </div>

            <div className="bg-white border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row gap-0">
              {/* Left Column (Main Photos) */}
              <div className="flex-1 flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-slate-200">
              {/* Row 1: Extraoral (7:5 Portrait) */}
              <div className="grid grid-cols-4 gap-0">
                {records.filter(r => r.id === 'profile-rest' || r.id === 'front-rest' || r.id === 'front-smile' || r.id === 'oblique').map(record => (
                  <PhotoBox key={record.id} record={record} className="border-r border-b border-slate-200 last:border-r-0" />
                ))}
              </div>

              {/* Row 2: Occlusal & Patient Info */}
              <div className="grid grid-cols-3 gap-0 border-b border-slate-200">
                <PhotoBox record={records.find(r => r.id === 'occlusal-upper')!} className="border-r border-slate-200" />
                
                <div className="flex flex-col items-center justify-center text-center p-8 bg-white h-full border-r border-slate-200">
                  <h2 className="text-3xl font-serif text-slate-900 leading-tight tracking-tight">Patient Records</h2>
                  <p className="text-lg font-serif text-slate-600 mt-2">{initialData?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <div className="mt-6 pt-6 border-t border-slate-100 text-[11px] font-serif text-slate-500 space-y-2 max-w-[240px] italic">
                    <p>{chiefComplaint || "No clinical details provided"}</p>
                  </div>
                </div>

                <PhotoBox record={records.find(r => r.id === 'occlusal-lower')!} />
              </div>

              {/* Row 3: Intraoral (16:9 Widescreen) */}
              <div className="grid grid-cols-3 gap-0">
                {records.filter(r => r.id === 'lateral-right' || r.id === 'frontal-retracted' || r.id === 'lateral-left').map(record => (
                  <PhotoBox key={record.id} record={record} className="border-r border-slate-200 last:border-r-0" />
                ))}
              </div>
            </div>

            {/* Right Column (X-rays) */}
            <div className="w-full lg:w-[30%] flex flex-col gap-0">
              <PhotoBox record={records.find(r => r.id === 'ceph')!} className="border-b border-slate-200 flex-1" />
              <div className="flex flex-col">
                <PhotoBox record={records.find(r => r.id === 'opg')!} className="border-b border-slate-200" />
                {/* Footer Branding Overlay */}
                <div className="p-10 bg-white flex flex-col items-end justify-end">
                  <span className="text-4xl font-serif italic text-slate-900">Shady Elkelany</span>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Orthodontic Specialist</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
      ) : activeSubTab === 'problem-list' ? (
        <ProblemListTab 
          data={{ ...initialData!, records, problemList: problemList || undefined, treatmentPlan: treatmentPlan || undefined }} 
          onUpdate={(newData) => {
            if (newData.problemList) setProblemList(newData.problemList);
          }}
          onOpenPhotoViewer={() => setIsPhotoViewerOpen(true)}
        />
      ) : (
        <TreatmentPlanTab 
          data={{ ...initialData!, records, problemList: problemList || undefined, treatmentPlan: treatmentPlan || undefined }}
          onUpdate={(newData) => {
            if (newData.treatmentPlan) setTreatmentPlan(newData.treatmentPlan);
          }}
          onOpenPhotoViewer={() => setIsPhotoViewerOpen(true)}
        />
      )}


    {/* Header & General Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {activeSubTab === 'records' ? (
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Clinical Records</h3>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Patient ID: {patientId}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Chief Complaint</label>
                  <div className="flex items-center gap-2">
                    {audioUrl ? (
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
                          src={audioUrl} 
                          onEnded={() => setIsPlaying(false)}
                          className="hidden" 
                        />
                      </div>
                    ) : (
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
                    )}
                  </div>
                </div>
                <textarea 
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                  placeholder="Enter patient's chief complaint..."
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2" />
        )}

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Actions</h4>
          <button 
            onClick={() => setIsExtraoralModalOpen(true)}
            className="flex items-center justify-between p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold text-xs hover:bg-blue-100 transition-all group"
          >
            <div className="flex items-center gap-3">
              <Camera className="w-5 h-5" />
              Extraoral Records
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={() => setIsIntraoralModalOpen(true)}
            className="flex items-center justify-between p-4 bg-emerald-50 text-emerald-700 rounded-2xl font-bold text-xs hover:bg-emerald-100 transition-all group"
          >
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5" />
              Intraoral Records
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={() => stlInputRef.current?.click()}
            className="flex items-center justify-between p-4 bg-indigo-50 text-indigo-700 rounded-2xl font-bold text-xs hover:bg-indigo-100 transition-all group"
          >
            <div className="flex items-center gap-3">
              <Box className="w-5 h-5" />
              Upload STL Model
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <div className="h-px bg-slate-100 my-2" />
          
          <button 
            onClick={() => setActiveSubTab('problem-list')}
            className={`flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition-all group ${activeSubTab === 'problem-list' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              Problem List
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button 
            onClick={() => setActiveSubTab('treatment-plan')}
            className={`flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition-all group ${activeSubTab === 'treatment-plan' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
          >
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5" />
              Treatment Plan
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          {activeSubTab !== 'records' && (
            <button 
              onClick={() => setActiveSubTab('records')}
              className="flex items-center justify-center gap-2 p-3 text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-widest transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Records
            </button>
          )}
          {stlFiles.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Recent Models</span>
              {stlFiles.slice(-3).map(file => (
                <button 
                  key={file.id}
                  onClick={() => {
                    setSelectedStl(file);
                    setIsStlViewerOpen(true);
                  }}
                  className="flex items-center justify-between p-3 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-bold hover:bg-slate-100 transition-all border border-slate-100"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Box className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 opacity-40" />
                </button>
              ))}
            </div>
          )}
          <button className="flex items-center justify-between p-4 bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all group">
            <div className="flex items-center gap-3">
              <Plus className="w-5 h-5" />
              Add New Record Set
            </div>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePhotoUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={stlInputRef} 
        onChange={handleStlUpload} 
        accept=".stl" 
        className="hidden" 
      />

      {/* STL Viewer Modal */}
      <AnimatePresence>
        {isStlViewerOpen && selectedStl && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStlViewerOpen(false)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-slate-900 rounded-[40px] shadow-2xl w-full max-w-6xl h-full max-h-[85vh] overflow-hidden flex flex-col border border-white/10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Box className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedStl.name}</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3D STL Model Viewer</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsStlViewerOpen(false)}
                    className="p-3 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* 3D Canvas Area */}
              <div className="flex-1 relative bg-slate-950">
                <Canvas shadows camera={{ position: [0, 0, 150], fov: 50 }}>
                  <color attach="background" args={['#020617']} />
                  <ambientLight intensity={0.1} />
                  <spotLight position={[100, 100, 100]} angle={0.15} penumbra={1} intensity={3} castShadow />
                  <pointLight position={[-100, -100, -100]} intensity={2} />
                  <directionalLight position={[0, 100, 0]} intensity={1.5} />
                  <React.Suspense fallback={null}>
                    <Stage environment="city" intensity={1}>
                      <STLModel url={selectedStl.url} />
                    </Stage>
                  </React.Suspense>
                  <OrbitControls makeDefault />
                </Canvas>

                {/* Controls Overlay */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2 text-white/60">
                        <RotateCcw className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">Rotate</span>
                      </div>
                      <span className="text-[9px] text-white/30">Left Click</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2 text-white/60">
                        <Maximize2 className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">Pan</span>
                      </div>
                      <span className="text-[9px] text-white/30">Right Click</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2 text-white/60">
                        <ZoomIn className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">Zoom</span>
                      </div>
                      <span className="text-[9px] text-white/30">Scroll</span>
                    </div>
                  </div>
                </div>

                {/* Loading Indicator (Suspense) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                  <Box className="w-32 h-32 text-white animate-pulse" />
                </div>
              </div>

              {/* Footer Info */}
              <div className="p-6 bg-slate-900 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Hardware Accelerated</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-white/40" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Standard STL Format</span>
                  </div>
                </div>
                <p className="text-[10px] text-white/30 italic">Use mouse to interact with the 3D model</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Grid Fullscreen Modal */}
      <AnimatePresence>
        {isGridFullscreenOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950 p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setIsGridFullscreenOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-[95vw] max-h-[95vh] overflow-auto bg-white rounded-2xl shadow-2xl"
            >
              <div className="sticky top-0 right-0 p-4 flex justify-end z-20 pointer-events-none">
                <button 
                  onClick={() => setIsGridFullscreenOpen(false)}
                  className="p-3 bg-slate-900/80 backdrop-blur-md rounded-xl text-white hover:bg-slate-900 transition-all border border-white/10 pointer-events-auto shadow-xl"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 md:p-8">
                {/* Re-render the grid inside the modal */}
                <div className="bg-white border border-slate-200 shadow-sm relative overflow-hidden flex flex-col lg:flex-row gap-0">
                  {/* Left Column (Main Photos) */}
                  <div className="flex-1 flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-slate-200">
                    {/* Row 1: Extraoral */}
                    <div className="grid grid-cols-4 gap-0">
                      {records.filter(r => r.id === 'profile-rest' || r.id === 'front-rest' || r.id === 'front-smile' || r.id === 'oblique').map(record => (
                        <PhotoBox key={record.id} record={record} className="border-r border-b border-slate-200 last:border-r-0" />
                      ))}
                    </div>

                    {/* Row 2: Occlusal & Info */}
                    <div className="grid grid-cols-3 gap-0 border-b border-slate-200">
                      <PhotoBox record={records.find(r => r.id === 'occlusal-upper')!} className="border-r border-slate-200" />
                      <div className="flex flex-col items-center justify-center text-center p-8 bg-white h-full border-r border-slate-200">
                        <h2 className="text-3xl font-serif text-slate-900 leading-tight tracking-tight">Abeer Ameen 43y.</h2>
                        <p className="text-lg font-serif text-slate-600 mt-2">21 November 2022</p>
                        <div className="mt-6 pt-6 border-t border-slate-100 text-[11px] font-serif text-slate-500 space-y-2 max-w-[240px] italic">
                          <p>"Sk.cl.I, Canine and molar Cl. I"</p>
                          <p>"Periodontically compromised L1"</p>
                        </div>
                      </div>
                      <PhotoBox record={records.find(r => r.id === 'occlusal-lower')!} />
                    </div>

                    {/* Row 3: Intraoral */}
                    <div className="grid grid-cols-3 gap-0">
                      {records.filter(r => r.id === 'lateral-right' || r.id === 'frontal-retracted' || r.id === 'lateral-left').map(record => (
                        <PhotoBox key={record.id} record={record} className="border-r border-slate-200 last:border-r-0" />
                      ))}
                    </div>
                  </div>

                  {/* Right Column (X-rays) */}
                  <div className="w-full lg:w-[30%] flex flex-col gap-0">
                    <PhotoBox record={records.find(r => r.id === 'ceph')!} className="border-b border-slate-200 flex-1" />
                    <div className="flex flex-col">
                      <PhotoBox record={records.find(r => r.id === 'opg')!} className="border-b border-slate-200" />
                      <div className="p-10 bg-white flex flex-col items-end justify-end">
                        <span className="text-4xl font-serif italic text-slate-900">Shady Elkelany</span>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Orthodontic Specialist</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreenOpen && selectedPhoto && selectedPhoto.url && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setIsFullscreenOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full h-full flex flex-col lg:flex-row items-stretch overflow-hidden"
            >
              {/* Main Image Area */}
              <div className="flex-1 flex flex-col relative min-h-0 bg-slate-950">
                <div className="absolute top-6 left-6 flex items-center gap-4 z-20">
                  <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                    <span className="text-sm font-bold text-white uppercase tracking-widest">{selectedPhoto.label}</span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 pb-32 min-h-0 relative">
                  <div className="relative w-full h-full flex items-center justify-center">
                    {(selectedPhoto.id === 'occlusal-upper' || selectedPhoto.id === 'occlusal-lower') ? (
                      <div className="w-full h-full flex flex-col md:flex-row gap-8 items-center justify-center">
                        {/* Occlusal Upper */}
                        {(occlusalViewMode === 'upper' || occlusalViewMode === 'both') && (
                          <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                            <div className="absolute top-0 left-0 px-3 py-1 bg-purple-500/20 backdrop-blur-md rounded-lg border border-purple-500/30 z-10">
                              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Upper Occlusal</span>
                            </div>
                            {records.find(r => r.id === 'occlusal-upper')?.url ? (
                              <div className="relative flex items-center justify-center">
                                <img 
                                  src={records.find(r => r.id === 'occlusal-upper')?.url!} 
                                  alt="Upper Occlusal"
                                  className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                  style={{ 
                                    transform: `scaleX(${records.find(r => r.id === 'occlusal-upper')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'occlusal-upper')?.flipV ? -1 : 1})`,
                                    referrerPolicy: 'no-referrer'
                                  } as any}
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                                <Camera className="w-12 h-12 text-white/20" />
                                <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Upper Photo</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Occlusal Lower */}
                        {(occlusalViewMode === 'lower' || occlusalViewMode === 'both') && (
                          <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                            <div className="absolute top-0 left-0 px-3 py-1 bg-purple-500/20 backdrop-blur-md rounded-lg border border-purple-500/30 z-10">
                              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Lower Occlusal</span>
                            </div>
                            {records.find(r => r.id === 'occlusal-lower')?.url ? (
                              <div className="relative flex items-center justify-center">
                                <img 
                                  src={records.find(r => r.id === 'occlusal-lower')?.url!} 
                                  alt="Lower Occlusal"
                                  className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                  style={{ 
                                    transform: `scaleX(${records.find(r => r.id === 'occlusal-lower')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'occlusal-lower')?.flipV ? -1 : 1})`,
                                    referrerPolicy: 'no-referrer'
                                  } as any}
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                                <Camera className="w-12 h-12 text-white/20" />
                                <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Lower Photo</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') ? (
                      <div className="w-full h-full flex flex-col md:flex-row gap-8 items-center justify-center">
                        {/* Lateral Right */}
                        <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                          <div className="absolute top-0 left-0 px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-lg border border-blue-500/30 z-10">
                            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Right Lateral</span>
                          </div>
                          {records.find(r => r.id === 'lateral-right')?.url ? (
                            <div className="relative flex items-center justify-center">
                              <img 
                                src={records.find(r => r.id === 'lateral-right')?.url!} 
                                alt="Right Lateral"
                                className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                style={{ 
                                  transform: `scaleX(${records.find(r => r.id === 'lateral-right')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'lateral-right')?.flipV ? -1 : 1})`,
                                  referrerPolicy: 'no-referrer'
                                } as any}
                              />
                              
                              {showLateralLines && (
                                <>
                                  {/* Right Canine Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${rightCanineUpperX}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Canine U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${rightCanineLowerX}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Canine L</div>
                                  </div>
                                  
                                  {/* Right Molar Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${rightMolarUpperX}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Molar U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${rightMolarLowerX}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Molar L</div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                              <Camera className="w-12 h-12 text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Right Photo</span>
                            </div>
                          )}
                        </div>

                        {/* Lateral Left */}
                        <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                          <div className="absolute top-0 left-0 px-3 py-1 bg-rose-500/20 backdrop-blur-md rounded-lg border border-rose-500/30 z-10">
                            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-widest">Left Lateral</span>
                          </div>
                          {records.find(r => r.id === 'lateral-left')?.url ? (
                            <div className="relative flex items-center justify-center">
                              <img 
                                src={records.find(r => r.id === 'lateral-left')?.url!} 
                                alt="Left Lateral"
                                className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                style={{ 
                                  transform: `scaleX(${records.find(r => r.id === 'lateral-left')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'lateral-left')?.flipV ? -1 : 1})`,
                                  referrerPolicy: 'no-referrer'
                                } as any}
                              />

                              {showLateralLines && (
                                <>
                                  {/* Left Canine Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${leftCanineUpperX}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Canine U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${leftCanineLowerX}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Canine L</div>
                                  </div>
                                  
                                  {/* Left Molar Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${leftMolarUpperX}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Molar U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${leftMolarLowerX}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Molar L</div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                              <Camera className="w-12 h-12 text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Left Photo</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <img 
                          src={selectedPhoto.url} 
                          alt={selectedPhoto.label}
                          className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain"
                          style={{ 
                            transform: `scaleX(${selectedPhoto.flipH ? -1 : 1}) scaleY(${selectedPhoto.flipV ? -1 : 1})`,
                            referrerPolicy: 'no-referrer'
                          } as any}
                        />
                        
                        {/* Midline Overlay */}
                        {showMidline && (
                          <div className="absolute inset-0 pointer-events-none">
                            {/* Vertical Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)] z-20"
                              style={{ left: `${midlineX}%` }}
                            />
                            {/* Inter-pupillary Line (Horizontal) */}
                            <div 
                              className="absolute left-0 right-0 h-px bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)] z-20"
                              style={{ top: `${midlineY}%` }}
                            />
                            {/* Center Point */}
                            <div 
                              className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] z-30"
                              style={{ left: `${midlineX}%`, top: `${midlineY}%` }}
                            />
                          </div>
                        )}

                        {/* Profile Reference Line Overlay */}
                        {showProfileLine && selectedPhoto.id === 'profile-rest' && (
                          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div 
                              className="absolute top-[-50%] bottom-[-50%] w-px bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)] z-20"
                              style={{ 
                                left: `${profileLineX}%`,
                                transform: `rotate(${profileLineRotation}deg)`
                              }}
                            />
                            <div className="absolute top-6 right-6 px-3 py-1 bg-indigo-500/20 backdrop-blur-md rounded-lg border border-indigo-500/30">
                              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">E-Line Reference</span>
                            </div>
                          </div>
                        )}

                        {/* Dental Midlines Overlay */}
                        {showDentalMidlines && selectedPhoto.id === 'frontal-retracted' && (
                          <div className="absolute inset-0 pointer-events-none">
                            {/* Facial Midline (Reference) */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.4)] z-20"
                              style={{ left: `${facialMidlineX}%` }}
                            >
                              <div className="absolute top-4 left-2 px-2 py-0.5 bg-white/20 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase">Facial</div>
                            </div>
                            
                            {/* Upper Dental Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-blue-400/80 shadow-[0_0_8px_rgba(96,165,250,0.5)] z-20"
                              style={{ left: `${upperMidlineX}%` }}
                            >
                              <div className="absolute top-12 left-2 px-2 py-0.5 bg-blue-500/20 backdrop-blur-md rounded text-[8px] font-bold text-blue-300 uppercase">Upper</div>
                            </div>

                            {/* Lower Dental Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.5)] z-20"
                              style={{ left: `${lowerMidlineX}%` }}
                            >
                              <div className="absolute bottom-12 left-2 px-2 py-0.5 bg-rose-500/20 backdrop-blur-md rounded text-[8px] font-bold text-rose-300 uppercase">Lower</div>
                            </div>

                            {/* Shift Indicators */}
                            {Math.abs(upperMidlineX - facialMidlineX) > 0.1 && (
                              <div 
                                className="absolute top-20 h-0.5 bg-blue-400/40 z-10 flex items-center justify-center"
                                style={{ 
                                  left: `${Math.min(facialMidlineX, upperMidlineX)}%`,
                                  width: `${Math.abs(upperMidlineX - facialMidlineX)}%`
                                }}
                              >
                                <div className="absolute -top-4 text-[8px] font-bold text-blue-300 whitespace-nowrap">
                                  Upper Shift: {((upperMidlineX - facialMidlineX) * 0.5).toFixed(1)}mm
                                </div>
                              </div>
                            )}

                            {Math.abs(lowerMidlineX - facialMidlineX) > 0.1 && (
                              <div 
                                className="absolute bottom-20 h-0.5 bg-rose-400/40 z-10 flex items-center justify-center"
                                style={{ 
                                  left: `${Math.min(facialMidlineX, lowerMidlineX)}%`,
                                  width: `${Math.abs(lowerMidlineX - facialMidlineX)}%`
                                }}
                              >
                                <div className="absolute -bottom-4 text-[8px] font-bold text-rose-300 whitespace-nowrap">
                                  Lower Shift: {((lowerMidlineX - facialMidlineX) * 0.5).toFixed(1)}mm
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-4 z-20">
                  {/* Frontal Tools */}
                  {(selectedPhoto.id === 'front-rest' || selectedPhoto.id === 'front-smile') && (
                    <>
                      <button 
                        onClick={() => setShowMidline(!showMidline)}
                        className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
                          showMidline 
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                          : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        <Activity className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Midline</span>
                      </button>
                      
                      {showMidline && (
                        <div className="flex flex-col gap-2 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                          <div className="flex items-center gap-4 min-w-[160px]">
                            <span className="text-[10px] font-bold text-white/40 uppercase w-8">H</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={midlineX} 
                              onChange={(e) => setMidlineX(Number(e.target.value))}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                          </div>
                          <div className="flex items-center gap-4 min-w-[160px]">
                            <span className="text-[10px] font-bold text-white/40 uppercase w-8">V</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={midlineY} 
                              onChange={(e) => setMidlineY(Number(e.target.value))}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Frontal Retracted Tools */}
                  {selectedPhoto.id === 'frontal-retracted' && (
                    <>
                      <button 
                        onClick={() => setShowDentalMidlines(!showDentalMidlines)}
                        className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
                          showDentalMidlines 
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                          : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        <Activity className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Dental Midlines</span>
                      </button>
                      
                      {showDentalMidlines && (
                        <div className="flex flex-col gap-3 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                          <div className="flex items-center gap-4 min-w-[200px]">
                            <span className="text-[8px] font-bold text-white/40 uppercase w-12">Facial</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              step="0.1"
                              value={facialMidlineX} 
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setFacialMidlineX(val);
                                const upperShift = ((upperMidlineX - val) * 0.5).toFixed(1);
                                const lowerShift = ((lowerMidlineX - val) * 0.5).toFixed(1);
                                updateAnalysis('frontal-retracted', 'upperMidlineShift', upperShift);
                                updateAnalysis('frontal-retracted', 'lowerMidlineShift', lowerShift);
                              }}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                            />
                          </div>
                          <div className="flex items-center gap-4 min-w-[200px]">
                            <span className="text-[8px] font-bold text-blue-400/60 uppercase w-12">Upper</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              step="0.1"
                              value={upperMidlineX} 
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setUpperMidlineX(val);
                                const upperShift = ((val - facialMidlineX) * 0.5).toFixed(1);
                                updateAnalysis('frontal-retracted', 'upperMidlineShift', upperShift);
                              }}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-400"
                            />
                          </div>
                          <div className="flex items-center gap-4 min-w-[200px]">
                            <span className="text-[8px] font-bold text-rose-400/60 uppercase w-12">Lower</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              step="0.1"
                              value={lowerMidlineX} 
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLowerMidlineX(val);
                                const lowerShift = ((val - facialMidlineX) * 0.5).toFixed(1);
                                updateAnalysis('frontal-retracted', 'lowerMidlineShift', lowerShift);
                              }}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-400"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Lateral Tools */}
                  {(selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') && (
                    <>
                      <button 
                        onClick={() => setShowLateralLines(!showLateralLines)}
                        className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
                          showLateralLines 
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                          : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        <Activity className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Align Lines</span>
                      </button>
                      
                      {showLateralLines && (
                        <div className="flex flex-col gap-4 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 min-w-[320px]">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Right Side</span>
                              <div className="flex gap-4">
                                <span className="text-[8px] font-bold text-rose-400 uppercase">Upper (Red)</span>
                                <span className="text-[8px] font-bold text-blue-400 uppercase">Lower (Blue)</span>
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-white/40 uppercase">Molar</span>
                                <div className="flex items-center gap-4">
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={rightMolarUpperX} 
                                    onChange={(e) => setRightMolarUpperX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                  />
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={rightMolarLowerX} 
                                    onChange={(e) => setRightMolarLowerX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-white/40 uppercase">Canine</span>
                                <div className="flex items-center gap-4">
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={rightCanineUpperX} 
                                    onChange={(e) => setRightCanineUpperX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                  />
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={rightCanineLowerX} 
                                    onChange={(e) => setRightCanineLowerX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="h-px bg-white/5" />

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Left Side</span>
                              <div className="flex gap-4">
                                <span className="text-[8px] font-bold text-rose-400 uppercase">Upper (Red)</span>
                                <span className="text-[8px] font-bold text-blue-400 uppercase">Lower (Blue)</span>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-white/40 uppercase">Canine</span>
                                <div className="flex items-center gap-4">
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={leftCanineUpperX} 
                                    onChange={(e) => setLeftCanineUpperX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                  />
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={leftCanineLowerX} 
                                    onChange={(e) => setLeftCanineLowerX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-white/40 uppercase">Molar</span>
                                <div className="flex items-center gap-4">
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={leftMolarUpperX} 
                                    onChange={(e) => setLeftMolarUpperX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                  />
                                  <input 
                                    type="range" min="0" max="100" step="0.1"
                                    value={leftMolarLowerX} 
                                    onChange={(e) => setLeftMolarLowerX(Number(e.target.value))}
                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Profile Tools */}
                  {selectedPhoto.id === 'profile-rest' && (
                    <>
                      <button 
                        onClick={() => setShowProfileLine(!showProfileLine)}
                        className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
                          showProfileLine 
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' 
                          : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        <Activity className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Ref Line</span>
                      </button>
                      
                      {showProfileLine && (
                        <div className="flex flex-col gap-2 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                          <div className="flex items-center gap-4 min-w-[160px]">
                            <span className="text-[10px] font-bold text-white/40 uppercase w-8">Pos</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={profileLineX} 
                              onChange={(e) => setProfileLineX(Number(e.target.value))}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                            />
                          </div>
                          <div className="flex items-center gap-4 min-w-[160px]">
                            <span className="text-[10px] font-bold text-white/40 uppercase w-8">Rot</span>
                            <input 
                              type="range" 
                              min="-45" 
                              max="45" 
                              value={profileLineRotation} 
                              onChange={(e) => setProfileLineRotation(Number(e.target.value))}
                              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <button 
                    onClick={() => toggleFlipH(selectedPhoto.id)}
                    className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all border border-white/10 flex flex-col items-center gap-2"
                  >
                    <FlipHorizontal className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase">Flip H</span>
                  </button>
                  <button 
                    onClick={() => toggleFlipV(selectedPhoto.id)}
                    className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all border border-white/10 flex flex-col items-center gap-2"
                  >
                    <FlipVertical className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase">Flip V</span>
                  </button>
                </div>
              </div>

              {/* Analysis Sidebar - Lateral Analysis */}
              {(selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Lateral Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Canine Class */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Canine Classification</span>
                      <div className="space-y-4">
                        {['lateral-right', 'lateral-left'].map(sideId => {
                          const side = sideId === 'lateral-right' ? 'Right' : 'Left';
                          const photo = records.find(r => r.id === sideId);
                          return (
                            <div key={sideId} className="space-y-2">
                              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{side} Side</span>
                              <div className="grid grid-cols-3 gap-2">
                                {['I', 'II', 'III'].map(cls => (
                                  <button
                                    key={cls}
                                    onClick={() => updateAnalysis(sideId, 'canineClass', cls)}
                                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                      photo?.analysis?.canineClass === cls 
                                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                    }`}
                                  >
                                    Class {cls}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-4 gap-1">
                                {['Full', '1/2', '1/4', '3/4'].map(unit => (
                                  <button
                                    key={unit}
                                    onClick={() => updateAnalysis(sideId, 'canineUnit', unit)}
                                    className={`p-1 rounded-md border text-center transition-all text-[8px] font-bold ${
                                      photo?.analysis?.canineUnit === unit 
                                      ? 'bg-white/20 border-white/30 text-white' 
                                      : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                    }`}
                                  >
                                    {unit}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Molar Class */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Molar Classification</span>
                      <div className="space-y-4">
                        {['lateral-right', 'lateral-left'].map(sideId => {
                          const side = sideId === 'lateral-right' ? 'Right' : 'Left';
                          const photo = records.find(r => r.id === sideId);
                          return (
                            <div key={sideId} className="space-y-2">
                              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{side} Side</span>
                              <div className="grid grid-cols-3 gap-2">
                                {['I', 'II', 'III'].map(cls => (
                                  <button
                                    key={cls}
                                    onClick={() => updateAnalysis(sideId, 'molarClass', cls)}
                                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                      photo?.analysis?.molarClass === cls 
                                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                    }`}
                                  >
                                    Class {cls}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-4 gap-1">
                                {['Full', '1/2', '1/4', '3/4'].map(unit => (
                                  <button
                                    key={unit}
                                    onClick={() => updateAnalysis(sideId, 'molarUnit', unit)}
                                    className={`p-1 rounded-md border text-center transition-all text-[8px] font-bold ${
                                      photo?.analysis?.molarUnit === unit 
                                      ? 'bg-white/20 border-white/30 text-white' 
                                      : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                    }`}
                                  >
                                    {unit}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Incisors Class */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Incisor Classification</span>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { id: 'I', label: 'Class I' },
                          { id: 'II-1', label: 'Class II Div 1' },
                          { id: 'II-2', label: 'Class II Div 2' },
                          { id: 'III', label: 'Class III' }
                        ].map(cls => (
                          <button
                            key={cls.id}
                            onClick={() => {
                              updateAnalysis('lateral-right', 'incisorClass', cls.id);
                              updateAnalysis('lateral-left', 'incisorClass', cls.id);
                            }}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              records.find(r => r.id === 'lateral-right')?.analysis?.incisorClass === cls.id 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{cls.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Overjet */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Overjet (mm)</span>
                        <span className="text-lg font-bold text-blue-400">
                          {records.find(r => r.id === 'lateral-right')?.analysis?.overjet || 2}mm
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="-10" 
                        max="15" 
                        step="0.5"
                        value={records.find(r => r.id === 'lateral-right')?.analysis?.overjet || 2} 
                        onChange={(e) => {
                          updateAnalysis('lateral-right', 'overjet', e.target.value);
                          updateAnalysis('lateral-left', 'overjet', e.target.value);
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest">
                        <span>Reverse</span>
                        <span>Normal (2mm)</span>
                        <span>Increased</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Profile Rest */}
              {selectedPhoto.id === 'profile-rest' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Profile Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* 1. Profile Type */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Profile Type</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Straight', 'Convex', 'Concave'].map(type => (
                          <button
                            key={type}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'profileType', type)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.profileType === type 
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{type}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Landmarks: Glabella, Subnasale, Pogonion
                      </p>
                    </div>

                    {/* 2. Nasolabial Angle */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Nasolabial Angle</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Acute (<90°)', 'Normal (90-105°)', 'Obtuse (>105°)'].map(angle => (
                          <button
                            key={angle}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'nasolabialAngle', angle)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.nasolabialAngle === angle 
                              ? 'bg-indigo-600 border-indigo-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-[9px] font-bold leading-tight">{angle}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Landmarks: Columella, Subnasale, Upper Lip
                      </p>
                    </div>

                    {/* 3. Mentolabial Sulcus */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Mentolabial Sulcus</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Deep', 'Shallow', 'Normal', 'Flat'].map(sulcus => (
                          <button
                            key={sulcus}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'mentolabialSulcus', sulcus)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.mentolabialSulcus === sulcus 
                              ? 'bg-indigo-600 border-indigo-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{sulcus}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Chin Position */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Chin Position</span>
                      <div className="grid grid-cols-1 gap-2">
                        {['Orthognathic', 'Prognathic', 'Retrognathic'].map(pos => (
                          <button
                            key={pos}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'chinPosition', pos)}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${
                              selectedPhoto.analysis?.chinPosition === pos 
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{pos}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 5. Lip Prominence (E-Line) */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Lip Prominence (E-Line)</span>
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Upper Lip</span>
                          <div className="grid grid-cols-3 gap-2">
                            {['Protrusive', 'Normal', 'Retrusive'].map(status => (
                              <button
                                key={status}
                                onClick={() => updateAnalysis(selectedPhoto.id, 'upperLipProminence', status)}
                                className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                  selectedPhoto.analysis?.upperLipProminence === status 
                                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Lower Lip</span>
                          <div className="grid grid-cols-3 gap-2">
                            {['Protrusive', 'Normal', 'Retrusive'].map(status => (
                              <button
                                key={status}
                                onClick={() => updateAnalysis(selectedPhoto.id, 'lowerLipProminence', status)}
                                className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                  selectedPhoto.analysis?.lowerLipProminence === status 
                                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Reference: Ricketts' E-Line (Nose tip to Chin tip)
                      </p>
                    </div>

                    {/* 6. Throat Angle & Double Chin */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">6. Submental Analysis</span>
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Throat Angle</span>
                          <div className="grid grid-cols-2 gap-2">
                            {['Obtuse', 'Normal'].map(angle => (
                              <button
                                key={angle}
                                onClick={() => updateAnalysis(selectedPhoto.id, 'throatAngle', angle)}
                                className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                  selectedPhoto.analysis?.throatAngle === angle 
                                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                              >
                                {angle}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Double Chin</span>
                          <div className="grid grid-cols-2 gap-2">
                            {['Present', 'Absent'].map(status => (
                              <button
                                key={status}
                                onClick={() => updateAnalysis(selectedPhoto.id, 'doubleChin', status)}
                                className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                                  selectedPhoto.analysis?.doubleChin === status 
                                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - OPG Analysis */}
              {selectedPhoto.id === 'opg' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">OPG Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Radiographic Dental Chart */}
                    <DentalNotationChart 
                      arch="both"
                      mode="opg"
                      data={JSON.parse(selectedPhoto.analysis?.dentalChart || '{}')}
                      onChange={(tooth, statuses) => {
                        const currentChart = JSON.parse(selectedPhoto.analysis?.dentalChart || '{}');
                        const newChart = { ...currentChart, [tooth]: statuses };
                        updateAnalysis(selectedPhoto.id, 'dentalChart', JSON.stringify(newChart));
                      }}
                    />

                    {/* Additional Findings */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Additional Radiographic Findings</span>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <textarea
                          value={selectedPhoto.analysis?.additionalFindings || ''}
                          onChange={(e) => updateAnalysis(selectedPhoto.id, 'additionalFindings', e.target.value)}
                          placeholder="Describe bone levels, TMJ, or other findings..."
                          className="w-full bg-transparent border-none text-xs text-white placeholder:text-white/20 focus:ring-0 resize-none h-32"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Front Rest */}
              {selectedPhoto.id === 'front-rest' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Clinical Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* 1. Facial Type */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Facial Type</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {['Dolichofacial', 'Brachyfacial', 'Mesofacial'].map(type => (
                          <button
                            key={type}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'facialType', type)}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${
                              selectedPhoto.analysis?.facialType === type 
                              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold">{type}</span>
                              {selectedPhoto.analysis?.facialType === type && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <p className="text-[9px] mt-1 opacity-50">
                              {type === 'Dolichofacial' && 'Tendency for open bite and narrow arch'}
                              {type === 'Brachyfacial' && 'Deep bite and square arch'}
                              {type === 'Mesofacial' && 'Average and proportioned'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Lip Length */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Lip Length</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Short', 'Normal', 'Long'].map(len => (
                          <button
                            key={len}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'lipLength', len)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.lipLength === len 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{len}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Lip Posture */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Lip Posture</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Everted', 'Strained', 'At Rest'].map(posture => (
                          <button
                            key={posture}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'lipPosture', posture)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.lipPosture === posture 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{posture}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Competency */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Competency</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Competent', 'Incompetent'].map(comp => (
                          <button
                            key={comp}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'lipCompetency', comp)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.lipCompetency === comp 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{comp}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * More than 2-3mm separation is considered incompetent
                      </p>
                    </div>

                    {/* 5. Asymmetry */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Asymmetry</span>
                      <div className="grid grid-cols-1 gap-2">
                        {['None', 'Midline Deviation', 'Functional Shift'].map(asym => (
                          <button
                            key={asym}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'asymmetry', asym)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              selectedPhoto.analysis?.asymmetry === asym 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{asym}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Front Smile */}
              {selectedPhoto.id === 'front-smile' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Smile Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* 1. Upper Lip Position */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Upper Lip Position</span>
                      <div className="grid grid-cols-1 gap-2">
                        {['High (Gummy)', 'Normal', 'Low (Decreased Display)'].map(pos => (
                          <button
                            key={pos}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'upperLipPosition', pos)}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${
                              selectedPhoto.analysis?.upperLipPosition === pos 
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{pos}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Smile Arc */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Smile Arc</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Consonant', 'Straight', 'Reversed'].map(arc => (
                          <button
                            key={arc}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'smileArc', arc)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.smileArc === arc 
                              ? 'bg-emerald-600 border-emerald-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{arc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Incisal/Gingival Display */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Incisal Display</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Normal Display', 'Gummy (>3mm)'].map(display => (
                          <button
                            key={display}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'incisalDisplay', display)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.incisalDisplay === display 
                              ? 'bg-emerald-600 border-emerald-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{display}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Buccal Corridors */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Buccal Corridors</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Narrow (Large Space)', 'Broad (Minimal Space)'].map(corridor => (
                          <button
                            key={corridor}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'buccalCorridors', corridor)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.buccalCorridors === corridor 
                              ? 'bg-emerald-600 border-emerald-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{corridor}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 5. Symmetry & Canting */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Symmetry & Canting</span>
                      <div className="grid grid-cols-1 gap-2">
                        {['Symmetrical', 'Occlusal Canting', 'Asymmetrical Dynamics'].map(sym => (
                          <button
                            key={sym}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'smileSymmetry', sym)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              selectedPhoto.analysis?.smileSymmetry === sym 
                              ? 'bg-emerald-600 border-emerald-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{sym}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Oblique */}
              {selectedPhoto.id === 'oblique' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Oblique Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* 1. Midface Deficiency */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Midface Deficiency</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Normal', 'Deficient'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'midfaceDeficiency', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.midfaceDeficiency === status 
                              ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Best seen from ¾ or 45-angle views
                      </p>
                    </div>

                    {/* 2. Nasal Deformity */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Nasal Deformity</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Normal', 'Dorsal Hump', 'Tip Pointed Up', 'Tip Pointed Down'].map(type => (
                          <button
                            key={type}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'nasalDeformity', type)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.nasalDeformity === type 
                              ? 'bg-amber-600 border-amber-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{type}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Considering the dorsum and tip
                      </p>
                    </div>

                    {/* 3. Lip Fullness */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Lip Fullness</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Normal', 'Increased', 'Decreased'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'lipFullness', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.lipFullness === status 
                              ? 'bg-amber-600 border-amber-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Volume, position, and labial support
                      </p>
                    </div>

                    {/* 4. Vermilion Line */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Vermilion Line</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Normal', 'Increased', 'Decreased'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'vermilionLine', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.vermilionLine === status 
                              ? 'bg-amber-600 border-amber-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 5. Occlusal Canting (A-P) */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Occlusal Canting (A-P)</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Normal', 'Canted Up', 'Canted Down'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'occlusalCantingAP', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.occlusalCantingAP === status 
                              ? 'bg-amber-600 border-amber-500 text-white' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/30 italic">
                        * Antero-posterior inclination of occlusal plane
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Frontal Retracted */}
              {selectedPhoto.id === 'frontal-retracted' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Frontal Retracted Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* 1. Plaque and Caries Index */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Plaque and Caries Index</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Good', 'Fair', 'Bad'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'plaqueCaries', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.plaqueCaries === status 
                              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Gingival Health */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Gingival Health</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Healthy', 'Inflamed', 'Calculus', 'Recession'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'gingivalHealth', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.gingivalHealth === status 
                              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Overbite */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Overbite (mm)</span>
                        <span className="text-lg font-bold text-blue-400">{selectedPhoto.analysis?.overbite || 2}mm</span>
                      </div>
                      <input 
                        type="range" 
                        min="-5" 
                        max="10" 
                        step="0.5"
                        value={selectedPhoto.analysis?.overbite || 2} 
                        onChange={(e) => updateAnalysis(selectedPhoto.id, 'overbite', e.target.value)}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest">
                        <span>Open Bite</span>
                        <span>Normal (2mm)</span>
                        <span>Deep Bite</span>
                      </div>
                    </div>

                    {/* 4. Upper Jaw Midline Shift */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Upper Midline Shift (mm)</span>
                        <span className={`text-lg font-bold ${Math.abs(Number(selectedPhoto.analysis?.upperMidlineShift)) > 0.5 ? 'text-blue-400' : 'text-white/40'}`}>
                          {selectedPhoto.analysis?.upperMidlineShift || 0}mm
                        </span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-white/40 leading-relaxed italic">
                          * Adjust the "Upper" midline slider in the viewer to automatically update this value.
                        </p>
                      </div>
                    </div>

                    {/* 5. Lower Jaw Midline Shift */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Lower Midline Shift (mm)</span>
                        <span className={`text-lg font-bold ${Math.abs(Number(selectedPhoto.analysis?.lowerMidlineShift)) > 0.5 ? 'text-rose-400' : 'text-white/40'}`}>
                          {selectedPhoto.analysis?.lowerMidlineShift || 0}mm
                        </span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-white/40 leading-relaxed italic">
                          * Adjust the "Lower" midline slider in the viewer to automatically update this value.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Ceph Analysis */}
              {selectedPhoto.id === 'ceph' && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Ceph Analysis</h3>
                    </div>
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <CephAnalysisTable 
                      data={selectedPhoto.analysis || {}} 
                      onChange={(key, value) => updateAnalysis(selectedPhoto.id, key, value)} 
                    />
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Sidebar - Occlusal Analysis */}
              {(selectedPhoto.id === 'occlusal-upper' || selectedPhoto.id === 'occlusal-lower') && (
                <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        Occlusal Analysis
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          const otherId = selectedPhoto.id === 'occlusal-upper' ? 'occlusal-lower' : 'occlusal-upper';
                          const otherRecord = records.find(r => r.id === otherId);
                          if (otherRecord) setSelectedPhoto(otherRecord);
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg text-purple-400 transition-all border border-purple-500/20"
                        title={`Switch to ${selectedPhoto.id === 'occlusal-upper' ? 'Lower' : 'Upper'} Arch`}
                      >
                        <FlipVertical className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setIsFullscreenOpen(false)}
                        className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* View Mode Toggle */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center block">View Mode</span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'upper', label: 'Upper' },
                          { id: 'both', label: 'Both' },
                          { id: 'lower', label: 'Lower' }
                        ].map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => setOcclusalViewMode(mode.id as any)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              occlusalViewMode === mode.id 
                              ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{mode.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 1. Arch Form */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Arch Form</span>
                      <div className="grid grid-cols-3 gap-2">
                        {['Ovoid', 'Square', 'Tapered'].map(form => (
                          <button
                            key={form}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'archForm', form)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.archForm === form 
                              ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{form}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Gingival Health */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Gingival Health</span>
                      <div className="grid grid-cols-2 gap-2">
                        {['Healthy', 'Inflamed', 'Calculus', 'Recession'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateAnalysis(selectedPhoto.id, 'gingivalHealth', status)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedPhoto.analysis?.gingivalHealth === status 
                              ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20' 
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold">{status}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dental Chart Notation */}
                    <div className="space-y-6">
                      <DentalNotationChart 
                        arch="upper"
                        data={JSON.parse(selectedPhoto.analysis?.dentalChart || '{}')}
                        onChange={(tooth, statuses) => {
                          const currentChart = JSON.parse(selectedPhoto.analysis?.dentalChart || '{}');
                          const newChart = { ...currentChart, [tooth]: statuses };
                          updateAnalysis(selectedPhoto.id, 'dentalChart', JSON.stringify(newChart));
                        }}
                      />
                      <DentalNotationChart 
                        arch="lower"
                        data={JSON.parse(selectedPhoto.analysis?.dentalChart || '{}')}
                        onChange={(tooth, statuses) => {
                          const currentChart = JSON.parse(selectedPhoto.analysis?.dentalChart || '{}');
                          const newChart = { ...currentChart, [tooth]: statuses };
                          updateAnalysis(selectedPhoto.id, 'dentalChart', JSON.stringify(newChart));
                        }}
                      />
                    </div>

                    {/* Fields 3, 4, 5 removed as requested - functionality moved to Dental Chart */}
                  </div>

                  <div className="mt-auto pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsFullscreenOpen(false)}
                      className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-900/20"
                    >
                      Complete Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Close button for non-analysis photos */}
              {selectedPhoto.id !== 'front-rest' && 
               selectedPhoto.id !== 'front-smile' && 
               selectedPhoto.id !== 'profile-rest' && 
               selectedPhoto.id !== 'oblique' && 
               selectedPhoto.id !== 'lateral-right' && 
               selectedPhoto.id !== 'lateral-left' && 
               selectedPhoto.id !== 'frontal-retracted' && 
               selectedPhoto.id !== 'occlusal-upper' && 
               selectedPhoto.id !== 'occlusal-lower' && 
               selectedPhoto.id !== 'ceph' && (
                <div className="absolute top-6 right-6 z-10">
                  <button 
                    onClick={() => setIsFullscreenOpen(false)}
                    className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-white hover:bg-white/20 transition-all border border-white/10"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative bg-white rounded-[40px] shadow-2xl w-full overflow-hidden flex flex-col lg:flex-row ${selectedPhoto.id === 'ceph' ? 'max-w-6xl' : 'max-w-4xl'}`}
            >
              <div className="flex-1 bg-slate-100 p-8 flex items-center justify-center min-h-[400px]">
                <div className={`relative bg-white shadow-xl rounded-2xl overflow-hidden ${getAspectRatioClass(selectedPhoto.aspectRatio)} w-full max-w-2xl`}>
                  {selectedPhoto.url && (
                    isCropping ? (
                      <Cropper
                        image={selectedPhoto.url}
                        crop={crop}
                        zoom={zoom}
                        aspect={getAspectRatioNumber(selectedPhoto.aspectRatio)}
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                      />
                    ) : (
                      <img 
                        src={selectedPhoto.url} 
                        alt="Edit" 
                        className="w-full h-full object-contain"
                        style={{ 
                          transform: `scaleX(${selectedPhoto.flipH ? -1 : 1}) scaleY(${selectedPhoto.flipV ? -1 : 1})`,
                          referrerPolicy: 'no-referrer'
                        } as any}
                      />
                    )
                  )}
                </div>
              </div>
              
              <div className={`w-full lg:w-80 bg-white p-8 flex flex-col gap-8 overflow-y-auto ${selectedPhoto.id === 'ceph' ? 'lg:w-[450px]' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{selectedPhoto.label}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedPhoto.aspectRatio} Ratio</p>
                  </div>
                  <button onClick={() => {
                    setIsEditModalOpen(false);
                    setIsCropping(false);
                  }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                {selectedPhoto.id === 'ceph' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cephalometric Analysis</span>
                    </div>
                    <CephAnalysisTable 
                      data={selectedPhoto.analysis || {}} 
                      onChange={(key, value) => updateAnalysis(selectedPhoto.id, key, value)} 
                    />
                  </div>
                )}

                <div className="space-y-6">
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transform</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => toggleFlipH(selectedPhoto.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedPhoto.flipH ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                        <FlipHorizontal className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Flip H</span>
                      </button>
                      <button 
                        onClick={() => toggleFlipV(selectedPhoto.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedPhoto.flipV ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                        <FlipVertical className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Flip V</span>
                      </button>
                      <button 
                        onClick={() => setIsCropping(!isCropping)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${isCropping ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                        <Crop className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Crop</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</span>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-3 w-full p-4 bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all"
                      >
                        <Upload className="w-5 h-5" />
                        Replace Photo
                      </button>
                      <button 
                        onClick={() => {
                          removePhoto(selectedPhoto.id);
                          setIsEditModalOpen(false);
                        }}
                        className="flex items-center gap-3 w-full p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-xs hover:bg-red-100 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                        Remove Photo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-auto">
                  {isCropping ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-4 px-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Zoom</span>
                        <input 
                          type="range" 
                          min={1} 
                          max={3} 
                          step={0.1} 
                          value={zoom} 
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                      </div>
                      <button 
                        onClick={saveCroppedImage}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                      >
                        Apply Crop
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsEditModalOpen(false)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      Save Changes
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Extraoral Modal */}
      <AnimatePresence>
        {isExtraoralModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExtraoralModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Extraoral Records</h3>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">7:5 Portrait Aspect Ratio</p>
                  </div>
                </div>
                <button onClick={() => setIsExtraoralModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                  {records.filter(r => r.type === 'extraoral').map(record => (
                    <div key={record.id} className="space-y-4">
                      <div 
                        className={`group relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all ${getAspectRatioClass(record.aspectRatio)}`}
                        onClick={() => {
                          setSelectedPhoto(record);
                          fileInputRef.current?.click();
                        }}
                      >
                        {record.url ? (
                          <img 
                            src={record.url} 
                            alt={record.label}
                            className="w-full h-full object-contain bg-slate-50"
                            style={{ 
                              transform: `scaleX(${record.flipH ? -1 : 1}) scaleY(${record.flipV ? -1 : 1})`,
                              referrerPolicy: 'no-referrer'
                            } as any}
                          />
                        ) : (
                          <Plus className="w-8 h-8 text-slate-300 group-hover:text-blue-400" />
                        )}
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{record.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
                <button 
                  onClick={() => setIsExtraoralModalOpen(false)}
                  className="px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Close
                </button>
                <button 
                  onClick={() => setIsExtraoralModalOpen(false)}
                  className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Save All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Intraoral Modal */}
      <AnimatePresence>
        {isIntraoralModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsIntraoralModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Intraoral Records</h3>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">16:9 Widescreen Aspect Ratio</p>
                  </div>
                </div>
                <button onClick={() => setIsIntraoralModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {records.filter(r => r.type === 'intraoral').map(record => (
                    <div key={record.id} className="space-y-4">
                      <div 
                        className={`group relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-all ${getAspectRatioClass(record.aspectRatio)}`}
                        onClick={() => {
                          setSelectedPhoto(record);
                          fileInputRef.current?.click();
                        }}
                      >
                        {record.url ? (
                          <img 
                            src={record.url} 
                            alt={record.label}
                            className="w-full h-full object-contain bg-slate-50"
                            style={{ 
                              transform: `scaleX(${record.flipH ? -1 : 1}) scaleY(${record.flipV ? -1 : 1})`,
                              referrerPolicy: 'no-referrer'
                            } as any}
                          />
                        ) : (
                          <Plus className="w-8 h-8 text-slate-300 group-hover:text-emerald-400" />
                        )}
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{record.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
                <button 
                  onClick={() => setIsIntraoralModalOpen(false)}
                  className="px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Close
                </button>
                <button 
                  onClick={() => setIsIntraoralModalOpen(false)}
                  className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  Save All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Viewer Modal */}
      <AnimatePresence>
        {isPhotoViewerOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPhotoViewerOpen(false)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Patient Records Viewer</h3>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Select a photo to view in detail</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPhotoViewerOpen(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {records.map(record => (
                    <div 
                      key={record.id}
                      className="group relative bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer"
                      onClick={() => {
                        if (record.url) {
                          setSelectedPhoto(record);
                          setIsFullscreenOpen(true);
                        }
                      }}
                    >
                      <div className={`relative aspect-square bg-slate-100 flex items-center justify-center overflow-hidden`}>
                        {record.url ? (
                          <img 
                            src={record.url} 
                            alt={record.label}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-slate-300">
                            <ImageIcon className="w-8 h-8" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">No Image</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-all flex items-center justify-center">
                          {record.url && <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />}
                        </div>
                      </div>
                      <div className="p-4 bg-white border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block text-center truncate">
                          {record.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-white border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setIsPhotoViewerOpen(false)}
                  className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  Close Viewer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrthoRecordsTab;
