import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1/supervisor',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supervisor_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('supervisor_token')
      window.location.href = '/supervisorlogin'
    }
    return Promise.reject(err)
  }
)

export default api
