import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './app/layout/AppLayout'
import Dashboard from './app/routes/Dashboard'
import Cases from './app/routes/Cases'
import CaseDetails from './app/routes/CaseDetails'
import Invitations from './app/routes/Invitations'
import Reviews from './app/routes/Reviews'
import Profile from './app/routes/Profile'
import Settings from './app/routes/Settings'
import Login from './app/routes/Login'
import Signup from './app/routes/Signup'
import useAuthStore from './hooks/useAuthStore'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/supervisorlogin" replace />
  return <AppLayout>{children}</AppLayout>
}

function GuestRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Auth Routes (no layout) */}
      <Route path="/supervisorlogin" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/supervisorsignup" element={<GuestRoute><Signup /></GuestRoute>} />

      {/* Protected Routes (with layout) */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
      <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetails /></ProtectedRoute>} />
      <Route path="/invitations" element={<ProtectedRoute><Invitations /></ProtectedRoute>} />
      <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
