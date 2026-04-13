import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Icon, Badge, Button, Avatar } from '../../components/ui'
import { MOCK_CASES, MOCK_REVIEWS, MOCK_COMMENTS, getStageLabel, timeAgo } from '../../services/mockData'

const STAGES = ['DIAGNOSIS', 'TREATMENT_PLAN', 'PROGRESS', 'FINISHING']

function StageTimeline({ activeStage }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {STAGES.map((s, i) => {
        const isActive = s === activeStage
        const isPast = STAGES.indexOf(activeStage) > i
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                  isPast ? 'bg-green-500 text-white' :
                  'bg-slate-100 text-slate-400'}`}
              >
                {isPast ? <Icon name="check" size="sm" /> : i + 1}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider text-center leading-tight
                ${isActive ? 'text-blue-700' : isPast ? 'text-green-600' : 'text-slate-400'}`}
              >
                {getStageLabel(s)}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-4 ${isPast ? 'bg-green-300' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function CommentThread({ comments }) {
  return (
    <div className="space-y-4">
      {comments.map(c => (
        <div key={c._id} className={`flex gap-3 animate-fade-in ${c.authorType === 'SUPERVISOR' ? 'flex-row-reverse' : ''}`}>
          <Avatar name={c.authorName} size="sm" />
          <div className={`flex-1 max-w-[85%] ${c.authorType === 'SUPERVISOR' ? 'text-right' : ''}`}>
            <div className={`inline-block rounded-xl p-4 text-sm leading-relaxed
              ${c.authorType === 'SUPERVISOR'
                ? 'bg-blue-50 text-blue-900 rounded-tr-sm'
                : 'bg-slate-50 text-slate-800 rounded-tl-sm'}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-bold text-xs">{c.authorName}</span>
                <Badge variant={c.type === 'QUESTION' ? 'revision' : c.type === 'INSTRUCTION' ? 'academic' : 'pending'}>
                  {c.type}
                </Badge>
              </div>
              <p>{c.content}</p>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">{timeAgo(c.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewPanel({ review, comments, onDecision }) {
  const [newComment, setNewComment] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [showDecision, setShowDecision] = useState(false)

  return (
    <Card className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-['Manrope'] font-extrabold text-lg text-slate-900 flex items-center gap-2">
            <Icon name="rate_review" className="text-blue-600" />
            Review Panel
          </h3>
          {review && (
            <Badge variant={review.status === 'APPROVED' ? 'approved' : review.status === 'REJECTED' ? 'rejected' : 'pending'}>
              {review.status.replace('_', ' ')}
            </Badge>
          )}
        </div>
        {review && (
          <p className="text-xs text-slate-500">
            Stage: <strong>{getStageLabel(review.stageType)}</strong> · Submitted {timeAgo(review.requestedAt)}
          </p>
        )}
      </div>

      {/* Comments Thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-96">
        {comments.length > 0 ? (
          <CommentThread comments={comments} />
        ) : (
          <div className="text-center py-12">
            <Icon name="chat_bubble_outline" size="xl" className="text-slate-200 mb-3" />
            <p className="text-sm text-slate-400 font-medium">No comments yet</p>
            <p className="text-xs text-slate-300">Start the review by leaving feedback</p>
          </div>
        )}
      </div>

      {/* Comment Input */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a clinical comment..."
            className="flex-1 bg-slate-50 border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <button className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
            <Icon name="send" />
          </button>
        </div>
      </div>

      {/* Decision Actions */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        {!showDecision ? (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowDecision(true); }}
              className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl text-sm hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Icon name="check_circle" size="sm" /> Approve
            </button>
            <button
              onClick={() => { setShowDecision(true); }}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Icon name="edit_note" size="sm" /> Request Changes
            </button>
            <button
              onClick={() => { setShowDecision(true); }}
              className="py-3 px-4 bg-red-50 text-red-600 font-bold rounded-xl text-sm hover:bg-red-100 transition-all active:scale-95"
            >
              <Icon name="cancel" size="sm" />
            </button>
          </div>
        ) : (
          <div className="space-y-3 animate-slide-up">
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Add decision notes (required)..."
              rows={3}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={() => setShowDecision(false)} variant="secondary" className="flex-1">Cancel</Button>
              <Button className="flex-1">Confirm Decision</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function CaseDetails() {
  const { caseId } = useParams()
  const navigate = useNavigate()

  const access = MOCK_CASES.find(c => c.caseId._id === caseId) || MOCK_CASES[0]
  const c = access.caseId
  const stage = c.workflowData?.currentStep || 'DIAGNOSIS'
  const reviews = MOCK_REVIEWS.filter(r => r.caseId === c._id)
  const currentReview = reviews[0] || MOCK_REVIEWS[0]
  const comments = MOCK_COMMENTS

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
        <button onClick={() => navigate('/cases')} className="hover:text-blue-600 transition-colors">Cases</button>
        <Icon name="chevron_right" size="sm" />
        <span className="text-blue-700">Case #{c._id.slice(-3)}</span>
      </nav>

      <div className="grid grid-cols-12 gap-8">
        {/* LEFT: Case Info */}
        <div className="col-span-5 space-y-6">
          {/* Patient Info */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <Badge variant="academic" className="mb-3">
                  <Icon name="school" size="sm" /> Academic Case
                </Badge>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
                  {c.patientId.name}
                </h1>
                <p className="text-sm text-slate-500">{c.caseType} · {c.malocclusionClass}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Case ID</p>
                <p className="font-mono text-sm font-bold text-blue-700">#ORTHO-{c._id.slice(-3)}</p>
              </div>
            </div>

            {/* Student & Institution */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Student</p>
                <div className="flex items-center gap-3">
                  <Avatar name={access.studentName} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{access.studentName}</p>
                    <p className="text-xs text-slate-500">{access.studentYear}</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Institution</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Icon name="account_balance" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{access.organization.name}</p>
                    <p className="text-xs text-slate-500">{access.organization.country}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="border-t border-slate-100 pt-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Case Progress</p>
              <StageTimeline activeStage={stage} />
            </div>
          </Card>

          {/* Uploaded Records (Mock) */}
          <Card className="p-6">
            <h3 className="font-['Manrope'] font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Icon name="folder_open" className="text-blue-600" />
              Clinical Records
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {['Cephalometric Analysis', 'Panoramic X-Ray', 'Intraoral Photos', 'Study Models'].map(doc => (
                <div key={doc} className="bg-slate-50 rounded-lg p-3 flex items-center gap-3 hover:bg-slate-100 transition-colors cursor-pointer group">
                  <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-500">
                    <Icon name="description" size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{doc}</p>
                    <p className="text-[10px] text-slate-400">PDF · 2.4 MB</p>
                  </div>
                  <Icon name="download" size="sm" className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              ))}
            </div>
          </Card>

          {/* Review History */}
          <Card className="p-6">
            <h3 className="font-['Manrope'] font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Icon name="history" className="text-blue-600" />
              Review History
            </h3>
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r._id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                      ${r.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                        r.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        r.status === 'IN_REVIEW' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'}`}
                    >
                      <Icon name={r.status === 'APPROVED' ? 'check' : r.status === 'REJECTED' ? 'close' : 'schedule'} size="sm" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{getStageLabel(r.stageType)} Review</p>
                      <p className="text-xs text-slate-400">#{r.stageNumber} · {timeAgo(r.requestedAt)}</p>
                    </div>
                  </div>
                  <Badge variant={r.status === 'APPROVED' ? 'approved' : r.status === 'REJECTED' ? 'rejected' : r.status === 'IN_REVIEW' ? 'revision' : 'pending'}>
                    {r.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT: Review Panel */}
        <div className="col-span-7">
          <ReviewPanel review={currentReview} comments={comments} />
        </div>
      </div>
    </>
  )
}
