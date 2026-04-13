import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Icon, Badge, Button, Avatar } from '../../components/ui'
import { MOCK_REVIEWS, MOCK_CASES, getStageLabel, timeAgo } from '../../services/mockData'

export default function Reviews() {
  const navigate = useNavigate()

  // Enrich reviews with case data
  const reviews = MOCK_REVIEWS.map(r => {
    const access = MOCK_CASES.find(c => c.caseId._id === r.caseId)
    return { ...r, access }
  })

  const statusIcon = {
    PENDING: 'schedule',
    IN_REVIEW: 'edit_note',
    APPROVED: 'check_circle',
    REJECTED: 'cancel',
    REVISION_REQUESTED: 'replay',
  }

  const statusBg = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
    IN_REVIEW: 'bg-blue-50 text-blue-700 border-blue-100',
    APPROVED: 'bg-green-50 text-green-700 border-green-100',
    REJECTED: 'bg-red-50 text-red-700 border-red-100',
    REVISION_REQUESTED: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  }

  return (
    <>
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold font-['Manrope'] text-slate-900 tracking-tight mb-2">Review Queue</h1>
          <p className="text-slate-500 max-w-2xl">
            Track all review stages across your supervised cases. Each stage follows the academic review lifecycle.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Icon name="filter_list" size="sm" className="mr-1" /> Filter
          </Button>
          <Button variant="secondary">
            <Icon name="sort" size="sm" className="mr-1" /> Sort
          </Button>
        </div>
      </div>

      {/* Review Lifecycle Legend */}
      <div className="mb-8 bg-slate-50 rounded-xl p-5 flex items-center gap-8">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lifecycle:</span>
        {['PENDING', 'IN_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED'].map((s, i, arr) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${statusBg[s]}`}>
              <Icon name={statusIcon[s]} size="sm" />
              {s.replace('_', ' ')}
            </div>
            {i < arr.length - 1 && <Icon name="arrow_forward" size="sm" className="text-slate-300" />}
          </React.Fragment>
        ))}
      </div>

      {/* Reviews Grid */}
      <div className="space-y-4">
        {reviews.map(r => {
          const patient = r.access?.caseId?.patientId?.name || 'Unknown Patient'
          const student = r.access?.studentName || 'Unknown Student'
          const org = r.access?.organization?.name || '—'

          return (
            <Card key={r._id} hover className="p-6 border border-slate-100 animate-slide-up">
              <div className="flex items-start justify-between">
                {/* Left */}
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusBg[r.status]} border`}>
                    <Icon name={statusIcon[r.status]} size="lg" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-lg text-slate-900">{getStageLabel(r.stageType)} Review</h3>
                      <Badge variant={r.status === 'APPROVED' ? 'approved' : r.status === 'REJECTED' ? 'rejected' : r.status === 'IN_REVIEW' ? 'revision' : 'pending'}>
                        {r.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-slate-400 font-medium">Stage #{r.stageNumber}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Icon name="person" size="sm" className="text-slate-400" /> {patient}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="school" size="sm" className="text-slate-400" /> {student}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="domain" size="sm" className="text-slate-400" /> {org}
                      </span>
                    </div>
                    {r.decisionNote && (
                      <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-600 italic border-l-4 border-blue-300">
                        "{r.decisionNote}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Right */}
                <div className="flex flex-col items-end gap-3">
                  <p className="text-xs text-slate-400 font-medium">{timeAgo(r.requestedAt)}</p>
                  <div className="flex items-center gap-2">
                    <Avatar name={r.requestedBy.name} size="sm" />
                    <span className="text-xs font-semibold text-slate-600">{r.requestedBy.name}</span>
                  </div>
                  <Button onClick={() => navigate(`/cases/${r.caseId}`)} className="mt-2">
                    {r.status === 'PENDING' ? 'Start Review' : r.status === 'IN_REVIEW' ? 'Continue' : 'View Details'}
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
