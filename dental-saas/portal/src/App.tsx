/**
 * App.tsx
 * Patient Portal — Root Application Component
 *
 * Wraps the app with:
 *  - PortalAuthProvider (auth context)
 *  - QueryClientProvider (React Query)
 *  - AppRouter (all routes)
 *
 * ─── React Query Config ──────────────────────────────────────────
 *   retry: 2 for queries, 0 for mutations
 *   staleTime: 30s default
 *   refetchOnWindowFocus: false (explicit user control)
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalAuthProvider } from '@/contexts/PortalAuthContext';
import AppRouter from '@/app/router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <PortalAuthProvider>
      <AppRouter />
    </PortalAuthProvider>
  </QueryClientProvider>
);

export default App;
