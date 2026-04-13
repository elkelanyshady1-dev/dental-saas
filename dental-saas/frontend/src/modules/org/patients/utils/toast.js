/**
 * toast.js — Lightweight global toast notification
 *
 * Usage:
 *   import { showToast } from '@/modules/org/patients/utils/toast';
 *   showToast('Patient created successfully', 'success');
 *
 * Creates a temporary DOM element that auto-dismisses.
 * Zero dependencies — no context providers needed.
 */

const TOAST_CONTAINER_ID = '__ds-toast-container';

function getContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        Object.assign(container.style, {
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: '99999',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
        });
        document.body.appendChild(container);
    }
    return container;
}

const VARIANTS = {
    success: {
        bg: 'linear-gradient(135deg, #059669, #10b981)',
        icon: '✓',
    },
    error: {
        bg: 'linear-gradient(135deg, #dc2626, #ef4444)',
        icon: '✕',
    },
    info: {
        bg: 'linear-gradient(135deg, #2563eb, #3b82f6)',
        icon: 'ℹ',
    },
};

export function showToast(message, variant = 'success', durationMs = 3500) {
    const container = getContainer();
    const config = VARIANTS[variant] || VARIANTS.info;

    const el = document.createElement('div');
    Object.assign(el.style, {
        background: config.bg,
        color: 'white',
        padding: '12px 20px',
        borderRadius: '14px',
        fontSize: '13px',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        transform: 'translateX(120%)',
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease',
        opacity: '0',
        pointerEvents: 'auto',
        maxWidth: '380px',
    });

    el.innerHTML = `
        <span style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;">
            ${config.icon}
        </span>
        <span>${message}</span>
    `;

    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
    });

    // Auto-dismiss
    setTimeout(() => {
        el.style.transform = 'translateX(120%)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 350);
    }, durationMs);
}
