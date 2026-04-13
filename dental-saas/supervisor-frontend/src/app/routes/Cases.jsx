import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Icon, Badge, Button, Select, Avatar } from '../../components/ui'
import { MOCK_CASES, getStageLabel, getStatusColor, timeAgo } from '../../services/mockData'

export default function Cases() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ org: '', stage: '', status: '', student: '' })
  const cases = MOCK_CASES

  const orgs = [...new Set(cases.map(c => c.organization.name))]
  const students = [...new Set(cases.map(c => c.studentName))]

  const filtered = cases.filter(c => {
    if (filters.org && c.organization.name !== filters.org) return false
    if (filters.stage && c.caseId.workflowData?.currentStep !== filters.stage) return false
    if (filters.status && c.caseId.status !== filters.status) return false
    if (filters.student && c.studentName !== filters.student) return false
    return true
  })

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Clinical Cases</h1>
        <p className="text-slate-500 max-w-2xl">
          Manage and review orthodontic treatment plans across multiple organizations and educational institutions.
        </p>
      </header>

      {/* Filters */}
      <section className="mb-8 bg-slate-50 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Select label="Organization" value={filters.org} onChange={e => setFilters(f => ({ ...f, org: e.target.value }))}>
            <option value="">All Organizations</option>
            {orgs.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select label="Stage" value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}>
            <option value="">All Stages</option>
            <option value="DIAGNOSIS">Diagnosis</option>
            <option value="TREATMENT_PLAN">Treatment Plan</option>
            <option value="PROGRESS">Progress</option>
            <option value="FINISHING">Finishing</option>
          </Select>
          <Select label="Status" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </Select>
          <Select label="Student" value={filters.student} onChange={e => setFilters(f => ({ ...f, student: e.target.value }))}>
            <option value="">All Students</option>
            {students.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ org: '', stage: '', status: '', student: '' })}
              className="w-full h-[42px] bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Icon name="filter_list" size="sm" />
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Case ID</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Student / Institution</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Clinical Stage</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((access) => {
              const c = access.caseId
              const stage = c.workflowData?.currentStep || 'DIAGNOSIS'

              return (
                <tr key={access._id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-blue-700">#ORTHO-{c._id.slice(-3)}</span>
                      <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-3">
                      <Avatar name={access.studentName} />
                      <div>
                        <span className="font-bold text-sm text-slate-900">{access.studentName}</span>
                        <p className="text-xs text-slate-500">{access.organization.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{getStageLabel(stage)}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${c.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} />
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">
                          {c.status === 'completed' ? 'Approved by supervisor' : 'Instruction issued'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col gap-2 items-start">
                      <Badge variant={c.status === 'completed' ? 'approved' : 'pending'}>
                        {c.status === 'completed' ? 'Approved' : 'Pending Review'}
                      </Badge>
                      <Badge variant="academic">
                        <Icon name="school" size="sm" /> Academic
                      </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-right">
                    <Button onClick={() => navigate(`/cases/${c._id}`)}>View Case</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Pagination */}
      <footer className="mt-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs text-slate-500 font-medium">Instruction issued</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-slate-500 font-medium">Approved by supervisor</span>
          </div>
        </div>
        <div className="flex items-center bg-slate-100 rounded-xl p-1">
          <button className="p-2 hover:bg-white rounded-lg transition-colors"><Icon name="chevron_left" size="sm" /></button>
          <div className="flex px-4 gap-4">
            <span className="text-xs font-bold text-blue-700 underline underline-offset-4">1</span>
            <span className="text-xs font-bold text-slate-400">2</span>
            <span className="text-xs font-bold text-slate-400">3</span>
          </div>
          <button className="p-2 hover:bg-white rounded-lg transition-colors"><Icon name="chevron_right" size="sm" /></button>
        </div>
      </footer>
    </>
  )
}
