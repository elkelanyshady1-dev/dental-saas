import React from 'react'

export function Icon({ name, filled, className = '', size }) {
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : size === 'xl' ? 'text-3xl' : ''
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'material-filled' : ''} ${sizeClass} ${className}`}
    >
      {name}
    </span>
  )
}

export function Badge({ children, variant = 'academic', className = '' }) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    variant === 'primary' ? 'btn-primary' :
    variant === 'secondary' ? 'btn-secondary' :
    variant === 'danger' ? 'btn-danger' :
    variant === 'gradient' ? 'btn-gradient' : 'btn-primary'
  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`bg-white rounded-xl ${hover ? 'hover:shadow-md transition-shadow' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Input({ label, icon, className = '', id, ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon name={icon} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
        )}
        <input
          id={id}
          className={`input-field ${icon ? 'pl-12' : ''}`}
          {...props}
        />
      </div>
    </div>
  )
}

export function Select({ label, icon, children, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      )}
      <div className="relative">
        <select
          className="w-full bg-white border-none rounded-lg text-sm py-2.5 focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none px-4"
          {...props}
        >
          {children}
        </select>
        <Icon name="expand_more" className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
        <Icon name={icon} size="xl" className="text-slate-300" />
      </div>
      <h3 className="text-lg font-extrabold text-slate-800 mb-2">{title}</h3>
      <p className="text-slate-500 text-sm max-w-md mb-6">{description}</p>
      {action}
    </div>
  )
}

export function Stat({ label, value, suffix, icon, accentClass = '' }) {
  return (
    <div className="stat-card">
      <div className="flex justify-between items-start">
        <Icon name={icon} size="xl" className={`text-blue-600 ${accentClass}`} />
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
        <p className="text-3xl font-black font-['Manrope'] text-slate-900">
          {value}
          {suffix && <span className="text-sm font-medium text-slate-400 ml-1">{suffix}</span>}
        </p>
      </div>
    </div>
  )
}

export function Avatar({ name, size = 'md', src, className = '' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-[10px]' : size === 'md' ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm'
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const colors = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-green-100 text-green-700', 'bg-amber-100 text-amber-700']
  const color = colors[name?.length % colors.length || 0]

  if (src) {
    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover ${className}`} />
  }
  return (
    <div className={`${sizeClass} rounded-full ${color} flex items-center justify-center font-bold ${className}`}>
      {initials}
    </div>
  )
}
