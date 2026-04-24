import React from 'react';
import CaseMetricsCards from './CaseMetricsCards';
import CaseStatusCard from './CaseStatusCard';
import TreatmentPlanSummaryCard from './TreatmentPlanSummaryCard';
import PatientAlertsCard from './PatientAlertsCard';
import RecentActivityTimeline from './RecentActivityTimeline';
import FinancialSummaryCard from './FinancialSummaryCard';

interface OrthoOverviewPageProps {
  onOpenSnapshotEditor: () => void;
}

const OrthoOverviewPage: React.FC<OrthoOverviewPageProps> = ({ onOpenSnapshotEditor }) => {
  return (
    <div className="p-4 space-y-4 bg-slate-50/50 min-h-full">
      {/* Section 1: Top Metrics Cards */}
      <CaseMetricsCards />

      <div className="grid grid-cols-12 gap-4 items-start">
        {/* Row 2: Case Status (8) and Patient Alerts (4) */}
        <div className="col-span-12 lg:col-span-8">
          <CaseStatusCard onOpenSnapshotEditor={onOpenSnapshotEditor} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <PatientAlertsCard />
        </div>

        {/* Row 3: Treatment Plan, Timeline, Financial Summary */}
        <div className="col-span-12 lg:col-span-4">
          <TreatmentPlanSummaryCard />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <RecentActivityTimeline />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <FinancialSummaryCard />
        </div>
      </div>
    </div>
  );
};

export default OrthoOverviewPage;
