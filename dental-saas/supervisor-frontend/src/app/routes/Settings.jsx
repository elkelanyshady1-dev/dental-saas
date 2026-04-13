import React from 'react'
import { Card, Icon, Input, Button } from '../../components/ui'
import { MOCK_SUPERVISOR } from '../../services/mockData'

export default function Settings() {
  const sup = MOCK_SUPERVISOR

  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold font-['Manrope'] text-slate-900 tracking-tight mb-2">Settings</h1>
        <p className="text-slate-500">Manage your account preferences and notifications.</p>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* Profile Settings */}
        <Card className="p-8">
          <h2 className="font-['Manrope'] font-bold text-lg text-slate-900 mb-6 flex items-center gap-2">
            <Icon name="person" className="text-blue-600" />
            Profile Information
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <Input label="Full Name" id="name" defaultValue={sup.name} icon="person" />
            <Input label="Email" id="email" defaultValue={sup.email} icon="mail" type="email" />
            <Input label="Title" id="title" defaultValue={sup.title} icon="badge" />
            <Input label="Institution" id="institution" defaultValue={sup.institution} icon="account_balance" />
          </div>
          <div className="mt-6 flex justify-end">
            <Button>Save Changes</Button>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card className="p-8">
          <h2 className="font-['Manrope'] font-bold text-lg text-slate-900 mb-6 flex items-center gap-2">
            <Icon name="notifications" className="text-blue-600" />
            Notification Preferences
          </h2>
          <div className="space-y-4">
            {[
              { label: 'New case invitations', desc: 'When a student invites you to supervise a case', key: 'invitations' },
              { label: 'Review submissions', desc: 'When a student submits a stage for review', key: 'reviews' },
              { label: 'Comment replies', desc: 'When someone replies to your comments', key: 'comments' },
              { label: 'Decision confirmations', desc: 'When your approval or revision request is acknowledged', key: 'decisions' },
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-none">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{n.label}</p>
                  <p className="text-xs text-slate-400">{n.desc}</p>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>
            ))}
          </div>
        </Card>

        {/* Security */}
        <Card className="p-8">
          <h2 className="font-['Manrope'] font-bold text-lg text-slate-900 mb-6 flex items-center gap-2">
            <Icon name="security" className="text-blue-600" />
            Security
          </h2>
          <div className="space-y-6">
            <Input label="Current Password" id="current-password" type="password" icon="lock" placeholder="••••••••" />
            <div className="grid grid-cols-2 gap-6">
              <Input label="New Password" id="new-password" type="password" icon="lock" placeholder="••••••••" />
              <Input label="Confirm Password" id="confirm-password" type="password" icon="lock" placeholder="••••••••" />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary">Cancel</Button>
            <Button>Update Password</Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-8 border border-red-100">
          <h2 className="font-['Manrope'] font-bold text-lg text-red-700 mb-2 flex items-center gap-2">
            <Icon name="warning" className="text-red-500" />
            Danger Zone
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Once you delete your account, there is no going back. All your review history will be permanently removed.
          </p>
          <Button variant="danger">Delete Account</Button>
        </Card>
      </div>
    </>
  )
}
