import React, { useState } from 'react'
import { Card, Icon, Badge, Button, Avatar, EmptyState } from '../../components/ui'
import { MOCK_INVITATIONS, timeAgo } from '../../services/mockData'

export default function Invitations() {
  const [invitations, setInvitations] = useState(MOCK_INVITATIONS)

  const handleAccept = (id) => {
    setInvitations(prev => prev.map(inv =>
      inv._id === id ? { ...inv, status: 'ACCEPTED' } : inv
    ))
  }

  const handleDecline = (id) => {
    setInvitations(prev => prev.map(inv =>
      inv._id === id ? { ...inv, status: 'DECLINED' } : inv
    ))
  }

  const pending = invitations.filter(i => i.status === 'PENDING')
  const responded = invitations.filter(i => i.status !== 'PENDING')

  return (
    <>
      {/* Header */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <span>Management</span>
            <Icon name="chevron_right" size="sm" />
            <span className="text-blue-700">Invitations</span>
          </nav>
          <h1 className="text-4xl font-extrabold font-['Manrope'] text-slate-900 tracking-tight">Invitations</h1>
          <p className="text-slate-500 mt-2 italic">
            {pending.length > 0 ? `${pending.length} invitation${pending.length > 1 ? 's' : ''} awaiting your review` : 'All caught up!'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">Archive</Button>
          <Button variant="secondary">Filter</Button>
        </div>
      </div>

      {/* Pending Invitations Table */}
      {pending.length > 0 ? (
        <Card className="overflow-hidden mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-8 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Case Details</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Institution</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pending.map(inv => (
                <tr key={inv._id} className="group hover:bg-white transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                        #{inv.caseId._id.slice(-5)}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{inv.caseId.patientId.name}</p>
                        <p className="text-xs text-slate-400">{inv.caseId.caseType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <Avatar name={inv.invitedBy.name} size="sm" />
                      <span className="text-sm font-semibold text-slate-900">{inv.invitedBy.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-sm text-slate-600">{inv.institution}</td>
                  <td className="px-8 py-6">
                    <Badge variant="pending">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Pending
                    </Badge>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDecline(inv._id)}
                        className="px-4 py-2 text-slate-400 hover:text-red-600 text-xs font-bold uppercase transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAccept(inv._id)}
                        className="px-5 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-purple-700 transition-all active:scale-95"
                      >
                        Accept
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          icon="send"
          title="No pending invitations"
          description="You're all caught up. New clinical case submissions from students will appear here for your formal review."
          action={
            <button className="text-blue-700 font-bold text-sm flex items-center gap-2 group">
              View clinical guidelines
              <Icon name="arrow_forward" className="group-hover:translate-x-1 transition-transform" />
            </button>
          }
        />
      )}

      {/* Responded */}
      {responded.length > 0 && (
        <div className="mt-8">
          <h3 className="font-['Manrope'] font-bold text-lg text-slate-700 mb-4">Responded</h3>
          <div className="space-y-3">
            {responded.map(inv => (
              <Card key={inv._id} className="p-5 flex items-center justify-between opacity-70">
                <div className="flex items-center gap-4">
                  <Avatar name={inv.invitedBy.name} size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{inv.caseId.patientId.name} — {inv.caseId.caseType}</p>
                    <p className="text-xs text-slate-400">From {inv.invitedBy.name} · {inv.institution}</p>
                  </div>
                </div>
                <Badge variant={inv.status === 'ACCEPTED' ? 'approved' : 'rejected'}>
                  {inv.status}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Stats */}
      <div className="mt-20 grid grid-cols-12 gap-6">
        <div className="col-span-4 bg-white p-8 rounded-2xl border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="p-2 bg-blue-50 rounded-lg"><Icon name="history" className="text-blue-600" /></div>
            <span className="text-xs font-bold text-green-600">+12% vs last month</span>
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Average Response</p>
          <h4 className="text-3xl font-black font-['Manrope'] text-slate-900">4.2 <span className="text-sm font-medium text-slate-400">hours</span></h4>
        </div>
        <div className="col-span-4 bg-purple-50 p-8 rounded-2xl border border-purple-100">
          <div className="flex items-center justify-between mb-6">
            <div className="p-2 bg-purple-100 rounded-lg"><Icon name="group" className="text-purple-600" /></div>
            <span className="text-xs font-bold text-purple-600">Active Enrollment</span>
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Students Supervised</p>
          <h4 className="text-3xl font-black font-['Manrope'] text-slate-900">18 <span className="text-sm font-medium text-slate-400">active</span></h4>
        </div>
        <div className="col-span-4 bg-slate-900 p-8 rounded-2xl overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">Review Performance</p>
            <h4 className="text-3xl font-black font-['Manrope'] text-white">Excellent</h4>
          </div>
        </div>
      </div>
    </>
  )
}
