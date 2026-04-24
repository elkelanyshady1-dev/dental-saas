/**
 * platformStore.js
 * v11.1 Sovereign Governance — Isolated State Management
 */

import { create } from 'zustand';
import { persist, createJSONStorage, devtools } from 'zustand/middleware';

/**
 * usePlatformStore
 * Dedicated store for the platform governance shell.
 * Zero cross-imports with the organization store.
 */
export const usePlatformStore = create(
    devtools(
        persist(
            (set) => ({
                user: null,
                isAuthenticated: false,
                capabilities: {},

                // Governance State
                users: [],
                organizations: [],
                selectedUser: null,
                loading: false,
                error: null,

                setAuth: (user, capabilities) => set({
                    user,
                    isAuthenticated: true,
                    capabilities
                }),

                // Governance Actions
                setLoading: (loading) => set({ loading }),
                setError: (error) => set({ error, loading: false }),

                setUsers: (users) => set({ users, loading: false }),
                setOrganizations: (organizations) => set({ organizations, loading: false }),
                setSelectedUser: (selectedUser) => set({ selectedUser }),

                logout: () => {
                    localStorage.removeItem('platform_token');
                    set({
                        user: null,
                        isAuthenticated: false,
                        capabilities: {},
                        users: [],
                        organizations: []
                    });
                    window.location.href = '/platform/login';
                },
            }),
            {
                name: 'dental-saas-platform-sovereignty', // Unique key for segregation
                storage: createJSONStorage(() => localStorage),
            }
        ),
        { name: 'OrthoNoe_PlatformStore' } // 🛡️ v11.1 - DevTools Isolation
    )
);
