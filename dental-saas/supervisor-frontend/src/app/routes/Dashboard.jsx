import React from 'react'
import { Stat, Card, Icon, Badge, Avatar, Button } from '../../components/ui'
import { MOCK_CASES, MOCK_STATS, MOCK_ACTIVITY, getStageLabel, timeAgo } from '../../services/mockData'
import { useNavigate } from 'react-router-dom'

function PriorityCaseCard({ access }) {
  const navigate = useNavigate()
  const c = access.caseId
  const stage = c.workflowData?.currentStep || 'DIAGNOSIS'

  return (
    <Card hover className="overflow-hidden animate-slide-up">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-50 text-red-500 p-2 rounded-lg">
              <Icon name="clinical_notes" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Case #{c._id.slice(-3)}</h4>
              <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Pending Review
              </p>
            </div>
          </div>
          <Badge variant="academic">
            <Icon name="school" size="sm" /> Academic Case
          </Badge>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-3 gap-8 py-6 border-y border-slate-50">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Patient</p>
            <p className="font-bold text-slate-900">{c.patientId.name}</p>
            <p className="text-xs text-slate-500">{c.caseType}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Student</p>
            <p className="font-bold text-slate-900">{access.studentName}</p>
            <p className="text-xs text-slate-500">{access.studentYear}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Institution</p>
            <p className="font-bold text-slate-900">{access.organization.name}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                <Icon name="assignment" size="sm" />
              </div>
              <span className="text-xs font-bold">Stage: {getStageLabel(stage)}</span>
            </div>
            <p className="text-xs text-slate-500 italic">Submitted by student · {timeAgo(c.updatedAt)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/cases/${c._id}`)}>Quick View</Button>
            <Button onClick={() => navigate(`/cases/${c._id}`)}>Review Case</Button>
          </div>
        </div>
      </div>

      {/* Relationship Strip */}
      <div className="bg-slate-50 p-4 flex items-center justify-center gap-12 border-t border-slate-100">
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full ring-2 ring-blue-500 ring-offset-2 bg-blue-100 flex items-center justify-center text-blue-700">
            <Icon name="school" size="sm" />
          </div>
          <span className="text-[10px] font-bold text-blue-600">Supervisor</span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-blue-300 to-indigo-200 relative">
          <Icon name="chevron_right" size="sm" className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-blue-400" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Avatar name={access.studentName} size="md" />
          <span className="text-[10px] font-bold text-indigo-600">Student</span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-indigo-200 to-slate-200 relative">
          <Icon name="chevron_right" size="sm" className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-indigo-300" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
            <Icon name="person" size="sm" />
          </div>
          <span className="text-[10px] font-bold text-slate-500">Patient</span>
        </div>
      </div>
    </Card>
  )
}

function ActivityPanel() {
  const typeColors = {
    submission: 'bg-blue-500',
    approval: 'bg-amber-500',
    join: 'bg-indigo-500',
    revision: 'bg-blue-400',
  }

  return (
    <Card className="p-6">
      <h3 className="font-['Manrope'] font-bold text-lg text-slate-900 mb-6 flex items-center gap-2">
        <Icon name="history" filled className="text-blue-600" />
        Recent Activity
      </h3>
      <div className="space-y-6 relative">
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200/50" />
        {MOCK_ACTIVITY.map(a => (
          <div key={a.id} className="relative pl-10">
            <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ${typeColors[a.type] || 'bg-slate-400'} ring-4 ring-white`} />
            <p className="text-xs font-bold text-slate-400 mb-1">{a.time}</p>
            <p className="text-sm font-semibold text-slate-800">{a.message}</p>
          </div>
        ))}
      </div>
      <button className="w-full mt-8 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-white hover:border-blue-500 hover:text-blue-600 transition-all">
        View Audit Log
      </button>
    </Card>
  )
}

function InstitutionPanel() {
  const orgs = Object.entries(MOCK_STATS.byOrganization)
  const total = orgs.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="mt-6 bg-gradient-to-br from-slate-900 to-blue-800 rounded-2xl p-6 text-white overflow-hidden relative">
      <div className="relative z-10">
        <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-4">Academic Network</p>
        <div className="space-y-4">
          {orgs.map(([name, count]) => (
            <div key={name}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm">{name}</span>
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded">{count} Active</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full">
                <div className="bg-white h-full rounded-full transition-all" style={{ width: `${(count / total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Icon name="school" className="absolute -right-4 -bottom-4 text-[96px] opacity-10 rotate-12" />
    </div>
  )
}

export default function Dashboard() {
  return (
    <>
      {/* Header */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black font-['Manrope'] tracking-tight text-blue-900 mb-2">Clinical Oversight</h1>
          <p className="text-slate-500 max-w-xl">
            Welcome back, Prof. Connor. You have <strong className="text-blue-700">{MOCK_STATS.pendingReviewCount} cases</strong> awaiting clinical approval from your residents today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">Export Logs</Button>
          <Button>Generate Reports</Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <Icon name="pending_actions" size="xl" className="text-blue-600" />
            <Badge variant="academic">Academic</Badge>
          </div>
          <div>
            <p className="text-slate-500 text-sm font-medium mb-1">Pending Reviews</p>
            <p className="text-3xl font-black font-['Manrope'] text-blue-900">{MOCK_STATS.pendingReviewCount}</p>
          </div>
        </div>
        <Stat label="Active Cases" value={MOCK_STATS.totalCases} icon="monitoring" />
        <Stat label="Approved Cases" value="1,204" icon="task_alt" />
        <Stat label="Institutions" value="03" icon="account_balance" />
      </div>

      {/* Main Content */}
      <div className="flex gap-8">
        {/* Priority Cases */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-['Manrope'] font-bold text-xl text-blue-900">Priority Cases</h3>
            <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Urgent</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Normal</span>
            </div>
          </div>
          {MOCK_CASES.slice(0, 2).map(c => (
            <PriorityCaseCard key={c._id} access={c} />
          ))}
        </div>

        {/* Right Sidebar */}
        <aside className="w-80 space-y-0">
          <ActivityPanel />
          <InstitutionPanel />
        </aside>
      </div>
    </>
  )
}
