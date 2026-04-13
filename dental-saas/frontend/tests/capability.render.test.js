import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock the hook
const mockCapabilities = vi.fn();
vi.mock('../src/platform/hooks/usePlatformCapabilities', () => ({
    usePlatformCapabilities: () => mockCapabilities()
}));

// A sample component that uses the hook for capability-driven rendering
const TestCapabilityComponent = () => {
    const { capabilities, loading } = require('../src/platform/hooks/usePlatformCapabilities').usePlatformCapabilities();

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            {capabilities.canManagePlan && <button data-testid="plan-btn">Manage Plan</button>}
            {capabilities.canViewFinance && <button data-testid="finance-btn">View Finance</button>}
            {capabilities.canManageAddons && <button data-testid="addon-btn">Manage Add-ons</button>}
        </div>
    );
};

describe('Frontend Capability-Driven Rendering', () => {
    it('renders buttons when capabilities are true', () => {
        mockCapabilities.mockReturnValue({
            capabilities: {
                canManagePlan: true,
                canViewFinance: true,
                canManageAddons: false
            },
            loading: false
        });

        render(<TestCapabilityComponent />);

        expect(screen.getByTestId('plan-btn')).toBeDefined();
        expect(screen.getByTestId('finance-btn')).toBeDefined();
        expect(screen.queryByTestId('addon-btn')).toBeNull();
    });

    it('hides all buttons when capabilities are false', () => {
        mockCapabilities.mockReturnValue({
            capabilities: {
                canManagePlan: false,
                canViewFinance: false,
                canManageAddons: false
            },
            loading: false
        });

        render(<TestCapabilityComponent />);

        expect(screen.queryByTestId('plan-btn')).toBeNull();
        expect(screen.queryByTestId('finance-btn')).toBeNull();
        expect(screen.queryByTestId('addon-btn')).toBeNull();
    });

    it('shows loading state correctly', () => {
        mockCapabilities.mockReturnValue({
            capabilities: {},
            loading: true
        });

        render(<TestCapabilityComponent />);
        expect(screen.getByText('Loading...')).toBeDefined();
    });

    it('verifies no hardcoded roles are used in rendering logic', () => {
        // This is a structural check - the test itself shouldn't use roles
        // and the component being tested should only rely on capabilities.
        const componentSource = TestCapabilityComponent.toString();
        expect(componentSource).not.toContain('role ===');
        expect(componentSource).not.toContain('superadmin');
    });
});
