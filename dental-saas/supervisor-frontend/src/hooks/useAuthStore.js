import { create } from 'zustand'

const useAuthStore = create((set) => ({
  supervisor: null,
  token: localStorage.getItem('supervisor_token') || null,
  isAuthenticated: !!localStorage.getItem('supervisor_token'),

  login: (token, supervisor) => {
    localStorage.setItem('supervisor_token', token)
    set({ token, supervisor, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('supervisor_token')
    set({ token: null, supervisor: null, isAuthenticated: false })
    window.location.href = '/supervisorlogin'
  },

  setSupervisor: (supervisor) => set({ supervisor }),
}))

export default useAuthStore
