import React from 'react'
import { Card, Icon, Badge, Avatar, Button } from '../../components/ui'
import { MOCK_SUPERVISOR, MOCK_CASES, getStageLabel } from '../../services/mockData'
import { useNavigate } from 'react-router-dom'

export default function Profile() {
  const navigate = useNavigate()
  const sup = MOCK_SUPERVISOR

  const expertise = ['Skeletal Correction', 'Clear Aligners', 'Class II Div 1', 'Digital Orthodontics']
  const education = [
    { school: 'Harvard School of Dental Medicine', degree: 'DMD', icon: 'history_edu' },
    { school: 'Mayo Clinic', degree: 'Residency', icon: 'school' },
  ]

  return (
    <>
      {/* Hero Header */}
      <div className="relative mb-12 flex flex-col md:flex-row items-start md:items-end gap-8 bg-white p-8 rounded-xl shadow-sm animate-fade-in">
        <div className="w-32 h-32 md:w-48 md:h-48 rounded-xl overflow-hidden shadow-xl shrink-0 -mt-16 md:-mt-24 border-4 border-white bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
          <Icon name="person" size="xl" className="text-blue-400 text-6xl" />
        </div>
        <div className="flex-grow flex flex-col md:flex-row justify-between items-start md:items-end gap-6 w-full">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="academic"><Icon name="school" size="sm" filled /> Academic</Badge>
              <span className="badge bg-blue-50 text-blue-700"><Icon name="verified" size="sm" filled /> Verified Supervisor</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-1">{sup.name}</h1>
            <p className="text-slate-500 font-medium text-lg">{sup.title}</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-3 text-slate-400 text-sm">
              <span className="flex items-center gap-1.5"><Icon name="domain" size="sm" /> {sup.institution}</span>
              <span className="flex items-center gap-1.5"><Icon name="location_on" size="sm" /> Rochester, MN</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button>Request Supervision</Button>
            <Button variant="secondary" className="flex items-center gap-2"><Icon name="mail" size="sm" /> Message</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">About</h3>
            <p className="text-slate-700 leading-relaxed text-sm">
              Specializing in complex skeletal malocclusions and clear aligner therapy protocols with over 15 years of academic oversight.
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Expertise</h3>
            <div className="flex flex-wrap gap-2">
              {expertise.map(e => (
                <span key={e} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-blue-700">
                  {e}
                </span>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Education</h3>
              <div className="space-y-3">
                {education.map(ed => (
                  <div key={ed.school} className="flex items-start gap-3">
                    <Icon name={ed.icon} className="text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{ed.school}</p>
                      <p className="text-xs text-slate-400">{ed.degree}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contact</h3>
              <div className="space-y-3">
                <a href={`mailto:${sup.email}`} className="flex items-center gap-3 text-sm font-medium text-blue-700 hover:underline">
                  <Icon name="alternate_email" className="text-slate-400" /> {sup.email}
                </a>
                <p className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <Icon name="call" className="text-slate-400" /> +1 (555) 012-3456
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Avg. Response</p>
              <div className="flex items-end gap-2">
                <h4 className="text-3xl font-extrabold text-blue-700">1.2</h4>
                <span className="text-blue-500 font-bold mb-1">Days</span>
              </div>
            </div>
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Active Cases</p>
              <div className="flex items-end gap-2">
                <h4 className="text-3xl font-extrabold text-indigo-700">4</h4>
                <span className="text-indigo-500 font-bold mb-1">Cases</span>
              </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Supervised</p>
              <div className="flex items-end gap-2">
                <h4 className="text-3xl font-extrabold text-slate-900">142</h4>
                <span className="text-slate-400 font-bold mb-1">Total</span>
              </div>
            </div>
          </div>

          {/* Active Cases */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-extrabold tracking-tight">Active Supervised Cases</h2>
              <button onClick={() => navigate('/cases')} className="text-blue-700 font-bold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                View All <Icon name="arrow_forward" size="sm" />
              </button>
            </div>
            <div className="space-y-4">
              {MOCK_CASES.slice(0, 3).map(access => {
                const c = access.caseId
                const stage = c.workflowData?.currentStep || 'DIAGNOSIS'
                const stageColors = {
                  DIAGNOSIS: 'bg-slate-100 text-slate-600',
                  TREATMENT_PLAN: 'bg-blue-50 text-blue-700',
                  PROGRESS: 'bg-amber-50 text-amber-700',
                  FINISHING: 'bg-green-50 text-green-700',
                }

                return (
                  <Card key={access._id} hover className="p-5 flex items-center justify-between border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-blue-600">
                        <Icon name="clinical_notes" size="lg" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400">CASE #{c._id.slice(-3)}</p>
                        <h4 className="text-lg font-bold text-slate-900">{c.patientId.name}</h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="hidden md:block text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${stageColors[stage]}`}>
                          {getStageLabel(stage)} Stage
                        </span>
                      </div>
                      <button onClick={() => navigate(`/cases/${c._id}`)} className="p-2 rounded-lg hover:bg-slate-50 transition-colors">
                        <Icon name="chevron_right" />
                      </button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
