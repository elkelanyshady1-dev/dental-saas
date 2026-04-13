import React from 'react';
import { PhotoRecord } from '../../types';
import LateralAnalysisSidebar from './LateralAnalysisSidebar';
import ProfileRestAnalysisSidebar from './ProfileRestAnalysisSidebar';
import OPGAnalysisSidebar from './OPGAnalysisSidebar';
import FrontRestAnalysisSidebar from './FrontRestAnalysisSidebar';
import FrontSmileAnalysisSidebar from './FrontSmileAnalysisSidebar';
import ObliqueAnalysisSidebar from './ObliqueAnalysisSidebar';
import FrontalRetractedAnalysisSidebar from './FrontalRetractedAnalysisSidebar';
import CephAnalysisSidebar from './CephAnalysisSidebar';
import OcclusalAnalysisSidebar from './OcclusalAnalysisSidebar';

/* ═══════════════════════════════════════════════════════════════
   AnalysisSidebar — Dispatcher component that selects the correct
   analysis sidebar based on selectedPhoto.id.
   ═══════════════════════════════════════════════════════════════ */

export interface AnalysisSidebarProps {
  selectedPhoto: PhotoRecord | null;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
  occlusalViewMode: string;
  setOcclusalViewMode: (mode: any) => void;
  onSelectPhoto: (photo: PhotoRecord) => void;
  renderCephTable: (data: Record<string, any>, onChange: (key: string, value: string) => void) => React.ReactNode;
  /** Case context — forwarded to analysis sidebars that launch CaseWorkflowModal */
  caseId?: string;
  patientId?: string;
  patientName?: string;
}

const AnalysisSidebar: React.FC<AnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
  occlusalViewMode,
  setOcclusalViewMode,
  onSelectPhoto,
  renderCephTable,
  caseId,
  patientId,
  patientName,
}) => {
  if (!selectedPhoto) return null;

  const commonProps = { selectedPhoto, records, onUpdateAnalysis, onClose };

  if (selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') {
    return <LateralAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'profile-rest') {
    return <ProfileRestAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'opg') {
    return <OPGAnalysisSidebar {...commonProps} caseId={caseId} patientId={patientId} patientName={patientName} />;
  }

  if (selectedPhoto.id === 'front-rest') {
    return <FrontRestAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'front-smile') {
    return <FrontSmileAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'oblique') {
    return <ObliqueAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'frontal-retracted') {
    return <FrontalRetractedAnalysisSidebar {...commonProps} />;
  }

  if (selectedPhoto.id === 'ceph') {
    return <CephAnalysisSidebar {...commonProps} renderCephTable={renderCephTable} />;
  }

  if (selectedPhoto.id === 'occlusal-upper' || selectedPhoto.id === 'occlusal-lower') {
    return (
      <OcclusalAnalysisSidebar 
        {...commonProps}
        occlusalViewMode={occlusalViewMode}
        setOcclusalViewMode={setOcclusalViewMode}
        onSelectPhoto={onSelectPhoto}
        caseId={caseId}
        patientId={patientId}
        patientName={patientName}
      />
    );
  }

  return null;
};

export default React.memo(AnalysisSidebar);
