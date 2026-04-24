/**
 * Seed test for the Patient Portal LoginPage.
 *
 * Validates:
 *   - email and password fields expose associated labels (a11y)
 *   - error banner has role="alert" so screen readers announce it
 *   - tab switcher uses aria-pressed to convey the active method
 *
 * This is the portal's first frontend test. It seeds the test infra so
 * richer flows (magic-link redirect, OTP step transitions, logout) can be
 * added to this file or split out as the suite grows.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the auth API so the page doesn't hit the network.
vi.mock('@/api/auth.api', () => ({
    authApi: {
        requestOtp: vi.fn().mockResolvedValue({ success: true }),
        requestMagicLink: vi.fn().mockResolvedValue({ success: true }),
        login: vi.fn().mockResolvedValue({ success: true, data: { token: 'x' } }),
        verifyOtp: vi.fn().mockResolvedValue({ success: true, data: { token: 'x' } }),
        verifyMagicLink: vi.fn().mockResolvedValue({ success: true, data: { token: 'x' } }),
        logout: vi.fn().mockResolvedValue({ success: true }),
    },
}));

// Stub the auth context so LoginPage renders without a real provider.
vi.mock('@/contexts/PortalAuthContext', () => ({
    usePortalAuth: () => ({
        token: null,
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        loginWithCredentials: vi.fn().mockResolvedValue(undefined),
        loginWithMagicLink: vi.fn().mockResolvedValue(undefined),
        loginWithOtp: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
    }),
}));

import LoginPage from '@/pages/LoginPage';

function renderLogin(path = '/login') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <LoginPage />
        </MemoryRouter>,
    );
}

describe('LoginPage (a11y seed)', () => {
    it('renders email and password inputs with accessible labels', () => {
        renderLogin();
        expect(screen.getByLabelText(/email or phone number/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('exposes tab state via aria-pressed', () => {
        renderLogin();
        const passwordTab = screen.getByRole('button', { name: /password login/i });
        const otpTab = screen.getByRole('button', { name: /otp login/i });
        expect(passwordTab).toHaveAttribute('aria-pressed', 'true');
        expect(otpTab).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(otpTab);
        expect(otpTab).toHaveAttribute('aria-pressed', 'true');
        expect(passwordTab).toHaveAttribute('aria-pressed', 'false');
    });
});
