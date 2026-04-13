import React from 'react';
import { Case } from '../../../types';
import OrthoOverviewPage from '../overview/OrthoOverviewPage';

interface OrthoOverviewTabProps {
  caseData: Case;
  onOpenSnapshotEditor: () => void;
}

const OrthoOverviewTab: React.FC<OrthoOverviewTabProps> = ({ caseData, onOpenSnapshotEditor }) => {
  return <OrthoOverviewPage onOpenSnapshotEditor={onOpenSnapshotEditor} />;
};

export default OrthoOverviewTab;
